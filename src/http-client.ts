import { connect as connectTcp } from "node:net";
import type { Logger } from "pino";
import {
  Agent,
  EnvHttpProxyAgent,
  fetch as undiciFetch,
  setGlobalDispatcher,
  type Dispatcher
} from "undici";
import { config } from "./config";

const DEFAULT_NO_PROXY = "localhost,127.0.0.1,backend-api,postgres,redis,rabbitmq,minio";
const connectTimeoutMs = Math.max(config.REQUEST_TIMEOUT_MS, 15_000);
const TRANSPORT_ERROR_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ETIMEDOUT"
]);

let configured = false;
let transportLogger: Logger | null = null;
let proxyConfigured = false;
let proxyDispatcher: Dispatcher | null = null;
let directDispatcher: Dispatcher = new Agent({
  connect: { timeout: connectTimeoutMs }
});
let resolvedNoProxy = config.NO_PROXY ?? DEFAULT_NO_PROXY;

export async function fetch(
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1]
) {
  const requestUrl = extractRequestUrl(input);
  const customDispatcher = init?.dispatcher;
  if (customDispatcher) {
    return undiciFetch(input, init);
  }

  const shouldUseDirectFirst =
    !proxyConfigured ||
    !proxyDispatcher ||
    (requestUrl ? shouldBypassProxyForUrl(requestUrl, resolvedNoProxy) : false);

  const primaryDispatcher = shouldUseDirectFirst ? directDispatcher : (proxyDispatcher as Dispatcher);

  try {
    return await undiciFetch(input, withDispatcher(init, primaryDispatcher));
  } catch (error) {
    if (shouldUseDirectFirst || !proxyDispatcher || !shouldRetryDirectConnection(error)) {
      throw error;
    }

    transportLogger?.warn(
      {
        err: error,
        url: requestUrl,
        proxyTarget: sanitizeProxyUrl(config.HTTPS_PROXY ?? config.HTTP_PROXY)
      },
      "request via configured proxy failed; retrying direct connection"
    );

    try {
      return await undiciFetch(input, withDispatcher(init, directDispatcher));
    } catch (directError) {
      throw createProxyFallbackError(requestUrl ?? "unknown target", error, directError);
    }
  }
}

export function configureHttpTransport(logger: Logger) {
  if (configured) {
    return;
  }

  transportLogger = logger;
  proxyConfigured = Boolean(config.HTTP_PROXY || config.HTTPS_PROXY);
  resolvedNoProxy = config.NO_PROXY ?? DEFAULT_NO_PROXY;
  directDispatcher = new Agent({
    connect: { timeout: connectTimeoutMs }
  });
  proxyDispatcher = proxyConfigured
    ? new EnvHttpProxyAgent({
        connect: { timeout: connectTimeoutMs },
        httpProxy: config.HTTP_PROXY,
        httpsProxy: config.HTTPS_PROXY,
        noProxy: resolvedNoProxy
      })
    : null;

  setGlobalDispatcher(directDispatcher);
  configured = true;

  logger.info(
    {
      proxyConfigured,
      httpProxyConfigured: Boolean(config.HTTP_PROXY),
      httpsProxyConfigured: Boolean(config.HTTPS_PROXY),
      httpProxyTarget: sanitizeProxyUrl(config.HTTP_PROXY),
      httpsProxyTarget: sanitizeProxyUrl(config.HTTPS_PROXY),
      noProxy: proxyConfigured ? resolvedNoProxy : undefined,
      connectTimeoutMs,
      requestTimeoutMs: config.REQUEST_TIMEOUT_MS
    },
    "outbound http transport configured"
  );
}

export function describeOutboundHttpError(error: unknown, url: string): Error {
  if (!(error instanceof Error)) {
    return new Error(`Request to ${url} failed`);
  }

  if (isUserFacingTransportError(error.message)) {
    return error;
  }

  const cause = error.cause as { code?: string; message?: string } | undefined;
  const errorCode = getErrorCode(error);
  const errorName = error.name;
  const message = error.message || cause?.message || "Request failed";
  const host = safeGetHost(url);
  const proxyTarget = sanitizeProxyUrl(config.HTTPS_PROXY ?? config.HTTP_PROXY);
  const proxyHint =
    config.HTTP_PROXY || config.HTTPS_PROXY
      ? `Проверьте доступность настроенного proxy${proxyTarget ? ` (${proxyTarget})` : ""} и его маршрут до целевого сайта.`
      : "Настройте HTTPS_PROXY/HTTP_PROXY для выхода к ограниченным внешним площадкам.";

  if (
    errorCode === "UND_ERR_CONNECT_TIMEOUT" ||
    /connect timeout/i.test(message) ||
    errorName === "TimeoutError" ||
    /aborted due to timeout/i.test(message)
  ) {
    return new Error(
      `Запрос к ${host} не получил ответа в пределах ${config.REQUEST_TIMEOUT_MS} мс. ${proxyHint} Исходная ошибка: ${message}`
    );
  }

  if (shouldRetryDirectConnection(error)) {
    return new Error(
      `Запрос к ${host} завершился сетевой ошибкой. ${proxyHint} Исходная ошибка: ${formatTransportError(error)}`
    );
  }

  return error;
}

export async function probeOutboundProxy(logger: Logger): Promise<void> {
  const proxyUrl = config.HTTPS_PROXY ?? config.HTTP_PROXY;
  if (!proxyUrl) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(proxyUrl);
  } catch {
    logger.error({ proxyUrl }, "configured outbound proxy url is invalid");
    return;
  }

  const host = parsed.hostname;
  const port =
    parsed.port.length > 0 ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;

  if (!host || Number.isNaN(port) || port <= 0) {
    logger.error({ proxyUrl }, "configured outbound proxy address is invalid");
    return;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const socket = connectTcp({ host, port });
      const timeoutMs = Math.min(config.REQUEST_TIMEOUT_MS, 5_000);

      socket.setTimeout(timeoutMs);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("timeout", () => {
        socket.destroy();
        reject(new Error(`timeout after ${timeoutMs} ms`));
      });
      socket.once("error", (error) => {
        socket.destroy();
        reject(error);
      });
    });

    logger.info(
      { proxyTarget: sanitizeProxyUrl(proxyUrl) },
      "configured outbound proxy is reachable"
    );
  } catch (error) {
    logger.error(
      {
        err: error,
        proxyTarget: sanitizeProxyUrl(proxyUrl)
      },
      "configured outbound proxy is unreachable; external source fetches are likely to fail"
    );
  }
}

export function shouldBypassProxyForUrl(url: string, noProxy: string | undefined): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }

  const hostname = target.hostname.toLowerCase();
  const hostWithPort = target.port ? `${hostname}:${target.port}` : hostname;
  const entries = (noProxy ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  for (const entry of entries) {
    if (entry === "*") {
      return true;
    }

    const normalized = entry.replace(/^\./, "");

    if (normalized.includes(":")) {
      if (hostWithPort === normalized) {
        return true;
      }
      continue;
    }

    if (hostname === normalized || hostname.endsWith(`.${normalized}`)) {
      return true;
    }
  }

  return false;
}

export function shouldRetryDirectConnection(error: unknown): boolean {
  const code = getErrorCode(error);
  const message = error instanceof Error ? error.message : String(error ?? "");

  return (
    (code ? TRANSPORT_ERROR_CODES.has(code) : false) ||
    /fetch failed/i.test(message) ||
    /connect timeout/i.test(message) ||
    /timed out/i.test(message) ||
    /network is unreachable/i.test(message) ||
    /connection refused/i.test(message) ||
    /socket/i.test(message)
  );
}

function safeGetHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function sanitizeProxyUrl(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return value;
  }
}

function withDispatcher(
  init: Parameters<typeof undiciFetch>[1] | undefined,
  dispatcher: Dispatcher
): NonNullable<Parameters<typeof undiciFetch>[1]> {
  return {
    ...(init ?? {}),
    dispatcher
  };
}

function extractRequestUrl(input: Parameters<typeof undiciFetch>[0]): string | undefined {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  if (typeof input === "object" && input !== null && "url" in input) {
    const url = (input as { url?: unknown }).url;
    return typeof url === "string" ? url : undefined;
  }

  return undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const directCode = (error as { code?: string }).code;
  if (typeof directCode === "string" && directCode.length > 0) {
    return directCode;
  }

  const cause = error.cause as { code?: string } | undefined;
  if (typeof cause?.code === "string" && cause.code.length > 0) {
    return cause.code;
  }

  return undefined;
}

function formatTransportError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "unknown transport error";
  }

  const code = getErrorCode(error);
  return code ? `${error.message} (${code})` : error.message;
}

function createProxyFallbackError(
  url: string,
  proxyError: unknown,
  directError: unknown
): Error {
  const host = safeGetHost(url);
  const proxyTarget = sanitizeProxyUrl(config.HTTPS_PROXY ?? config.HTTP_PROXY);
  const proxyLabel = proxyTarget ? ` через proxy ${proxyTarget}` : " через настроенный proxy";

  return new Error(
    `Запрос к ${host}${proxyLabel} завершился сетевой ошибкой, и повторная попытка напрямую тоже не удалась. Ошибка proxy-маршрута: ${formatTransportError(proxyError)}. Ошибка прямого подключения: ${formatTransportError(directError)}`
  );
}

function isUserFacingTransportError(message: string): boolean {
  return /^Запрос к .+/.test(message);
}

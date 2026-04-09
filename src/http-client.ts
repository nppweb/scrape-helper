import { connect as connectTcp } from "node:net";
import type { Logger } from "pino";
import { Agent, EnvHttpProxyAgent, fetch as undiciFetch, setGlobalDispatcher } from "undici";
import { config } from "./config";

const DEFAULT_NO_PROXY = "localhost,127.0.0.1,backend-api,postgres,redis,rabbitmq,minio";
const connectTimeoutMs = Math.max(config.REQUEST_TIMEOUT_MS, 15_000);

let configured = false;

export const fetch = undiciFetch;

export function configureHttpTransport(logger: Logger) {
  if (configured) {
    return;
  }

  const proxyConfigured = Boolean(config.HTTP_PROXY || config.HTTPS_PROXY);
  const dispatcher = proxyConfigured
    ? new EnvHttpProxyAgent({
        connect: { timeout: connectTimeoutMs },
        httpProxy: config.HTTP_PROXY,
        httpsProxy: config.HTTPS_PROXY,
        noProxy: config.NO_PROXY ?? DEFAULT_NO_PROXY
      })
    : new Agent({
        connect: { timeout: connectTimeoutMs }
      });

  setGlobalDispatcher(dispatcher);
  configured = true;

  logger.info(
    {
      proxyConfigured,
      httpProxyConfigured: Boolean(config.HTTP_PROXY),
      httpsProxyConfigured: Boolean(config.HTTPS_PROXY),
      httpProxyTarget: sanitizeProxyUrl(config.HTTP_PROXY),
      httpsProxyTarget: sanitizeProxyUrl(config.HTTPS_PROXY),
      noProxy: proxyConfigured ? config.NO_PROXY ?? DEFAULT_NO_PROXY : undefined,
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

  const cause = error.cause as { code?: string; message?: string } | undefined;
  const errorCode = (error as { code?: string }).code ?? cause?.code;
  const errorName = error.name;
  const message = error.message || cause?.message || "Request failed";

  if (
    errorCode === "UND_ERR_CONNECT_TIMEOUT" ||
    /connect timeout/i.test(message) ||
    errorName === "TimeoutError" ||
    /aborted due to timeout/i.test(message)
  ) {
    const host = safeGetHost(url);
    const proxyTarget = sanitizeProxyUrl(config.HTTPS_PROXY ?? config.HTTP_PROXY);
    const proxyHint =
      config.HTTP_PROXY || config.HTTPS_PROXY
        ? `Проверьте доступность настроенного proxy${proxyTarget ? ` (${proxyTarget})` : ""} и его маршрут до целевого сайта.`
        : "Настройте HTTPS_PROXY/HTTP_PROXY для выхода к ограниченным внешним площадкам.";

    return new Error(
      `Запрос к ${host} не получил ответа в пределах ${config.REQUEST_TIMEOUT_MS} мс. ${proxyHint} Исходная ошибка: ${message}`
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

import { setTimeout as delay } from "node:timers/promises";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { Logger } from "pino";
import { config } from "./config";
import { configureHttpTransport, fetch, probeOutboundProxy } from "./http-client";
import { logger } from "./logger";
import { S3ArtifactStore } from "./artifacts/s3-artifact-store";
import { createRawEventValidator } from "./contracts/raw-event-validator";
import { RawPublisher } from "./messaging/raw-publisher";
import type { SourceAdapter } from "./sources/adapter";
import type { ArtifactDraft, ArtifactRef, RawSourceEvent } from "./types";
import { resolveEnabledSources, SUPPORTED_SOURCE_CODES } from "./sources";
import { withRetries } from "./utils/retry";

const publisher = new RawPublisher(config.RABBITMQ_URL, config.QUEUE_RAW_EVENT);
const validateRaw = createRawEventValidator(config.SHARED_CONTRACTS_DIR);
const artifactStore = new S3ArtifactStore(
  config.S3_BUCKET,
  config.S3_ENDPOINT,
  config.S3_REGION,
  config.S3_ACCESS_KEY,
  config.S3_SECRET_KEY,
  config.S3_FORCE_PATH_STYLE
);
const resolvedSources = resolveEnabledSources(config);
const adapters: SourceAdapter[] = resolvedSources.adapters;
const adaptersByCode = new Map(adapters.map((adapter) => [adapter.code, adapter] as const));

const circuitState = new Map<string, { failures: number; openUntil?: number }>();
const runningSources = new Set<string>();
let running = false;
let runtimeConfig = {
  schedule: config.SCRAPE_SCHEDULE,
  autoRunEnabled: true
};
let scheduledTask: ReturnType<typeof cron.schedule> | null = null;

async function runAdapter(
  adapter: SourceAdapter,
  options?: {
    runKey?: string;
    collectedAt?: string;
    trigger?: "schedule" | "manual";
  }
): Promise<void> {
  if (runningSources.has(adapter.code)) {
    logger.warn({ source: adapter.code }, "source run skipped because source is already executing");
    return;
  }

  const state = circuitState.get(adapter.code);
  if (state?.openUntil && state.openUntil > Date.now()) {
    logger.warn(
      { source: adapter.code, failures: state.failures, openUntil: state.openUntil },
      "circuit breaker is open"
    );
    return;
  }

  const collectedAt = options?.collectedAt ?? new Date().toISOString();
  const runKey = options?.runKey ?? `${adapter.code}-${collectedAt}`;
  const childLogger = logger.child({
    source: adapter.code,
    runKey,
    trigger: options?.trigger ?? "schedule"
  });

  runningSources.add(adapter.code);

  try {
    await reportSourceRunState({
      sourceCode: adapter.code,
      runKey,
      status: "RUNNING",
      startedAt: collectedAt
    }, childLogger);

    childLogger.info({ sourceName: adapter.name }, "source run started");

    const records = await withRetries(
      () =>
        adapter.collect({
          runKey,
          collectedAt,
          requestTimeoutMs: config.REQUEST_TIMEOUT_MS,
          logger: childLogger
        }),
      config.RETRY_ATTEMPTS,
      config.RETRY_BASE_DELAY_MS,
      {
        onRetry: async ({ attempt, maxAttempts, delayMs, error }) => {
          childLogger.warn(
            {
              attempt,
              maxAttempts,
              delayMs,
              err: error
            },
            "source collect attempt failed; retry scheduled"
          );
        }
      }
    );

    childLogger.info({ itemsCollected: records.length }, "items collected");

    for (const [itemIndex, record] of records.entries()) {
      await processCollectedRecord({
        adapter,
        runKey,
        collectedAt,
        record,
        itemIndex: itemIndex + 1,
        logger: childLogger
      });
    }

    if ((state?.failures ?? 0) > 0) {
      childLogger.info({ previousFailures: state?.failures ?? 0 }, "circuit breaker state reset");
    }

    circuitState.set(adapter.code, { failures: 0 });
    await reportSourceRunState({
      sourceCode: adapter.code,
      runKey,
      status: "SUCCESS",
      startedAt: collectedAt,
      finishedAt: new Date().toISOString(),
      itemsDiscovered: records.length
    }, childLogger);
  } catch (error) {
    const failures = (circuitState.get(adapter.code)?.failures ?? 0) + 1;
    const openUntil =
      failures >= config.CIRCUIT_BREAKER_FAILURE_THRESHOLD
        ? Date.now() + config.CIRCUIT_BREAKER_OPEN_MS
        : undefined;

    circuitState.set(adapter.code, {
      failures,
      openUntil
    });
    childLogger.error(
      {
        err: error,
        failures,
        openUntil,
        circuitBreakerThreshold: config.CIRCUIT_BREAKER_FAILURE_THRESHOLD
      },
      "source run failed"
    );
    await reportSourceRunState({
      sourceCode: adapter.code,
      runKey,
      status: "FAILED",
      startedAt: collectedAt,
      finishedAt: new Date().toISOString(),
      errorMessage: error instanceof Error ? error.message : "Source run failed"
    }, childLogger);
  } finally {
    runningSources.delete(adapter.code);
  }
}

async function bootstrap(): Promise<void> {
  configureHttpTransport(logger);
  await probeOutboundProxy(logger);
  await connectPublisher();
  startControlServer();
  await hydrateRuntimeConfig();

  if (resolvedSources.unknownCodes.length > 0) {
    logger.warn(
      {
        unknownSources: resolvedSources.unknownCodes,
        availableSources: SUPPORTED_SOURCE_CODES
      },
      "unknown sources requested via ENABLED_SOURCES"
    );
  }

  if (resolvedSources.loadedCodes.length === 0) {
    logger.warn(
      { requestedSources: resolvedSources.requestedCodes },
      "no known sources resolved; scraper-service started without active adapters"
    );
  }

  logger.info(
    {
      requestedSources: resolvedSources.requestedCodes,
      loadedSources: resolvedSources.loadedCodes,
      proxyConfigured: Boolean(config.HTTP_PROXY || config.HTTPS_PROXY),
      proxyNoProxyConfigured: Boolean(config.NO_PROXY)
    },
    "loaded enabled sources"
  );

  logger.info({
    queueRaw: config.QUEUE_RAW_EVENT,
    queueQuarantine: config.QUEUE_QUARANTINE_EVENT,
    schedule: runtimeConfig.schedule,
    autoRunEnabled: runtimeConfig.autoRunEnabled,
    enabledSources: adapters.map((adapter) => adapter.code),
    s3Endpoint: config.S3_ENDPOINT,
    s3Bucket: config.S3_BUCKET,
    sharedContractsDir: config.SHARED_CONTRACTS_DIR
  }, "scraper-service starting");

  const runAll = async (): Promise<void> => {
    if (running) {
      logger.warn("scheduled run skipped because previous run is still executing");
      return;
    }
    running = true;
    try {
      logger.info(
        { enabledSources: adapters.map((adapter) => adapter.code), schedule: runtimeConfig.schedule },
        "scheduled run started"
      );
      await Promise.allSettled(adapters.map((adapter) => runAdapter(adapter)));
    } finally {
      running = false;
    }
  };

  syncScheduledTask(runAll);

  if (runtimeConfig.autoRunEnabled) {
    await runAll();
  } else {
    logger.warn("automatic scheduled runs are disabled by runtime configuration");
  }
}

function startControlServer() {
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (request.method === "POST" && request.url === "/api/source-runs") {
      try {
        const rawBody = await readRequestBody(request);
        const parsed = rawBody.length > 0 ? (JSON.parse(rawBody) as { sourceCodes?: string[] }) : {};
        const triggerResult = triggerSourceRuns(parsed.sourceCodes);

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ triggeredAt: new Date().toISOString(), items: triggerResult }));
      } catch (error) {
        logger.error({ err: error }, "manual source trigger request failed");
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            message: error instanceof Error ? error.message : "Invalid manual trigger request"
          })
        );
      }
      return;
    }

    if (request.method === "GET" && request.url === "/api/runtime-config") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(runtimeConfig));
      return;
    }

    if (request.method === "PUT" && request.url === "/api/runtime-config") {
      try {
        const rawBody = await readRequestBody(request);
        const parsed = rawBody.length > 0
          ? (JSON.parse(rawBody) as { schedule?: string; autoRunEnabled?: boolean })
          : {};
        const nextConfig = applyRuntimeConfig(parsed);

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(nextConfig));
      } catch (error) {
        logger.error({ err: error }, "runtime config update failed");
        response.writeHead(400, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            message: error instanceof Error ? error.message : "Invalid runtime config update"
          })
        );
      }
      return;
    }

    if (request.method === "GET" && request.url === "/api/runtime-status") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ...runtimeConfig,
          running,
          runningSources: Array.from(runningSources).sort(),
          loadedSources: adapters.map((adapter) => adapter.code),
          circuitStates: Array.from(circuitState.entries())
            .map(([sourceCode, state]) => ({
              sourceCode,
              failures: state.failures,
              openUntil: state.openUntil ? new Date(state.openUntil).toISOString() : null
            }))
            .sort((left, right) => left.sourceCode.localeCompare(right.sourceCode))
        })
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "Not found" }));
  });

  server.listen(config.CONTROL_PORT, config.CONTROL_HOST, () => {
    logger.info(
      { controlHost: config.CONTROL_HOST, controlPort: config.CONTROL_PORT },
      "scraper control server started"
    );
  });
}

async function hydrateRuntimeConfig() {
  if (!config.API_INGEST_TOKEN) {
    logger.warn("API_INGEST_TOKEN is not configured; scraper runtime settings will use local defaults");
    return;
  }

  try {
    const response = await fetch(config.BACKEND_INTERNAL_URL, {
      headers: {
        "x-ingest-token": config.API_INGEST_TOKEN
      }
    });

    if (!response.ok) {
      throw new Error(`backend returned ${response.status}`);
    }

    const payload = (await response.json()) as { schedule?: string; autoRunEnabled?: boolean };
    applyRuntimeConfig(payload);
    logger.info(
      { schedule: runtimeConfig.schedule, autoRunEnabled: runtimeConfig.autoRunEnabled },
      "runtime settings loaded from backend"
    );
  } catch (error) {
    logger.warn(
      { err: error, backendInternalUrl: config.BACKEND_INTERNAL_URL },
      "failed to load runtime settings from backend; local defaults will be used"
    );
  }
}

async function reportSourceRunState(
  payload: {
    sourceCode: string;
    runKey: string;
    status: "RUNNING" | "SUCCESS" | "FAILED";
    startedAt: string;
    finishedAt?: string;
    errorMessage?: string;
    itemsDiscovered?: number;
  },
  childLogger: Logger
) {
  if (!config.API_INGEST_TOKEN) {
    return;
  }

  try {
    const response = await fetch(config.BACKEND_SOURCE_RUNS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-token": config.API_INGEST_TOKEN
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`backend returned ${response.status}`);
    }
  } catch (error) {
    childLogger.warn(
      {
        err: error,
        backendSourceRunsUrl: config.BACKEND_SOURCE_RUNS_URL,
        reportStatus: payload.status
      },
      "failed to report source run state to backend"
    );
  }
}

function applyRuntimeConfig(nextConfig: { schedule?: string; autoRunEnabled?: boolean }) {
  const schedule = typeof nextConfig.schedule === "string" ? nextConfig.schedule.trim() : runtimeConfig.schedule;

  if (!cron.validate(schedule)) {
    throw new Error("Неверное cron-выражение расписания");
  }

  runtimeConfig = {
    schedule,
    autoRunEnabled:
      typeof nextConfig.autoRunEnabled === "boolean"
        ? nextConfig.autoRunEnabled
        : runtimeConfig.autoRunEnabled
  };

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  if (runtimeConfig.autoRunEnabled) {
    scheduledTask = cron.schedule(runtimeConfig.schedule, () => {
      void runAllScheduled();
    });
  }

  logger.info(
    { schedule: runtimeConfig.schedule, autoRunEnabled: runtimeConfig.autoRunEnabled },
    "runtime config applied"
  );

  return runtimeConfig;
}

function syncScheduledTask(runAll: () => Promise<void>) {
  runAllScheduled = runAll;
  applyRuntimeConfig(runtimeConfig);
}

let runAllScheduled: () => Promise<void> = async () => {};

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function triggerSourceRuns(sourceCodes?: string[]) {
  const requestedCodes =
    Array.isArray(sourceCodes) && sourceCodes.length > 0
      ? [...new Set(sourceCodes.map((code) => code.trim()).filter(Boolean))]
      : adapters.map((adapter) => adapter.code);

  return requestedCodes.map((sourceCode) => {
    const adapter = adaptersByCode.get(sourceCode);

    if (!adapter) {
      return {
        sourceCode,
        sourceName: sourceCode,
        accepted: false,
        message: "Источник не включён в ENABLED_SOURCES"
      };
    }

    if (runningSources.has(sourceCode)) {
      return {
        sourceCode,
        sourceName: adapter.name,
        accepted: false,
        message: "Источник уже выполняется"
      };
    }

    const startedAt = new Date().toISOString();
    const runKey = `${adapter.code}-${startedAt}`;

    void runAdapter(adapter, {
      runKey,
      collectedAt: startedAt,
      trigger: "manual"
    });

    return {
      sourceCode,
      sourceName: adapter.name,
      accepted: true,
      runKey,
      startedAt,
      message: "Ручной запуск отправлен"
    };
  });
}

async function connectPublisher(): Promise<void> {
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      await publisher.init([config.QUEUE_QUARANTINE_EVENT]);
      logger.info(
        {
          rabbitmqUrl: config.RABBITMQ_URL,
          queueRaw: config.QUEUE_RAW_EVENT,
          queueQuarantine: config.QUEUE_QUARANTINE_EVENT
        },
        "connected to rabbitmq"
      );
      return;
    } catch (error) {
      const delayMs = Math.min(config.RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), 30000);
      logger.warn(
        { err: error, rabbitmqUrl: config.RABBITMQ_URL, attempt, delayMs },
        "failed to connect to rabbitmq, retrying"
      );
      await delay(delayMs);
    }
  }
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, "scraper-service crashed");
  process.exit(1);
});

async function processCollectedRecord(input: {
  adapter: SourceAdapter;
  runKey: string;
  collectedAt: string;
  record: {
    url: string;
    raw: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    artifacts?: ArtifactDraft[];
  };
  itemIndex: number;
  logger: Logger;
}): Promise<void> {
  const eventId = randomUUID();
  const itemLogger = input.logger.child({
    eventId,
    itemIndex: input.itemIndex,
    sourceUrl: input.record.url
  });

  try {
    const artifacts = await uploadArtifactsSafely(
      input.adapter.code,
      input.runKey,
      eventId,
      input.record.artifacts ?? [],
      itemLogger
    );

    const event: RawSourceEvent = {
      eventId,
      runKey: input.runKey,
      source: input.adapter.code,
      collectedAt: input.collectedAt,
      url: input.record.url,
      payloadVersion: "v1",
      artifacts,
      metadata: input.record.metadata,
      raw: enrichRawPayload(input.record.raw, input.record.url, input.collectedAt, artifacts)
    };

    validateRaw(event);
    await publisher.publish(event);
    itemLogger.info({ artifactCount: artifacts.length }, "raw event published");
  } catch (error) {
    const quarantinePayload = {
      reason: error instanceof Error ? error.message : "Unknown item processing error",
      source: input.adapter.code,
      runKey: input.runKey,
      collectedAt: input.collectedAt,
      itemIndex: input.itemIndex,
      item: {
        url: input.record.url,
        metadata: input.record.metadata,
        raw: input.record.raw
      }
    };

    try {
      await publisher.publishTo(config.QUEUE_QUARANTINE_EVENT, quarantinePayload);
      itemLogger.error({ err: error }, "item moved to quarantine");
    } catch (quarantineError) {
      itemLogger.error(
        { err: quarantineError, originalErr: error },
        "item processing failed and quarantine publish also failed"
      );
    }
  }
}

function enrichRawPayload(
  raw: Record<string, unknown>,
  sourcePageUrl: string,
  collectedAt: string,
  artifacts: ArtifactRef[]
): Record<string, unknown> {
  const primaryArtifact = artifacts[0];

  return {
    ...raw,
    sourcePageUrl: typeof raw.sourcePageUrl === "string" ? raw.sourcePageUrl : sourcePageUrl,
    collectedAt: typeof raw.collectedAt === "string" ? raw.collectedAt : collectedAt,
    rawArtifactUrl: primaryArtifact ? artifactStore.resolveObjectUrl(primaryArtifact) : raw.rawArtifactUrl,
    checksum: primaryArtifact?.checksum ?? raw.checksum
  };
}

async function uploadArtifactsSafely(
  source: string,
  runKey: string,
  eventId: string,
  artifacts: ArtifactDraft[],
  log: Logger
): Promise<ArtifactRef[]> {
  const uploadedArtifacts: ArtifactRef[] = [];

  for (const artifact of artifacts) {
    try {
      uploadedArtifacts.push(await artifactStore.upload(source, runKey, eventId, artifact));
    } catch (error) {
      log.error(
        {
          err: error,
          artifactFileName: artifact.fileName,
          artifactKind: artifact.kind,
          s3Endpoint: config.S3_ENDPOINT,
          s3Bucket: config.S3_BUCKET
        },
        "artifact upload failed; continuing without this artifact"
      );
    }
  }

  log.info(
    {
      requestedArtifacts: artifacts.length,
      uploadedArtifacts: uploadedArtifacts.length
    },
    "artifacts uploaded"
  );

  return uploadedArtifacts;
}

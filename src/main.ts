import { setTimeout as delay } from "node:timers/promises";
import cron from "node-cron";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { config } from "./config";
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

const circuitState = new Map<string, { failures: number; openUntil?: number }>();
let running = false;

async function runAdapter(adapter: SourceAdapter): Promise<void> {
  const state = circuitState.get(adapter.code);
  if (state?.openUntil && state.openUntil > Date.now()) {
    logger.warn(
      { source: adapter.code, failures: state.failures, openUntil: state.openUntil },
      "circuit breaker is open"
    );
    return;
  }

  const collectedAt = new Date().toISOString();
  const runKey = `${adapter.code}-${collectedAt}`;
  const childLogger = logger.child({ source: adapter.code, runKey });

  try {
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
  }
}

async function bootstrap(): Promise<void> {
  await connectPublisher();

  if (resolvedSources.unknownCodes.length > 0) {
    logger.warn(
      {
        unknownSources: resolvedSources.unknownCodes,
        availableSources: SUPPORTED_SOURCE_CODES
      },
      "unknown sources requested via ENABLED_SOURCES"
    );
  }

  if (resolvedSources.fallbackApplied) {
    logger.warn(
      {
        requestedSources: resolvedSources.requestedCodes,
        fallbackSource: "demo-source"
      },
      "no known sources resolved; demo-source fallback enabled"
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
    schedule: config.SCRAPE_SCHEDULE,
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
        { enabledSources: adapters.map((adapter) => adapter.code), schedule: config.SCRAPE_SCHEDULE },
        "scheduled run started"
      );
      await Promise.allSettled(adapters.map((adapter) => runAdapter(adapter)));
    } finally {
      running = false;
    }
  };

  await runAll();

  cron.schedule(config.SCRAPE_SCHEDULE, () => {
    void runAll();
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

import "dotenv/config";

export const config = {
  rabbitmqUrl: process.env.RABBITMQ_URL ?? "amqp://app:app@localhost:5672",
  queueRaw: process.env.QUEUE_RAW_EVENT ?? "source.raw.v1",
  scrapeSchedule: process.env.SCRAPE_SCHEDULE ?? "*/20 * * * *",
  usePlaywright: process.env.USE_PLAYWRIGHT === "true",
  sharedContractsDir: process.env.SHARED_CONTRACTS_DIR ?? "../shared-contracts"
};

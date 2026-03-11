import cron from "node-cron";
import { config } from "./config";
import { createRawEventValidator } from "./contracts/raw-event-validator";
import { RawPublisher } from "./messaging/raw-publisher";
import { collectDemoRaw } from "./sources/demo-source";

const publisher = new RawPublisher(config.rabbitmqUrl, config.queueRaw);
const validateRaw = createRawEventValidator(config.sharedContractsDir);

async function runOnce(): Promise<void> {
  try {
    const event = await collectDemoRaw(config.usePlaywright);
    validateRaw(event);
    await publisher.publish(event);
    console.log(`[scraper-service] отправлено событие ${event.eventId}`);
  } catch (error) {
    console.error("[scraper-service] ошибка обработки:", error);
  }
}

async function bootstrap(): Promise<void> {
  console.log("[scraper-service] запуск...", {
    queue: config.queueRaw,
    schedule: config.scrapeSchedule,
    usePlaywright: config.usePlaywright
  });

  await runOnce();

  cron.schedule(config.scrapeSchedule, () => {
    void runOnce();
  });
}

void bootstrap();

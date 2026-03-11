import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import type { RawSourceEvent } from "../types";

async function detectSourceTitle(url: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return await page.title();
  } finally {
    await browser.close();
  }
}

export async function collectDemoRaw(usePlaywright: boolean): Promise<RawSourceEvent> {
  const sourceUrl = "https://example.org";
  const pageTitle = usePlaywright ? await detectSourceTitle(sourceUrl) : "Example Domain";

  return {
    eventId: randomUUID(),
    source: "demo-source",
    collectedAt: new Date().toISOString(),
    url: sourceUrl,
    payloadVersion: "v1",
    raw: {
      title: "Поставка элементов трубопровода",
      customer: "АО Демонстрационная АЭС",
      amount: 3200000,
      currency: "RUB",
      pageTitle
    }
  };
}

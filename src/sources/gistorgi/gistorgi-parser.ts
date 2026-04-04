import { createHash } from "node:crypto";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { GistorgiParsedLot, GistorgiSearchResultLink } from "./types";

const SEARCH_LINK_PATTERNS = ["/new/public/lots/lot/"];

const TITLE_LABELS = ["Наименование лота", "Предмет торгов", "Наименование"];
const DESCRIPTION_LABELS = ["Описание лота", "Описание", "Описание имущества"];
const ORGANIZER_NAME_LABELS = [
  "Организатор торгов",
  "Организатор",
  "Наименование организатора"
];
const ORGANIZER_INN_LABELS = ["ИНН организатора", "ИНН"];
const AUCTION_TYPE_LABELS = ["Вид торгов", "Форма проведения", "Тип торгов"];
const STATUS_LABELS = ["Статус", "Статус процедуры"];
const PUBLISHED_AT_LABELS = ["Дата публикации", "Дата размещения"];
const APPLICATION_DEADLINE_LABELS = [
  "Дата и время окончания подачи заявок",
  "Окончание подачи заявок",
  "Дата окончания подачи заявок"
];
const BIDDING_DATE_LABELS = ["Дата проведения торгов", "Дата аукциона", "Дата и время торгов"];
const START_PRICE_LABELS = ["Начальная цена", "Цена лота", "Начальная стоимость"];
const REGION_LABELS = ["Субъект местонахождения имущества", "Регион", "Местонахождение"];
const LOT_INFO_LABELS = ["Информация о лоте", "Сведения о лоте", "Характеристики имущества"];

export function parseGistorgiSearchResults(
  html: string,
  options: { baseUrl: string; maxItems: number }
): GistorgiSearchResultLink[] {
  const $ = load(html);
  const links = new Map<string, GistorgiSearchResultLink>();

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const resolvedUrl = resolveUrl(options.baseUrl, href);
    if (!resolvedUrl || !isLikelyDetailUrl(resolvedUrl)) {
      return;
    }

    const externalId = extractExternalId(resolvedUrl);
    if (!externalId || links.has(externalId)) {
      return;
    }

    links.set(externalId, {
      externalId,
      detailUrl: resolvedUrl,
      title: cleanText($(element).text()) || undefined
    });
  });

  return Array.from(links.values()).slice(0, options.maxItems);
}

export function parseGistorgiDetailPage(html: string, detailUrl: string): GistorgiParsedLot {
  const $ = load(html);
  const title =
    findFirstValue($, TITLE_LABELS) ||
    cleanText($("h1").first().text()) ||
    cleanText($("title").first().text()) ||
    undefined;
  const startPriceText = findFirstValue($, START_PRICE_LABELS);

  return {
    externalId: extractExternalId(detailUrl) ?? "unknown",
    externalUrl: detailUrl,
    sourcePageUrl: detailUrl,
    sourceName: "gistorgi",
    sourceType: "auctions",
    title,
    description: findFirstValue($, DESCRIPTION_LABELS),
    organizerName: findFirstValue($, ORGANIZER_NAME_LABELS),
    organizerInn: normalizeIdentifier(findFirstValue($, ORGANIZER_INN_LABELS)),
    auctionType: findFirstValue($, AUCTION_TYPE_LABELS),
    status: findFirstValue($, STATUS_LABELS),
    publishedAt: parseRussianDateTime(findFirstValue($, PUBLISHED_AT_LABELS)),
    applicationDeadline: parseRussianDateTime(findFirstValue($, APPLICATION_DEADLINE_LABELS)),
    biddingDate: parseRussianDateTime(findFirstValue($, BIDDING_DATE_LABELS)),
    startPrice: parseAmount(startPriceText),
    currency: parseCurrency(startPriceText),
    region: findFirstValue($, REGION_LABELS),
    lotInfo: findFirstValue($, LOT_INFO_LABELS),
    checksum: createHash("sha256").update(html).digest("hex")
  };
}

function findFirstValue($: CheerioAPI, labels: string[]): string | undefined {
  for (const label of labels) {
    const value = findValueByLabel($, label);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function findValueByLabel($: CheerioAPI, label: string): string | undefined {
  const normalizedLabel = normalizeText(label);
  const candidates = $("th, td, dt, dd, div, span, p, strong, b, label").toArray();

  for (const element of candidates) {
    const ownText = cleanText($(element).text());
    if (!ownText) {
      continue;
    }

    const normalizedOwnText = normalizeText(ownText);
    if (
      normalizedOwnText !== normalizedLabel &&
      !normalizedOwnText.startsWith(`${normalizedLabel}:`) &&
      !normalizedOwnText.includes(` ${normalizedLabel} `)
    ) {
      continue;
    }

    const relatedValues = [
      getNeighborValue($, $(element)),
      getValueFromSameRow($, $(element)),
      extractValueAfterColon(ownText)
    ];

    for (const candidate of relatedValues) {
      const value = cleanText(candidate);
      if (value && normalizeText(value) !== normalizedLabel) {
        return value;
      }
    }
  }

  return undefined;
}

function getNeighborValue($: CheerioAPI, element: Cheerio<AnyNode>): string | undefined {
  const next = element.nextAll().toArray().find((node) => cleanText($(node).text()));
  if (next) {
    return $(next).text();
  }

  const parent = element.parent();
  const sibling = parent.nextAll().toArray().find((node) => cleanText($(node).text()));
  if (sibling) {
    return $(sibling).text();
  }

  return undefined;
}

function getValueFromSameRow($: CheerioAPI, element: Cheerio<AnyNode>): string | undefined {
  const row = element.closest("tr");
  if (row.length) {
    const cells = row.find("td").toArray().map((cell) => cleanText($(cell).text())).filter(Boolean);
    if (cells.length > 1) {
      return cells[cells.length - 1];
    }
  }

  const wrapper = element.closest("dl, .cardMainInfo, .common-info__content, .row, .lot-info");
  if (wrapper.length) {
    const text = cleanText(wrapper.text());
    if (text) {
      return text.replace(cleanText(element.text()), "").trim();
    }
  }

  return undefined;
}

function extractValueAfterColon(text: string): string | undefined {
  const parts = text.split(":");
  if (parts.length < 2) {
    return undefined;
  }

  return parts.slice(1).join(":");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[:;]/g, "").trim().toLowerCase();
}

function cleanText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function resolveUrl(baseUrl: string, href: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyDetailUrl(url: string): boolean {
  return SEARCH_LINK_PATTERNS.some((pattern) => url.includes(pattern));
}

function extractExternalId(value: string): string | undefined {
  const match = value.match(/\/lot\/([^/?#]+)/);
  return match?.[1];
}

function normalizeIdentifier(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/[^\d]/g, "");
  return normalized || undefined;
}

function parseRussianDateTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(
    /\b(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?\b/
  );

  if (!match) {
    return undefined;
  }

  const [, day, month, year, hours = "00", minutes = "00", seconds = "00"] = match;
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+03:00`;
}

function parseAmount(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/(\d[\d\s]*)(?:,(\d{1,2}))?/);
  if (!match) {
    return undefined;
  }

  const normalized = `${match[1].replace(/\s+/g, "")}.${match[2] ?? "00"}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCurrency(value: string | undefined): string | undefined {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("руб")) {
    return "RUB";
  }
  if (normalized.includes("eur") || normalized.includes("евро")) {
    return "EUR";
  }
  if (normalized.includes("usd") || normalized.includes("долл")) {
    return "USD";
  }
  return undefined;
}

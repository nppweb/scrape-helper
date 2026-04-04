import { createHash } from "node:crypto";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { EasuzParsedNotice, EasuzSearchResultLink } from "./types";

const DETAIL_LINK_PATTERN = /\/tenders\/(\d+)(?:[/?#]|$)/;

const TITLE_LABELS = ["Объект закупки", "Наименование закупки", "Наименование"];
const CUSTOMER_LABELS = ["Заказчик", "Организация-заказчик"];
const CUSTOMER_INN_LABELS = ["ИНН", "ИНН заказчика"];
const STATUS_LABELS = ["Статус", "Статус закупки"];
const PUBLISHED_AT_LABELS = ["Размещено", "Дата размещения"];
const APPLICATION_DEADLINE_LABELS = ["Подать заявку до", "Окончание подачи заявок"];
const INITIAL_PRICE_LABELS = ["Начальная цена", "Начальная (максимальная) цена контракта"];
const PROCUREMENT_TYPE_LABELS = [
  "Способ определения поставщика (подрядчика, исполнителя)",
  "Способ определения поставщика",
  "Тип закупки"
];
const EIS_REGISTRATION_NUMBER_LABELS = ["Реестровый номер ЕИС"];
const REGISTRY_NUMBER_LABELS = ["Реестровый номер"];
const PLATFORM_LABELS = ["Электронная площадка", "Площадка"];
const REGION_LABELS = ["Субъект РФ", "Регион", "Место нахождения"];
const DESCRIPTION_SECTION_TITLES = ["Информация об объекте закупки", "Описание объекта закупки"];

export function parseEasuzSearchResults(
  html: string,
  options: { baseUrl: string; maxItems: number }
): EasuzSearchResultLink[] {
  const $ = load(html);
  const links = new Map<string, EasuzSearchResultLink>();

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const detailUrl = resolveUrl(options.baseUrl, href);
    if (!detailUrl) {
      return;
    }

    const externalId = extractExternalId(detailUrl);
    if (!externalId || links.has(externalId)) {
      return;
    }

    const title =
      cleanText($(element).text()) ||
      cleanText($(element).closest("article, section, .card, .tender-card, li").find("h2, h3").first().text()) ||
      undefined;

    links.set(externalId, {
      externalId,
      detailUrl,
      title
    });
  });

  return Array.from(links.values()).slice(0, options.maxItems);
}

export function parseEasuzNoticePage(html: string, detailUrl: string): EasuzParsedNotice {
  const $ = load(html);
  const priceText = findFirstValue($, INITIAL_PRICE_LABELS);
  const regionFromAddress = extractRegionFromAddress(findFirstValue($, REGION_LABELS));

  return {
    externalId: extractExternalId(detailUrl) ?? "unknown",
    externalUrl: detailUrl,
    sourcePageUrl: detailUrl,
    sourceName: "easuz",
    sourceType: "procurement",
    title:
      findFirstValue($, TITLE_LABELS) ||
      cleanText($("h1").first().text()) ||
      cleanText($("title").first().text()) ||
      undefined,
    description: readSectionText($, DESCRIPTION_SECTION_TITLES),
    customerName: findFirstValue($, CUSTOMER_LABELS),
    customerInn: normalizeIdentifier(findFirstValue($, CUSTOMER_INN_LABELS)),
    status: findFirstValue($, STATUS_LABELS),
    publishedAt: parseRussianDateTime(findFirstValue($, PUBLISHED_AT_LABELS)),
    applicationDeadline: parseRussianDateTime(findFirstValue($, APPLICATION_DEADLINE_LABELS)),
    initialPrice: parseAmount(priceText),
    currency: parseCurrency(priceText),
    region: regionFromAddress,
    registryNumber: findRegistryNumber($),
    eisRegistrationNumber: normalizeIdentifier(findFirstValue($, EIS_REGISTRATION_NUMBER_LABELS)),
    procurementType: findFirstValue($, PROCUREMENT_TYPE_LABELS),
    platformName: findFirstValue($, PLATFORM_LABELS),
    checksum: createHash("sha256").update(html).digest("hex")
  };
}

function findRegistryNumber($: CheerioAPI): string | undefined {
  const elements = $("div, span, p, strong, b, h1, h2").toArray();

  for (const element of elements) {
    const text = cleanText($(element).text());
    if (!text) {
      continue;
    }

    const match = text.match(/^Реестровый номер\s+([A-Za-zА-Яа-я0-9-]+)/i);
    if (match && !/еис/i.test(match[1])) {
      return match[1];
    }
  }

  return findFirstValue($, REGISTRY_NUMBER_LABELS);
}

function readSectionText($: CheerioAPI, sectionTitles: string[]): string | undefined {
  const headings = $("h1, h2, h3, h4, strong").toArray();

  for (const heading of headings) {
    const title = cleanText($(heading).text());
    if (!title || !sectionTitles.some((candidate) => normalizeText(title) === normalizeText(candidate))) {
      continue;
    }

    const fragments: string[] = [];
    let current = $(heading).next();

    while (current.length) {
      const tagName = current.get(0)?.tagName?.toLowerCase();
      if (tagName && /^h[1-4]$/.test(tagName)) {
        break;
      }

      const text = cleanText(current.text());
      if (text && !fragments.includes(text)) {
        fragments.push(text);
      }
      current = current.next();
    }

    const joined = cleanText(fragments.join(" "));
    if (joined) {
      return joined;
    }
  }

  return undefined;
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
  const candidates = $("th, td, dt, dd, div, span, p, strong, b, label, li").toArray();

  for (const element of candidates) {
    const ownText = cleanText($(element).text());
    if (!ownText) {
      continue;
    }

    const normalizedOwnText = normalizeText(ownText);
    if (
      normalizedOwnText !== normalizedLabel &&
      !normalizedOwnText.startsWith(`${normalizedLabel}:`)
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

  const wrapper = element.closest("dl, .row, .detail-section, .tender-card");
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

function extractExternalId(value: string): string | undefined {
  const match = value.match(DETAIL_LINK_PATTERN);
  return match?.[1];
}

function resolveUrl(baseUrl: string, href: string): string | null {
  try {
    const resolved = new URL(href, baseUrl).toString();
    return extractExternalId(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[:;]/g, "").trim().toLowerCase();
}

function cleanText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
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
    /\b(\d{2})\.(\d{2})\.(\d{4})(?:\s*,?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?\b/
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

  const match = value.match(/(\d[\d\s]*)(?:[.,](\d{1,2}))?/);
  if (!match) {
    return undefined;
  }

  const normalized = `${match[1].replace(/\s+/g, "")}.${match[2] ?? "00"}`;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseCurrency(value: string | undefined): string | undefined {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("руб") || normalized.includes("₽")) {
    return "RUB";
  }
  if (normalized.includes("usd") || normalized.includes("долл")) {
    return "USD";
  }
  if (normalized.includes("eur") || normalized.includes("евро")) {
    return "EUR";
  }
  return undefined;
}

function extractRegionFromAddress(value: string | undefined): string | undefined {
  const normalized = cleanText(value);
  if (!normalized) {
    return undefined;
  }

  const regionMatch = normalized.match(
    /(московская\s+обл(?:асть)?|г\.?\s*москва|санкт-петербург|ленинградская\s+обл(?:асть)?)/i
  );

  if (!regionMatch) {
    return undefined;
  }

  const region = regionMatch[1].toLowerCase();
  if (region.includes("москов")) {
    return "Московская область";
  }
  if (region.includes("москва")) {
    return "г. Москва";
  }
  if (region.includes("санкт")) {
    return "Санкт-Петербург";
  }
  if (region.includes("ленинград")) {
    return "Ленинградская область";
  }

  return undefined;
}

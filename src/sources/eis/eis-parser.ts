import { createHash } from "node:crypto";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { EisParsedNotice, EisSearchResultLink } from "./types";

const SEARCH_LINK_PATTERNS = [
  "/epz/order/notice/",
  "/epz/order/extendedsearch/",
  "/223/purchase/public/purchase/info/",
  "/epz/contract/contractCard/common-info.html",
  "/epz/contractfz223/card/contract-info.html"
];

const TITLE_LABELS = [
  "Объект закупки",
  "Наименование объекта закупки",
  "Наименование закупки",
  "Наименование",
  "Предмет договора",
  "Предмет контракта"
];

const DESCRIPTION_LABELS = [
  "Описание объекта закупки",
  "Описание",
  "Краткое описание"
];

const CUSTOMER_LABELS = [
  "Заказчик",
  "Организация, осуществляющая размещение",
  "Наименование организации"
];

const SUPPLIER_LABELS = ["Поставщик", "Подрядчик", "Исполнитель"];

const STATUS_LABELS = ["Статус", "Этап закупки", "Состояние закупки", "Статус контракта"];

const PUBLISHED_AT_LABELS = [
  "Размещено",
  "Дата размещения",
  "Опубликовано",
  "Дата заключения договора",
  "Дата заключения контракта",
  "Заключение договора"
];

const DEADLINE_LABELS = [
  "Окончание подачи заявок",
  "Дата и время окончания подачи заявок",
  "Дата окончания подачи заявок"
];

const PRICE_LABELS = [
  "Начальная (максимальная) цена контракта",
  "Начальная цена",
  "Начальная цена договора",
  "Максимальное значение цены контракта",
  "Цена контракта",
  "Цена договора"
];

const CURRENCY_LABELS = ["Валюта", "Код валюты"];

const REGION_LABELS = ["Субъект РФ", "Регион", "Место поставки товара, выполнения работы или оказания услуги"];

export function parseEisSearchResults(
  html: string,
  options: { baseUrl: string; maxItems: number; detailLinkPatterns?: string[] }
): EisSearchResultLink[] {
  const $ = load(html);
  const links = new Map<string, EisSearchResultLink>();

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const resolvedUrl = resolveUrl(options.baseUrl, href);
    if (!resolvedUrl || !isLikelyEisNoticeUrl(resolvedUrl, options.detailLinkPatterns)) {
      return;
    }

    const externalId = extractRegistrationNumber(resolvedUrl) ?? extractRegistrationNumber($(element).text());
    if (!externalId) {
      return;
    }

    const candidate: EisSearchResultLink = {
      externalId,
      detailUrl: resolvedUrl,
      title: cleanText($(element).text()) || undefined
    };
    const existing = links.get(externalId);

    if (!existing || getDetailUrlPriority(candidate.detailUrl) > getDetailUrlPriority(existing.detailUrl)) {
      links.set(externalId, candidate);
    }
  });

  return Array.from(links.values()).slice(0, options.maxItems);
}

export function parseEisNoticePage(
  html: string,
  detailUrl: string,
  options?: {
    fallbackExternalId?: string;
    sourceName?: string;
    sourceType?: EisParsedNotice["sourceType"];
  }
): EisParsedNotice {
  const $ = load(html);
  const structuredValues = collectStructuredFieldValues($);
  const externalId =
    extractRegistrationNumber(detailUrl) ??
    findFirstValue($, ["Реестровый номер", "Номер закупки"], structuredValues) ??
    options?.fallbackExternalId ??
    readPageTitle($) ??
    "unknown";

  const title =
    findFirstValue($, TITLE_LABELS, structuredValues) ??
    readPrimaryHeading($) ??
    findMetaContent($, "og:title") ??
    findMetaContent($, "twitter:title");

  const description =
    findFirstValue($, DESCRIPTION_LABELS, structuredValues) ??
    findMetaContent($, "description") ??
    undefined;

  const customerName = findFirstValue($, CUSTOMER_LABELS, structuredValues) ?? undefined;
  const supplierName = findFirstValue($, SUPPLIER_LABELS, structuredValues) ?? undefined;
  const status = findFirstValue($, STATUS_LABELS, structuredValues) ?? undefined;
  const publishedAt = parseRussianDateTime(findFirstValue($, PUBLISHED_AT_LABELS, structuredValues));
  const applicationDeadline = parseRussianDateTime(
    findFirstValue($, DEADLINE_LABELS, structuredValues)
  );
  const priceText = findFirstValue($, PRICE_LABELS, structuredValues);
  const initialPrice = parseRussianAmount(priceText);
  const currency = normalizeCurrency(findFirstValue($, CURRENCY_LABELS, structuredValues) ?? priceText);
  const region = sanitizeRegion(findFirstValue($, REGION_LABELS, structuredValues));

  return {
    externalId,
    externalUrl: detailUrl,
    sourcePageUrl: detailUrl,
    sourceName: options?.sourceName ?? "eis",
    sourceType: options?.sourceType ?? "procurement",
    title,
    description,
    customerName,
    supplierName,
    status,
    publishedAt,
    applicationDeadline,
    initialPrice,
    currency,
    region,
    checksum: checksumHtml(html)
  };
}

function findFirstValue(
  $: CheerioAPI,
  labels: string[],
  structuredValues?: Map<string, string[]>
): string | undefined {
  const fromStructuredValues = findFromStructuredValues(labels, structuredValues);
  if (fromStructuredValues) {
    return fromStructuredValues;
  }

  for (const label of labels) {
    const value = findValueByLabel($, label);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function findFromStructuredValues(
  labels: string[],
  structuredValues: Map<string, string[]> | undefined
): string | undefined {
  if (!structuredValues) {
    return undefined;
  }

  for (const label of labels) {
    const values = structuredValues.get(normalizeText(label));
    const value = values?.find(Boolean);
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

  const wrapper = element.closest("dl, .cardMainInfo, .common-info__content, .row");
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

function readPrimaryHeading($: CheerioAPI): string | undefined {
  const preferredHeading = $(".cardMainInfo__title.d-flex, .registry-entry__title, .sectionMainInfo__header h1")
    .first()
    .text();
  const heading = preferredHeading || $("h1, h2").first().text();
  return cleanText(heading) || undefined;
}

function readPageTitle($: CheerioAPI): string | undefined {
  const title = $("title").first().text();
  return cleanText(title) || undefined;
}

function findMetaContent($: CheerioAPI, name: string): string | undefined {
  const element =
    $(`meta[name="${name}"]`).attr("content") ?? $(`meta[property="${name}"]`).attr("content");

  return cleanText(element) || undefined;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/[:;]/g, "").trim().toLowerCase();
}

function cleanText(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
}

function collectStructuredFieldValues($: CheerioAPI): Map<string, string[]> {
  const values = new Map<string, string[]>();

  const addValue = (label: string | undefined, value: string | undefined) => {
    const normalizedLabel = normalizeText(label ?? "");
    const cleanedValue = cleanText(value);
    if (!normalizedLabel || !cleanedValue) {
      return;
    }

    const existingValues = values.get(normalizedLabel) ?? [];
    if (!existingValues.includes(cleanedValue)) {
      existingValues.push(cleanedValue);
      values.set(normalizedLabel, existingValues);
    }
  };

  $(".cardMainInfo__section, .price, .date .cardMainInfo__section").each((_index, element) => {
    const section = $(element);
    addValue(section.find(".cardMainInfo__title").first().text(), section.find(".cardMainInfo__content").first().text());
  });

  $(".price-block, .data-block").each((_index, element) => {
    const section = $(element);
    addValue(section.find(".rightBlock__tittle").first().text(), section.find(".rightBlock__price, .rightBlock__text").first().text());
  });

  $(".blockInfo__section").each((_index, element) => {
    const section = $(element);
    addValue(section.find(".section__title").first().text(), section.find(".section__info").first().text());
  });

  $("tr").each((_index, element) => {
    const row = $(element);
    addValue(row.find("th, td").first().text(), row.find("td").last().text());
  });

  $("dt").each((_index, element) => {
    const term = $(element);
    addValue(term.text(), term.next("dd").text());
  });

  return values;
}

function resolveUrl(baseUrl: string, href: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyEisNoticeUrl(url: string, patterns?: string[]): boolean {
  const knownPattern = (patterns ?? SEARCH_LINK_PATTERNS).some((pattern) => url.includes(pattern));
  return knownPattern && (url.includes("regNumber=") || url.includes("reestrNumber=") || url.includes("?id="));
}

function getDetailUrlPriority(url: string): number {
  if (url.includes("/view/common-info.html")) {
    return 3;
  }

  if (url.includes("common-info.html")) {
    return 2;
  }

  if (url.includes("/printForm/")) {
    return 0;
  }

  return 1;
}

function extractRegistrationNumber(value: string): string | undefined {
  const match =
    value.match(/regNumber=([0-9]+)/i) ??
    value.match(/reestrNumber=([0-9]+)/i) ??
    value.match(/\b([0-9]{11,30})\b/);
  return match?.[1];
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

function parseRussianAmount(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/[^\d,.\-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : undefined;
}

function normalizeCurrency(value: string | undefined): string | undefined {
  const normalized = cleanText(value).toUpperCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized.includes("RUB") ||
    normalized.includes("RUR") ||
    normalized.includes("РУБ") ||
    normalized.includes("₽") ||
    normalized.includes("РОССИЙСКИЙ РУБЛЬ")
  ) {
    return "RUB";
  }

  return normalized.split(/\s+/)[0];
}

function sanitizeRegion(value: string | undefined): string | undefined {
  const cleaned = cleanText(value);

  if (!cleaned) {
    return undefined;
  }

  if (
    cleaned.length > 120 ||
    cleaned.includes("Официальный сайт единой информационной системы") ||
    cleaned.includes("контрактной системе в сфере закупок")
  ) {
    return undefined;
  }

  return cleaned;
}

function checksumHtml(html: string): string {
  return createHash("sha256").update(html).digest("hex");
}

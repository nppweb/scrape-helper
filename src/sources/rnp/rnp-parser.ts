import { createHash } from "node:crypto";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { RnpParsedEntry, RnpSearchResultLink } from "./types";

const SEARCH_LINK_PATTERNS = [
  "/epz/dishonestsupplier/view/info.html",
  "/epz/dishonestsupplier/view/card.html"
];

const SUPPLIER_NAME_LABELS = [
  "Наименование юридического лица",
  "Наименование поставщика",
  "Поставщик",
  "ФИО"
];

const SUPPLIER_INN_LABELS = ["ИНН", "ИНН поставщика"];
const SUPPLIER_OGRN_LABELS = ["ОГРН", "ОГРНИП", "ОГРН поставщика"];
const REGISTRY_STATUS_LABELS = ["Статус", "Состояние записи"];
const REASON_LABELS = [
  "Основание для включения в реестр",
  "Причина включения",
  "Сведения об уклонении или расторжении"
];
const DECISION_DATE_LABELS = ["Дата решения", "Дата принятия решения"];
const INCLUSION_DATE_LABELS = ["Дата включения в реестр", "Дата внесения в реестр"];
const EXCLUSION_DATE_LABELS = ["Дата исключения из реестра", "Дата исключения"];
const CUSTOMER_NAME_LABELS = ["Заказчик", "Наименование заказчика"];
const LEGAL_BASIS_LABELS = ["Правовое основание", "Норма закона", "Основание"];
const REGION_LABELS = ["Субъект РФ", "Регион"];

export function parseRnpSearchResults(
  html: string,
  options: { baseUrl: string; maxItems: number }
): RnpSearchResultLink[] {
  const $ = load(html);
  const links = new Map<string, RnpSearchResultLink>();

  $("a[href]").each((_index, element) => {
    const href = $(element).attr("href");
    if (!href) {
      return;
    }

    const resolvedUrl = resolveUrl(options.baseUrl, href);
    if (!resolvedUrl || !isLikelyRnpDetailUrl(resolvedUrl)) {
      return;
    }

    const externalId =
      extractExternalId(resolvedUrl) ??
      extractRegistrationNumber($(element).text());

    if (!externalId || links.has(externalId)) {
      return;
    }

    links.set(externalId, {
      externalId,
      detailUrl: resolvedUrl,
      supplierName: cleanText($(element).text()) || undefined
    });
  });

  return Array.from(links.values()).slice(0, options.maxItems);
}

export function parseRnpDetailPage(html: string, detailUrl: string): RnpParsedEntry {
  const $ = load(html);

  const externalId =
    extractExternalId(detailUrl) ??
    findFirstValue($, ["Реестровый номер"]) ??
    readPageTitle($) ??
    "unknown";

  return {
    externalId,
    externalUrl: detailUrl,
    sourcePageUrl: detailUrl,
    sourceName: "rnp",
    sourceType: "registry",
    supplierName: findFirstValue($, SUPPLIER_NAME_LABELS),
    supplierInn: normalizeIdentifier(findFirstValue($, SUPPLIER_INN_LABELS)),
    supplierOgrn: normalizeIdentifier(findFirstValue($, SUPPLIER_OGRN_LABELS)),
    registryStatus: findFirstValue($, REGISTRY_STATUS_LABELS),
    reason: findFirstValue($, REASON_LABELS) ?? findMetaContent($, "description"),
    decisionDate: parseRussianDateTime(findFirstValue($, DECISION_DATE_LABELS)),
    inclusionDate: parseRussianDateTime(findFirstValue($, INCLUSION_DATE_LABELS)),
    exclusionDate: parseRussianDateTime(findFirstValue($, EXCLUSION_DATE_LABELS)),
    customerName: findFirstValue($, CUSTOMER_NAME_LABELS),
    legalBasis: findFirstValue($, LEGAL_BASIS_LABELS),
    region: findFirstValue($, REGION_LABELS),
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

function readPageTitle($: CheerioAPI): string | undefined {
  return cleanText($("title").first().text()) || undefined;
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

function resolveUrl(baseUrl: string, href: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function isLikelyRnpDetailUrl(url: string): boolean {
  return SEARCH_LINK_PATTERNS.some((pattern) => url.includes(pattern));
}

function extractExternalId(value: string): string | undefined {
  const url = tryParseUrl(value);
  if (url) {
    for (const key of [
      "id",
      "entryId",
      "dishonestSupplierId",
      "supplierId",
      "regNumber"
    ]) {
      const param = url.searchParams.get(key);
      if (param?.trim()) {
        return param.trim();
      }
    }
  }

  return extractRegistrationNumber(value);
}

function extractRegistrationNumber(value: string): string | undefined {
  return value.match(/\b([0-9]{8,20})\b/)?.[1];
}

function tryParseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
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

function normalizeIdentifier(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/[^\d]/g, "");
  return normalized || undefined;
}

import { createHash } from "node:crypto";
import { load, type CheerioAPI, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import type { FedresursParsedMessage, FedresursSearchResultLink } from "./types";

const SEARCH_LINK_PATTERNS = ["/MessageWindow.aspx", "/TradeLotInfo.aspx"];

const MESSAGE_TYPE_LABELS = ["Тип сообщения", "Вид сообщения", "Тип публикации"];
const SUBJECT_NAME_LABELS = [
  "Должник",
  "Субъект",
  "Наименование должника",
  "Наименование"
];
const SUBJECT_INN_LABELS = ["ИНН", "ИНН должника"];
const SUBJECT_OGRN_LABELS = ["ОГРН", "ОГРНИП", "ОГРН должника"];
const PUBLISHED_AT_LABELS = ["Дата публикации", "Дата сообщения", "Опубликовано"];
const EVENT_DATE_LABELS = ["Дата события", "Дата торгов", "Дата судебного акта"];
const TITLE_LABELS = ["Тема сообщения", "Заголовок", "Название"];
const DESCRIPTION_LABELS = ["Содержание сообщения", "Описание", "Текст сообщения"];
const BANKRUPTCY_STAGE_LABELS = ["Стадия банкротства", "Процедура", "Этап процедуры"];
const CASE_NUMBER_LABELS = ["Номер дела", "Номер арбитражного дела", "Дело"];
const COURT_NAME_LABELS = ["Арбитражный суд", "Суд"];

export function parseFedresursSearchResults(
  html: string,
  options: { baseUrl: string; maxItems: number }
): FedresursSearchResultLink[] {
  const $ = load(html);
  const links = new Map<string, FedresursSearchResultLink>();
  const addLink = (rawValue: string | undefined, title?: string) => {
    if (!rawValue) {
      return;
    }

    const candidates = extractDetailUrlCandidates(rawValue);

    for (const candidateUrl of candidates) {
      const resolvedUrl = resolveUrl(options.baseUrl, candidateUrl);
      if (!resolvedUrl || !isLikelyDetailUrl(resolvedUrl)) {
        continue;
      }

      const externalId = extractExternalId(resolvedUrl) ?? extractDigits(title ?? "");
      if (!externalId || links.has(externalId)) {
        continue;
      }

      links.set(externalId, {
        externalId,
        detailUrl: resolvedUrl,
        title: cleanText(title) || undefined
      });
    }
  };

  $("a[href]").each((_index, element) => {
    addLink($(element).attr("href"), $(element).text());
  });

  $("[data-href], [data-url], [onclick]").each((_index, element) => {
    addLink($(element).attr("data-href"), $(element).text());
    addLink($(element).attr("data-url"), $(element).text());
    addLink($(element).attr("onclick"), $(element).text());
  });

  for (const fallbackUrl of extractDetailUrlCandidates(html)) {
    addLink(fallbackUrl);
  }

  return Array.from(links.values()).slice(0, options.maxItems);
}

export function parseFedresursDetailPage(html: string, detailUrl: string): FedresursParsedMessage {
  const $ = load(html);

  const title =
    findFirstValue($, TITLE_LABELS) ||
    cleanText($("h1").first().text()) ||
    cleanText($("title").first().text()) ||
    undefined;
  const description =
    findFirstValue($, DESCRIPTION_LABELS) ||
    cleanText($(".msg, .messageText, .content, article").first().text()) ||
    findMetaContent($, "description");

  return {
    externalId:
      extractExternalId(detailUrl) ??
      findFirstValue($, ["Номер сообщения", "Идентификатор сообщения"]) ??
      "unknown",
    externalUrl: detailUrl,
    sourcePageUrl: detailUrl,
    sourceName: "fedresurs",
    sourceType: "bankruptcy",
    messageType: findFirstValue($, MESSAGE_TYPE_LABELS),
    subjectName: findFirstValue($, SUBJECT_NAME_LABELS),
    subjectInn: normalizeIdentifier(findFirstValue($, SUBJECT_INN_LABELS)),
    subjectOgrn: normalizeIdentifier(findFirstValue($, SUBJECT_OGRN_LABELS)),
    publishedAt: parseRussianDateTime(findFirstValue($, PUBLISHED_AT_LABELS)),
    eventDate: parseRussianDateTime(findFirstValue($, EVENT_DATE_LABELS)),
    title,
    description,
    bankruptcyStage: findFirstValue($, BANKRUPTCY_STAGE_LABELS),
    caseNumber: findFirstValue($, CASE_NUMBER_LABELS),
    courtName: findFirstValue($, COURT_NAME_LABELS),
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

function isLikelyDetailUrl(url: string): boolean {
  return SEARCH_LINK_PATTERNS.some((pattern) => url.includes(pattern));
}

function extractDetailUrlCandidates(value: string): string[] {
  const normalized = value
    .replace(/&amp;/gi, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/");
  const matches = normalized.match(
    /(?:https?:\/\/[^\s"'<>]+\/|\/)?(?:MessageWindow|TradeLotInfo)\.aspx(?:\?[^\s"'<>]+)?/gi
  );

  return matches ?? [];
}

function extractExternalId(value: string): string | undefined {
  const url = tryParseUrl(value);
  if (url) {
    for (const key of ["ID", "id", "messageId", "tradeId"]) {
      const param = url.searchParams.get(key);
      if (param?.trim()) {
        return param.trim();
      }
    }
  }

  return extractDigits(value);
}

function extractDigits(value: string): string | undefined {
  return value.match(/\b([0-9]{6,20})\b/)?.[1];
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

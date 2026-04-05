import { createHash } from "node:crypto";
import type { GistorgiParsedLot, GistorgiSearchResultLink } from "./types";

export function parseGistorgiSearchResults(
  payload: string,
  options: { baseUrl: string; maxItems: number }
): GistorgiSearchResultLink[] {
  const response = parseJsonObject(payload);
  const content = asArray(response.content);
  const links = new Map<string, GistorgiSearchResultLink>();

  for (const entry of content) {
    const externalId = readString(entry.id);
    if (!externalId || links.has(externalId)) {
      continue;
    }

    const detailUrl = buildGistorgiPublicLotUrl(options.baseUrl, externalId);

    links.set(externalId, {
      externalId,
      detailUrl,
      title: readString(entry.lotName) ?? readString(entry.noticeNumber) ?? undefined
    });
  }

  return Array.from(links.values()).slice(0, options.maxItems);
}

export function parseGistorgiDetailResponse(
  payload: string,
  options: { baseUrl: string; externalId?: string }
): GistorgiParsedLot {
  const data = parseJsonObject(payload);
  const externalId = readString(data.id) ?? options.externalId ?? "unknown";
  const detailUrl = buildGistorgiPublicLotUrl(options.baseUrl, externalId);
  const organizer = firstObject(data.organizerInfo, data.sellerInfo);
  const title = readString(data.lotName) ?? readString(data.noticeNumber) ?? undefined;
  const description = readString(data.lotDescription);

  return {
    externalId,
    externalUrl: detailUrl,
    sourcePageUrl: detailUrl,
    sourceName: "gistorgi",
    sourceType: "auctions",
    title,
    description,
    organizerName:
      readString(organizer.fullName) ??
      readString(organizer.name) ??
      readString(data.organizerName) ??
      undefined,
    organizerInn: normalizeIdentifier(
      readString(organizer.inn) ??
        readString(organizer.innKio) ??
        readString(data.organizerInn) ??
        undefined
    ),
    auctionType:
      readString(asObject(data.biddType).name) ??
      readString(asObject(data.biddForm).name) ??
      undefined,
    status: readString(data.lotStatus),
    publishedAt: normalizeIsoDateTime(readString(data.noticeFirstVersionPublicationDate)),
    applicationDeadline: normalizeIsoDateTime(readString(data.biddEndTime)),
    biddingDate:
      normalizeIsoDateTime(readString(data.auctionStartDate)) ??
      normalizeIsoDateTime(readString(data.biddStartTime)),
    startPrice: parseNumericValue(data.priceMinExact ?? data.priceMin),
    currency: readString(data.currencyCode),
    region: readString(data.subjectRFName) ?? readString(data.subjectRFCode) ?? undefined,
    lotInfo: buildLotInfo(data, description),
    noticeNumber: readString(data.noticeNumber),
    lotNumber: readString(data.lotNumber),
    category: readString(asObject(data.category).name),
    etpUrl: readString(data.etpUrl),
    transactionType: readString(data.typeTransaction),
    checksum: createHash("sha256").update(payload).digest("hex")
  };
}

export function buildGistorgiPublicLotUrl(baseUrl: string, externalId: string): string {
  return new URL(`/new/public/lots/lot/${encodeURIComponent(externalId)}/(lotInfo:info)`, baseUrl).toString();
}

function parseJsonObject(payload: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(payload) as unknown;
    return asObject(parsed);
  } catch {
    return {};
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((entry) => asObject(entry)) : [];
}

function firstObject(...values: unknown[]): Record<string, unknown> {
  return values.map((value) => asObject(value)).find((value) => Object.keys(value).length > 0) ?? {};
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function normalizeIdentifier(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.replace(/[^\d]/g, "");
  return normalized || undefined;
}

function normalizeIsoDateTime(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}:\d{2})(?:\.\d+)?([+-]\d{2}:\d{2}|Z)$/
  );
  if (normalized) {
    const [, datePart, timePart, timezonePart] = normalized;
    return `${datePart}T${timePart}${timezonePart}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function parseNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = readString(value)?.replace(/\s+/g, "").replace(",", ".");
  if (!normalized) {
    return undefined;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildLotInfo(data: Record<string, unknown>, description: string | undefined): string | undefined {
  const parts = [
    readString(data.estateAddress),
    joinNamedPairs(asArray(data.characteristics), 4),
    joinNamedPairs(asArray(data.attributes), 4)
  ].filter(Boolean);

  const uniqueParts = Array.from(new Set(parts));
  const lotInfo = uniqueParts.join(". ").trim();

  if (!lotInfo) {
    return description;
  }

  return lotInfo === description ? undefined : lotInfo;
}

function joinNamedPairs(entries: Record<string, unknown>[], maxItems: number): string | undefined {
  const parts = entries
    .slice(0, maxItems)
    .map((entry) => {
      const name =
        readString(entry.characteristicName) ??
        readString(entry.name) ??
        readString(entry.codeName) ??
        undefined;
      const value =
        readString(entry.characteristicValue) ??
        readString(entry.value) ??
        readString(entry.text) ??
        undefined;

      if (name && value) {
        return `${name}: ${value}`;
      }

      return value ?? name;
    })
    .filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join("; ") : undefined;
}

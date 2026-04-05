import type { CollectedRawRecord } from "../adapter";
import type { EisParsedNotice } from "./types";

const NPP_FOCUS_MATCHERS = [
  {
    canonical: "Балаковская атомная станция",
    variants: ["балаковская атомная станция", "балаковская аэс", "балаковская аэс-авто"]
  },
  {
    canonical: "Белоярская атомная станция",
    variants: ["белоярская атомная станция", "белоярская аэс"]
  },
  {
    canonical: "Билибинская атомная станция",
    variants: ["билибинская атомная станция", "билибинская аэс"]
  },
  {
    canonical: "Калининская атомная станция",
    variants: ["калининская атомная станция", "калининская аэс", "калининская аэс-сервис"]
  },
  {
    canonical: "Кольская атомная станция",
    variants: ["кольская атомная станция", "кольская аэс"]
  },
  {
    canonical: "Курская атомная станция",
    variants: ["курская атомная станция", "курская аэс", "курская аэс-сервис"]
  },
  {
    canonical: "Ленинградская атомная станция",
    variants: ["ленинградская атомная станция", "ленинградская аэс", "ленинградская аэс-авто"]
  },
  {
    canonical: "Нововоронежская атомная станция",
    variants: ["нововоронежская атомная станция", "нововоронежская аэс"]
  },
  {
    canonical: "Ростовская атомная станция",
    variants: ["ростовская атомная станция", "ростовская аэс"]
  },
  {
    canonical: "Смоленская атомная станция",
    variants: ["смоленская атомная станция", "смоленская аэс", "смоленская аэс-сервис"]
  }
] as const;

export function mapEisNoticeToCollectedRecord(input: {
  notice: EisParsedNotice;
  html: string;
  matchedQuery?: string;
  portalName: string;
  sourceCode: string;
  sourceName: string;
  sourceType: "procurement" | "contract";
  fallbackExternalId?: string;
}): CollectedRawRecord {
  const { html, matchedQuery, portalName, sourceCode, sourceName, sourceType, fallbackExternalId } = input;
  const notice = {
    ...input.notice,
    externalId:
      input.notice.externalId === "unknown" ? fallbackExternalId ?? input.notice.externalId : input.notice.externalId,
    sourceName,
    sourceType
  };
  const targetStationName = extractTargetStationName(notice, matchedQuery);

  return {
    url: notice.externalUrl,
    raw: {
      sourceName: notice.sourceName,
      sourceType: notice.sourceType,
      externalId: notice.externalId,
      externalUrl: notice.externalUrl,
      sourcePageUrl: notice.sourcePageUrl,
      title: notice.title,
      description: notice.description,
      customerName: notice.customerName,
      supplierName: notice.supplierName,
      status: notice.status,
      publishedAt: notice.publishedAt,
      applicationDeadline: notice.applicationDeadline,
      initialPrice: notice.initialPrice,
      currency: notice.currency,
      region: notice.region,
      portalName,
      matchedQuery: matchedQuery ?? null,
      targetStationName: targetStationName ?? null,
      checksum: notice.checksum
    },
    metadata: {
      adapter: sourceCode,
      sourceType: notice.sourceType,
      portalName,
      matchedQuery: matchedQuery ?? null,
      targetStationName: targetStationName ?? null
    },
    artifacts: [
      {
        kind: "RAW_HTML",
        fileName: `${sourceCode}-${notice.externalId}.html`,
        contentType: "text/html; charset=utf-8",
        body: html,
        metadata: {
          externalId: notice.externalId,
          externalUrl: notice.externalUrl,
          source: sourceCode,
          portalName,
          matchedQuery: matchedQuery ?? null,
          targetStationName: targetStationName ?? null
        }
      }
    ]
  };
}

function extractTargetStationName(
  notice: Pick<EisParsedNotice, "title" | "description" | "customerName" | "supplierName">,
  matchedQuery?: string
): string | undefined {
  const haystack = [
    notice.title,
    notice.description,
    notice.customerName,
    notice.supplierName,
    matchedQuery
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return undefined;
  }

  return NPP_FOCUS_MATCHERS.find((term) =>
    term.variants.some((variant) => haystack.includes(variant))
  )?.canonical;
}

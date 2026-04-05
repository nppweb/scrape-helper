import type { CollectedRawRecord } from "../adapter";
import type { EisParsedNotice } from "./types";

const NPP_FOCUS_TERMS = [
  "Балаковская атомная станция",
  "Белоярская атомная станция",
  "Билибинская атомная станция",
  "Калининская атомная станция",
  "Кольская атомная станция",
  "Курская атомная станция",
  "Ленинградская атомная станция",
  "Нововоронежская атомная станция",
  "Ростовская атомная станция",
  "Смоленская атомная станция"
];

export function mapEisNoticeToCollectedRecord(input: {
  notice: EisParsedNotice;
  html: string;
  matchedQuery?: string;
}): CollectedRawRecord {
  const { notice, html, matchedQuery } = input;
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
      status: notice.status,
      publishedAt: notice.publishedAt,
      applicationDeadline: notice.applicationDeadline,
      initialPrice: notice.initialPrice,
      currency: notice.currency,
      region: notice.region,
      matchedQuery: matchedQuery ?? null,
      targetStationName: targetStationName ?? null,
      checksum: notice.checksum
    },
    metadata: {
      adapter: "eis",
      sourceType: notice.sourceType,
      matchedQuery: matchedQuery ?? null,
      targetStationName: targetStationName ?? null
    },
    artifacts: [
      {
        kind: "RAW_HTML",
        fileName: `eis-${notice.externalId}.html`,
        contentType: "text/html; charset=utf-8",
        body: html,
        metadata: {
          externalId: notice.externalId,
          externalUrl: notice.externalUrl,
          source: "eis",
          matchedQuery: matchedQuery ?? null,
          targetStationName: targetStationName ?? null
        }
      }
    ]
  };
}

function extractTargetStationName(
  notice: Pick<EisParsedNotice, "title" | "description">,
  matchedQuery?: string
): string | undefined {
  const haystack = [notice.title, notice.description, matchedQuery]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!haystack) {
    return undefined;
  }

  return NPP_FOCUS_TERMS.find((term) => haystack.includes(term.toLowerCase()));
}

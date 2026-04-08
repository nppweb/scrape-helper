import type { CollectedRawRecord } from "../adapter";
import { resolveNppStationNameFromText } from "./npp-stations";
import type { EisParsedNotice } from "./types";

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
  const targetStationName = extractTargetStationName(notice, sourceType, matchedQuery);

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
  sourceType: "procurement" | "contract",
  matchedQuery?: string
): string | undefined {
  const directMatch = resolveNppStationNameFromText([
    notice.title,
    notice.description,
    notice.customerName,
    notice.supplierName
  ]);

  if (directMatch) {
    return directMatch;
  }

  if (sourceType === "contract") {
    return resolveNppStationNameFromText([matchedQuery]);
  }

  return undefined;
}

import type { CollectedRawRecord } from "../adapter";
import type { EisParsedNotice } from "./types";

export function mapEisNoticeToCollectedRecord(input: {
  notice: EisParsedNotice;
  html: string;
}): CollectedRawRecord {
  const { notice, html } = input;

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
      checksum: notice.checksum
    },
    metadata: {
      adapter: "eis",
      sourceType: notice.sourceType
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
          source: "eis"
        }
      }
    ]
  };
}

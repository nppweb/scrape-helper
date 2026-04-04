import type { CollectedRawRecord } from "../adapter";
import type { EasuzParsedNotice } from "./types";

export function mapEasuzNoticeToCollectedRecord(input: {
  notice: EasuzParsedNotice;
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
      customerInn: notice.customerInn,
      status: notice.status,
      publishedAt: notice.publishedAt,
      applicationDeadline: notice.applicationDeadline,
      initialPrice: notice.initialPrice,
      currency: notice.currency,
      region: notice.region,
      registryNumber: notice.registryNumber,
      eisRegistrationNumber: notice.eisRegistrationNumber,
      procurementType: notice.procurementType,
      platformName: notice.platformName,
      checksum: notice.checksum
    },
    metadata: {
      adapter: "easuz",
      sourceType: notice.sourceType
    },
    artifacts: [
      {
        kind: "RAW_HTML",
        fileName: `easuz-${notice.externalId}.html`,
        contentType: "text/html; charset=utf-8",
        body: html,
        metadata: {
          externalId: notice.externalId,
          externalUrl: notice.externalUrl,
          source: "easuz"
        }
      }
    ]
  };
}

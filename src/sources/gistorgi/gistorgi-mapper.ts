import type { CollectedRawRecord } from "../adapter";
import type { GistorgiParsedLot } from "./types";

export function mapGistorgiLotToCollectedRecord(input: {
  lot: GistorgiParsedLot;
  html: string;
}): CollectedRawRecord {
  const { lot, html } = input;

  return {
    url: lot.externalUrl,
    raw: {
      sourceName: lot.sourceName,
      sourceType: lot.sourceType,
      externalId: lot.externalId,
      externalUrl: lot.externalUrl,
      sourcePageUrl: lot.sourcePageUrl,
      title: lot.title,
      description: lot.description,
      organizerName: lot.organizerName,
      organizerInn: lot.organizerInn,
      auctionType: lot.auctionType,
      status: lot.status,
      publishedAt: lot.publishedAt,
      applicationDeadline: lot.applicationDeadline,
      biddingDate: lot.biddingDate,
      startPrice: lot.startPrice,
      currency: lot.currency,
      region: lot.region,
      lotInfo: lot.lotInfo,
      checksum: lot.checksum
    },
    metadata: {
      adapter: "gistorgi",
      sourceType: lot.sourceType
    },
    artifacts: [
      {
        kind: "RAW_HTML",
        fileName: `gistorgi-${lot.externalId}.html`,
        contentType: "text/html; charset=utf-8",
        body: html,
        metadata: {
          externalId: lot.externalId,
          externalUrl: lot.externalUrl,
          source: "gistorgi"
        }
      }
    ]
  };
}

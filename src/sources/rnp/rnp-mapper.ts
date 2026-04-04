import type { CollectedRawRecord } from "../adapter";
import type { RnpParsedEntry } from "./types";

export function mapRnpEntryToCollectedRecord(input: {
  entry: RnpParsedEntry;
  html: string;
}): CollectedRawRecord {
  const { entry, html } = input;

  return {
    url: entry.externalUrl,
    raw: {
      sourceName: entry.sourceName,
      sourceType: entry.sourceType,
      externalId: entry.externalId,
      externalUrl: entry.externalUrl,
      sourcePageUrl: entry.sourcePageUrl,
      supplierName: entry.supplierName,
      supplierInn: entry.supplierInn,
      supplierOgrn: entry.supplierOgrn,
      registryStatus: entry.registryStatus,
      reason: entry.reason,
      decisionDate: entry.decisionDate,
      inclusionDate: entry.inclusionDate,
      exclusionDate: entry.exclusionDate,
      customerName: entry.customerName,
      legalBasis: entry.legalBasis,
      region: entry.region,
      checksum: entry.checksum
    },
    metadata: {
      adapter: "rnp",
      sourceType: entry.sourceType
    },
    artifacts: [
      {
        kind: "RAW_HTML",
        fileName: `rnp-${entry.externalId}.html`,
        contentType: "text/html; charset=utf-8",
        body: html,
        metadata: {
          externalId: entry.externalId,
          externalUrl: entry.externalUrl,
          source: "rnp"
        }
      }
    ]
  };
}

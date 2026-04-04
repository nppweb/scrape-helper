import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { FnsClient } from "./fns-client";
import { mapFnsCompanyToCollectedRecord } from "./fns-mapper";

type FnsSourceConfig = {
  baseUrl: string;
  lookupQueries: string[];
  maxItems: number;
  userAgent: string;
  downloadExtract: boolean;
};

export function createFnsSourceAdapter(config: FnsSourceConfig): SourceAdapter {
  const client = new FnsClient(config);

  return {
    code: "fns",
    name: "ФНС ЕГРЮЛ/ЕГРИП",
    async collect(context) {
      if (config.lookupQueries.length === 0) {
        context.logger.warn("fns source enabled without lookup queries; skipping run");
        return [];
      }

      context.logger.info(
        {
          lookupQueries: config.lookupQueries.length,
          maxItems: config.maxItems,
          downloadExtract: config.downloadExtract
        },
        "fns enrichment fetch started"
      );

      const records: CollectedRawRecord[] = [];
      const seenExternalIds = new Set<string>();

      for (const query of config.lookupQueries) {
        try {
          const results = await client.lookupCompanies(
            query,
            context.logger.child({ source: "fns", lookupQuery: query }),
            context.requestTimeoutMs
          );

          for (const result of results) {
            if (seenExternalIds.has(result.company.externalId)) {
              continue;
            }

            seenExternalIds.add(result.company.externalId);
            records.push(
              mapFnsCompanyToCollectedRecord({
                company: result.company,
                rawJson: result.rawJson,
                lookupQuery: query,
                extractPdf: result.extractPdf
              })
            );
          }
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: "fns",
              lookupQuery: query
            },
            "fns lookup failed; skipping query"
          );
        }
      }

      context.logger.info(
        {
          source: "fns",
          itemsCollected: records.length,
          lookupQueries: config.lookupQueries.length
        },
        "fns enrichment records collected"
      );

      return records;
    }
  };
}

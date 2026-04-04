import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { EisClient } from "./eis-client";
import { mapEisNoticeToCollectedRecord } from "./eis-mapper";

type EisSourceConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export function createEisSourceAdapter(config: EisSourceConfig): SourceAdapter {
  const client = new EisClient({
    baseUrl: config.baseUrl,
    searchUrl: config.searchUrl,
    maxItems: config.maxItems,
    userAgent: config.userAgent
  });

  return {
    code: "eis",
    name: "ЕИС / zakupki.gov.ru",
    async collect(context) {
      context.logger.info(
        {
          searchUrl: config.searchUrl,
          maxItems: config.maxItems
        },
        "eis fetch started"
      );

      const links = await client.listNoticeLinks(context.logger, context.requestTimeoutMs);
      const records: CollectedRawRecord[] = [];

      for (const link of links) {
        try {
          const { html, notice } = await client.fetchNotice(
            link.detailUrl,
            context.logger.child({
              source: "eis",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs
          );

          records.push(mapEisNoticeToCollectedRecord({ notice, html }));
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: "eis",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            },
            "eis notice fetch failed; skipping item"
          );
        }
      }

      context.logger.info(
        {
          source: "eis",
          itemsCollected: records.length,
          searchResults: links.length
        },
        "eis notices collected"
      );

      return records;
    }
  };
}

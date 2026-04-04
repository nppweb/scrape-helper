import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { EasuzClient } from "./easuz-client";
import { mapEasuzNoticeToCollectedRecord } from "./easuz-mapper";

type EasuzSourceConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export function createEasuzSourceAdapter(config: EasuzSourceConfig): SourceAdapter {
  const client = new EasuzClient({
    baseUrl: config.baseUrl,
    searchUrl: config.searchUrl,
    maxItems: config.maxItems,
    userAgent: config.userAgent
  });

  return {
    code: "easuz",
    name: "ЕАСУЗ Московской области",
    async collect(context) {
      context.logger.info(
        {
          searchUrl: config.searchUrl,
          maxItems: config.maxItems
        },
        "easuz fetch started"
      );

      const links = await client.listNoticeLinks(context.logger, context.requestTimeoutMs);
      const records: CollectedRawRecord[] = [];

      for (const link of links) {
        try {
          const { html, notice } = await client.fetchNotice(
            link.detailUrl,
            context.logger.child({
              source: "easuz",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs
          );

          records.push(mapEasuzNoticeToCollectedRecord({ notice, html }));
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: "easuz",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            },
            "easuz notice fetch failed; skipping item"
          );
        }
      }

      context.logger.info(
        {
          source: "easuz",
          itemsCollected: records.length,
          searchResults: links.length
        },
        "easuz notices collected"
      );

      return records;
    }
  };
}

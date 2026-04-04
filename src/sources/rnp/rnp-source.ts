import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { RnpClient } from "./rnp-client";
import { mapRnpEntryToCollectedRecord } from "./rnp-mapper";

type RnpSourceConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export function createRnpSourceAdapter(config: RnpSourceConfig): SourceAdapter {
  const client = new RnpClient({
    baseUrl: config.baseUrl,
    searchUrl: config.searchUrl,
    maxItems: config.maxItems,
    userAgent: config.userAgent
  });

  return {
    code: "rnp",
    name: "Реестр недобросовестных поставщиков",
    async collect(context) {
      context.logger.info(
        {
          searchUrl: config.searchUrl,
          maxItems: config.maxItems
        },
        "rnp fetch started"
      );

      const links = await client.listEntryLinks(context.logger, context.requestTimeoutMs);
      const records: CollectedRawRecord[] = [];

      for (const link of links) {
        try {
          const { html, entry } = await client.fetchEntry(
            link.detailUrl,
            context.logger.child({
              source: "rnp",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs
          );

          records.push(mapRnpEntryToCollectedRecord({ entry, html }));
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: "rnp",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            },
            "rnp detail fetch failed; skipping item"
          );
        }
      }

      context.logger.info(
        {
          source: "rnp",
          itemsCollected: records.length,
          searchResults: links.length
        },
        "rnp entries collected"
      );

      return records;
    }
  };
}

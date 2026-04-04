import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { FedresursClient } from "./fedresurs-client";
import { mapFedresursMessageToCollectedRecord } from "./fedresurs-mapper";

type FedresursSourceConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export function createFedresursSourceAdapter(config: FedresursSourceConfig): SourceAdapter {
  const client = new FedresursClient(config);

  return {
    code: "fedresurs",
    name: "Федресурс",
    async collect(context) {
      context.logger.info(
        {
          searchUrl: config.searchUrl,
          maxItems: config.maxItems
        },
        "fedresurs fetch started"
      );

      const links = await client.listMessageLinks(context.logger, context.requestTimeoutMs);
      const records: CollectedRawRecord[] = [];

      for (const link of links) {
        try {
          const { html, message } = await client.fetchMessage(
            link.detailUrl,
            context.logger.child({
              source: "fedresurs",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs
          );

          records.push(mapFedresursMessageToCollectedRecord({ message, html }));
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: "fedresurs",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            },
            "fedresurs detail fetch failed; skipping item"
          );
        }
      }

      context.logger.info(
        {
          source: "fedresurs",
          itemsCollected: records.length,
          searchResults: links.length
        },
        "fedresurs messages collected"
      );

      return records;
    }
  };
}

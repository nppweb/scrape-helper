import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { GistorgiClient } from "./gistorgi-client";
import { mapGistorgiLotToCollectedRecord } from "./gistorgi-mapper";

type GistorgiSourceConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export function createGistorgiSourceAdapter(config: GistorgiSourceConfig): SourceAdapter {
  const client = new GistorgiClient(config);

  return {
    code: "gistorgi",
    name: "ГИС Торги",
    async collect(context) {
      context.logger.info(
        { searchUrl: config.searchUrl, maxItems: config.maxItems },
        "gistorgi fetch started"
      );

      const links = await client.listLotLinks(context.logger, context.requestTimeoutMs);
      const records: CollectedRawRecord[] = [];

      for (const link of links) {
        try {
          const { html, lot } = await client.fetchLot(
            link.detailUrl,
            context.logger.child({
              source: "gistorgi",
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs
          );

          records.push(mapGistorgiLotToCollectedRecord({ lot, html }));
        } catch (error) {
          context.logger.warn(
            { err: error, source: "gistorgi", externalId: link.externalId, detailUrl: link.detailUrl },
            "gistorgi detail fetch failed; skipping item"
          );
        }
      }

      context.logger.info(
        { source: "gistorgi", itemsCollected: records.length, searchResults: links.length },
        "gistorgi lots collected"
      );

      return records;
    }
  };
}

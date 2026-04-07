import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { RnpClient } from "./rnp-client";
import { mapRnpEntryToCollectedRecord } from "./rnp-mapper";

type RnpSourceConfig = {
  baseUrl: string;
  searchUrls: string[];
  maxItems: number;
  userAgent: string;
};

export function createRnpSourceAdapter(config: RnpSourceConfig): SourceAdapter {
  const client = new RnpClient({
    baseUrl: config.baseUrl,
    maxItems: config.maxItems,
    userAgent: config.userAgent
  });

  return {
    code: "rnp",
    name: "Реестр недобросовестных поставщиков",
    async collect(context) {
      context.logger.info(
        {
          searchUrls: config.searchUrls,
          maxItems: config.maxItems
        },
        "rnp fetch started"
      );

      const links = new Map<string, Awaited<ReturnType<RnpClient["listEntryLinksFromUrl"]>>[number]>();

      for (const searchUrl of config.searchUrls) {
        const searchCategory = resolveSearchCategory(searchUrl);
        const searchLinks = await client.listEntryLinksFromUrl(
          searchUrl,
          context.logger.child({ source: "rnp", searchCategory, searchUrl }),
          context.requestTimeoutMs
        );

        for (const link of searchLinks) {
          if (!links.has(link.externalId)) {
            links.set(link.externalId, {
              ...link,
              searchCategory
            });
          }
        }
      }

      if (links.size === 0) {
        throw new Error(
          "РНП не вернул ни одной записи. Вероятно, изменилась выдача поиска, фильтры или доступ к zakupki.gov.ru ограничен."
        );
      }

      const records: CollectedRawRecord[] = [];

      for (const link of links.values()) {
        try {
          const { html, entry } = await client.fetchEntry(
            link.detailUrl,
            context.logger.child({
              source: "rnp",
              searchCategory: link.searchCategory,
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs
          );

          records.push(
            mapRnpEntryToCollectedRecord({
              entry: {
                ...entry,
                searchCategory: link.searchCategory
              },
              html
            })
          );
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: "rnp",
              searchCategory: link.searchCategory,
              externalId: link.externalId,
              detailUrl: link.detailUrl
            },
            "rnp detail fetch failed; skipping item"
          );
        }
      }

      if (records.length === 0) {
        throw new Error(
          "РНП вернул ссылки на записи, но не удалось разобрать ни одну карточку поставщика."
        );
      }

      if (records.length < links.size) {
        context.logger.warn(
          {
            source: "rnp",
            searchResults: links.size,
            itemsCollected: records.length,
            itemsSkipped: links.size - records.length
          },
          "rnp collected partially"
        );
      }

      context.logger.info(
        {
          source: "rnp",
          itemsCollected: records.length,
          searchResults: links.size
        },
        "rnp entries collected"
      );

      return records;
    }
  };
}

function resolveSearchCategory(searchUrl: string): string {
  if (searchUrl.includes("fz223=on")) {
    return "223-fz";
  }

  if (searchUrl.includes("fz44=on")) {
    return "44-fz";
  }

  return "all";
}

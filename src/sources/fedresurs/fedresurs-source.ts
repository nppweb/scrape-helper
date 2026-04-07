import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { FedresursClient } from "./fedresurs-client";
import { mapFedresursMessageToCollectedRecord } from "./fedresurs-mapper";

type FedresursSourceConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
  apiUrl?: string;
  apiLogin?: string;
  apiPassword?: string;
  apiLookbackDays?: number;
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
          maxItems: config.maxItems,
          officialApiEnabled: client.hasOfficialApiConfig()
        },
        "fedresurs fetch started"
      );

      if (client.hasOfficialApiConfig()) {
        const messages = await client.listRecentMessagesFromApi(
          context.logger,
          context.requestTimeoutMs
        );

        if (messages.length === 0) {
          throw new Error(
            "Fedresurs API не вернул ни одного сообщения за расчётное окно. Проверьте учётные данные и лимиты доступа."
          );
        }

        context.logger.info(
          {
            source: "fedresurs",
            itemsCollected: messages.length,
            collectionMode: "official-api"
          },
          "fedresurs messages collected"
        );

        return messages.map(({ message, rawJson }) =>
          mapFedresursMessageToCollectedRecord({
            message,
            rawDocument: rawJson,
            artifactKind: "RAW_JSON",
            artifactContentType: "application/json; charset=utf-8",
            artifactFileExtension: "json"
          })
        );
      }

      const links = await client.listMessageLinks(context.logger, context.requestTimeoutMs);
      if (links.length === 0) {
        throw new Error(
          "Федресурс больше не отдаёт публичный HTML-список сообщений. Для стабильного сбора задайте FEDRESURS_API_URL, FEDRESURS_API_LOGIN и FEDRESURS_API_PASSWORD для официального REST API."
        );
      }

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

          records.push(
            mapFedresursMessageToCollectedRecord({
              message,
              rawDocument: html
            })
          );
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

      if (records.length === 0) {
        throw new Error(
          "Федресурс вернул ссылки на сообщения, но не удалось разобрать ни одну карточку."
        );
      }

      if (records.length < links.length) {
        context.logger.warn(
          {
            source: "fedresurs",
            searchResults: links.length,
            itemsCollected: records.length,
            itemsSkipped: links.length - records.length
          },
          "fedresurs collected partially"
        );
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

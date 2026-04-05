import type { CollectedRawRecord, SourceAdapter } from "../adapter";
import { EisClient } from "./eis-client";
import { mapEisNoticeToCollectedRecord } from "./eis-mapper";

const NPP_ENTITY_TOKENS = [
  "росэнергоатом",
  "российский концерн по производству электрической и тепловой энергии на атомных станциях",
  "государственная корпорация по атомной энергии \"росатом\"",
  "балаковская аэс-авто",
  "калининская аэс-сервис",
  "курская аэс-сервис",
  "ленинградская аэс-авто",
  "смоленская аэс-сервис"
] as const;

const NPP_STATION_TOKENS = [
  "балаковская атомная станция",
  "балаковская аэс",
  "белоярская атомная станция",
  "белоярская аэс",
  "билибинская атомная станция",
  "билибинская аэс",
  "калининская атомная станция",
  "калининская аэс",
  "кольская атомная станция",
  "кольская аэс",
  "курская атомная станция",
  "курская аэс",
  "ленинградская атомная станция",
  "ленинградская аэс",
  "нововоронежская атомная станция",
  "нововоронежская аэс",
  "ростовская атомная станция",
  "ростовская аэс",
  "смоленская атомная станция",
  "смоленская аэс"
] as const;

const NPP_OPERATIONAL_TITLE_TOKENS = [
  "радиоактив",
  "отход",
  "энергоблок",
  "спецкорпус",
  "санитар",
  "производствен",
  "кран",
  "водохранилищ",
  "изыскан",
  "пуско-налад",
  "техническ",
  "проектной и рабочей документации",
  "срока службы",
  "обезвреживание",
  "захоронение"
] as const;

const NPP_EXCLUDED_TITLE_TOKENS = [
  "баскетбол",
  "соревнован",
  "физкультур",
  "спортивн",
  "единая континентальная лига 3х3",
  "кубок победы"
] as const;

type EisSourceConfig = {
  code: string;
  name: string;
  baseUrl: string;
  detailLinkPatterns: string[];
  maxPages: number;
  searchUrl: string;
  searchTerms: string[];
  maxItems: number;
  portalName: string;
  publishDateFrom?: string;
  recordsPerPage: number;
  sourceType: "procurement" | "contract";
  userAgent: string;
};

export function createEisSourceAdapter(config: EisSourceConfig): SourceAdapter {
  const client = new EisClient({
    baseUrl: config.baseUrl,
    detailLinkPatterns: config.detailLinkPatterns,
    maxPages: config.maxPages,
    publishDateFrom: config.publishDateFrom,
    recordsPerPage: config.recordsPerPage,
    searchUrl: config.searchUrl,
    searchTerms: config.searchTerms,
    maxItems: config.maxItems,
    userAgent: config.userAgent
  });

  return {
    code: config.code,
    name: config.name,
    async collect(context) {
      context.logger.info(
        {
          source: config.code,
          publishDateFrom: config.publishDateFrom,
          searchUrl: config.searchUrl,
          searchTerms: config.searchTerms,
          maxItems: config.maxItems,
          maxPages: config.maxPages
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
              source: config.code,
              externalId: link.externalId,
              detailUrl: link.detailUrl
            }),
            context.requestTimeoutMs,
            {
              fallbackExternalId: link.externalId
            }
          );

          if (!isRelevantNppItem(notice)) {
            context.logger.debug(
              {
                source: config.code,
                externalId: link.externalId,
                detailUrl: link.detailUrl,
                matchedQuery: link.matchedQuery
              },
              "eis item skipped as non-npp"
            );
            continue;
          }

          records.push(
            mapEisNoticeToCollectedRecord({
              notice,
              html,
              matchedQuery: link.matchedQuery,
              portalName: config.portalName,
              sourceCode: config.code,
              sourceName: config.name,
              sourceType: config.sourceType,
              fallbackExternalId: link.externalId
            })
          );
        } catch (error) {
          context.logger.warn(
            {
              err: error,
              source: config.code,
              externalId: link.externalId,
              detailUrl: link.detailUrl,
              matchedQuery: link.matchedQuery
            },
            "eis notice fetch failed; skipping item"
          );
        }
      }

      context.logger.info(
        {
          source: config.code,
          itemsCollected: records.length,
          searchResults: links.length
        },
        "eis notices collected"
      );

      return records;
    }
  };
}

function isRelevantNppItem(
  notice: {
    title?: string;
    description?: string;
    customerName?: string;
    supplierName?: string;
  }
): boolean {
  const title = normalize(notice.title);
  const customer = normalize(notice.customerName);
  const supplier = normalize(notice.supplierName);

  if (!title && !customer && !supplier) {
    return false;
  }

  if (title && NPP_EXCLUDED_TITLE_TOKENS.some((token) => title.includes(token))) {
    return false;
  }

  if (matchesAny(customer, NPP_ENTITY_TOKENS) || matchesAny(supplier, NPP_ENTITY_TOKENS)) {
    return true;
  }

  if (matchesAny(title, NPP_STATION_TOKENS)) {
    return true;
  }

  if (
    title.includes("росэнергоатом") &&
    NPP_OPERATIONAL_TITLE_TOKENS.some((token) => title.includes(token))
  ) {
    return true;
  }

  if (
    customer.includes("росатом") &&
    NPP_STATION_TOKENS.some((token) => title.includes(token))
  ) {
    return true;
  }

  return false;
}

function matchesAny(value: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => value.includes(token));
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

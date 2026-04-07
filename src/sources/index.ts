import type { SourceAdapter } from "./adapter";
import { createEasuzSourceAdapter } from "./easuz/easuz-source";
import { createEisSourceAdapter } from "./eis/eis-source";
import { createFedresursSourceAdapter } from "./fedresurs/fedresurs-source";
import { createFnsSourceAdapter } from "./fns/fns-source";
import { createGistorgiSourceAdapter } from "./gistorgi/gistorgi-source";
import { createRnpSourceAdapter } from "./rnp/rnp-source";

type AppConfig = (typeof import("../config"))["config"];
type SourceResolverConfig = Pick<
  AppConfig,
  | "EASUZ_BASE_URL"
  | "EASUZ_MAX_ITEMS"
  | "EASUZ_SEARCH_URL"
  | "EASUZ_USER_AGENT"
  | "EIS_BASE_URL"
  | "EIS_CONTRACTS_223_MAX_ITEMS"
  | "EIS_CONTRACTS_223_SEARCH_URL"
  | "EIS_CONTRACTS_MAX_ITEMS"
  | "EIS_CONTRACTS_SEARCH_URL"
  | "EIS_MAX_ITEMS"
  | "EIS_MAX_PAGES"
  | "EIS_PUBLISH_DATE_FROM"
  | "EIS_RECORDS_PER_PAGE"
  | "EIS_SEARCH_URL"
  | "EIS_SEARCH_TERMS"
  | "EIS_USER_AGENT"
  | "ENABLED_SOURCES"
  | "FEDRESURS_BASE_URL"
  | "FEDRESURS_MAX_ITEMS"
  | "FEDRESURS_SEARCH_URL"
  | "FEDRESURS_USER_AGENT"
  | "FNS_BASE_URL"
  | "FNS_DOWNLOAD_EXTRACT"
  | "FNS_LOOKUP_QUERIES"
  | "FNS_MAX_ITEMS"
  | "FNS_USER_AGENT"
  | "GISTORGI_BASE_URL"
  | "GISTORGI_MAX_ITEMS"
  | "GISTORGI_SEARCH_URL"
  | "GISTORGI_USER_AGENT"
  | "RNP_BASE_URL"
  | "RNP_MAX_ITEMS"
  | "RNP_SEARCH_URL"
  | "RNP_SEARCH_URLS"
  | "RNP_USER_AGENT"
>;

type SourceFactory = () => SourceAdapter;

export const SUPPORTED_SOURCE_CODES = [
  "easuz",
  "eis",
  "eis_contracts",
  "eis_contracts_223",
  "rnp",
  "fedresurs",
  "fns",
  "gistorgi"
] as const;

export type EnabledSourcesResolution = {
  requestedCodes: string[];
  loadedCodes: string[];
  unknownCodes: string[];
  fallbackApplied: boolean;
  adapters: SourceAdapter[];
};

export function resolveEnabledSources(config: SourceResolverConfig): EnabledSourcesResolution {
  const factories = createSourceFactories(config);
  const requestedCodes = config.ENABLED_SOURCES;
  const knownCodes = requestedCodes.filter((code) => code in factories);
  const unknownCodes = requestedCodes.filter((code) => !(code in factories));
  const fallbackApplied = false;
  const loadedCodes = knownCodes;

  return {
    requestedCodes,
    loadedCodes,
    unknownCodes,
    fallbackApplied,
    adapters: loadedCodes.map((code) => factories[code]())
  };
}

function createSourceFactories(config: SourceResolverConfig): Record<string, SourceFactory> {
  const contractSearchTerms = buildContractSearchTerms(config.EIS_SEARCH_TERMS);
  const contract223MaxPages = Math.min(config.EIS_MAX_PAGES, 20);
  const contract223MaxItems = Math.min(config.EIS_CONTRACTS_223_MAX_ITEMS, 240);

  return {
    easuz: () =>
      createEasuzSourceAdapter({
        baseUrl: config.EASUZ_BASE_URL,
        searchUrl: config.EASUZ_SEARCH_URL,
        maxItems: config.EASUZ_MAX_ITEMS,
        userAgent: config.EASUZ_USER_AGENT
      }),
    fedresurs: () =>
      createFedresursSourceAdapter({
        baseUrl: config.FEDRESURS_BASE_URL,
        searchUrl: config.FEDRESURS_SEARCH_URL,
        maxItems: config.FEDRESURS_MAX_ITEMS,
        userAgent: config.FEDRESURS_USER_AGENT
      }),
    fns: () =>
      createFnsSourceAdapter({
        baseUrl: config.FNS_BASE_URL,
        lookupQueries: config.FNS_LOOKUP_QUERIES,
        maxItems: config.FNS_MAX_ITEMS,
        userAgent: config.FNS_USER_AGENT,
        downloadExtract: config.FNS_DOWNLOAD_EXTRACT
      }),
    gistorgi: () =>
      createGistorgiSourceAdapter({
        baseUrl: config.GISTORGI_BASE_URL,
        searchUrl: config.GISTORGI_SEARCH_URL,
        maxItems: config.GISTORGI_MAX_ITEMS,
        userAgent: config.GISTORGI_USER_AGENT
      }),
    eis: () =>
      createEisSourceAdapter({
        code: "eis",
        name: "ЕИС / zakupki.gov.ru",
        baseUrl: config.EIS_BASE_URL,
        detailLinkPatterns: ["/epz/order/notice/", "/epz/order/extendedsearch/"],
        maxPages: config.EIS_MAX_PAGES,
        searchUrl: config.EIS_SEARCH_URL,
        searchTerms: config.EIS_SEARCH_TERMS,
        maxItems: config.EIS_MAX_ITEMS,
        portalName: "ЕИС / zakupki.gov.ru",
        publishDateFrom: config.EIS_PUBLISH_DATE_FROM,
        recordsPerPage: config.EIS_RECORDS_PER_PAGE,
        sourceType: "procurement",
        userAgent: config.EIS_USER_AGENT
      }),
    eis_contracts: () =>
      createEisSourceAdapter({
        code: "eis_contracts",
        name: "ЕИС / реестр контрактов 44-ФЗ",
        baseUrl: config.EIS_BASE_URL,
        detailLinkPatterns: ["/epz/contract/contractCard/common-info.html"],
        maxPages: config.EIS_MAX_PAGES,
        searchUrl: config.EIS_CONTRACTS_SEARCH_URL,
        searchTerms: contractSearchTerms,
        maxItems: config.EIS_CONTRACTS_MAX_ITEMS,
        portalName: "ЕИС / реестр контрактов 44-ФЗ",
        publishDateFrom: config.EIS_PUBLISH_DATE_FROM,
        recordsPerPage: config.EIS_RECORDS_PER_PAGE,
        sourceType: "contract",
        userAgent: config.EIS_USER_AGENT
      }),
    eis_contracts_223: () =>
      createEisSourceAdapter({
        code: "eis_contracts_223",
        name: "ЕИС / реестр договоров 223-ФЗ",
        baseUrl: config.EIS_BASE_URL,
        detailLinkPatterns: ["/epz/contractfz223/card/contract-info.html"],
        maxPages: contract223MaxPages,
        searchUrl: config.EIS_CONTRACTS_223_SEARCH_URL,
        searchTerms: contractSearchTerms,
        maxItems: contract223MaxItems,
        portalName: "ЕИС / реестр договоров 223-ФЗ",
        publishDateFrom: config.EIS_PUBLISH_DATE_FROM,
        recordsPerPage: config.EIS_RECORDS_PER_PAGE,
        sourceType: "contract",
        userAgent: config.EIS_USER_AGENT
      }),
    rnp: () =>
      createRnpSourceAdapter({
        baseUrl: config.RNP_BASE_URL,
        searchUrls: config.RNP_SEARCH_URLS.length > 0 ? config.RNP_SEARCH_URLS : [config.RNP_SEARCH_URL],
        maxItems: config.RNP_MAX_ITEMS,
        userAgent: config.RNP_USER_AGENT
      })
  };
}

function buildContractSearchTerms(searchTerms: string[]): string[] {
  const filteredTerms = searchTerms.filter((term) => {
    const normalized = term.trim().toLowerCase();

    return (
      normalized.includes("росэнергоатом") ||
      normalized.includes("российский концерн по производству электрической и тепловой энергии на атомных станциях") ||
      normalized.includes("росатом") ||
      normalized.includes("аэс-авто") ||
      normalized.includes("аэс-сервис")
    );
  });

  return filteredTerms.length > 0 ? filteredTerms : searchTerms;
}

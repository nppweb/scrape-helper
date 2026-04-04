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
  | "EIS_MAX_ITEMS"
  | "EIS_SEARCH_URL"
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
  | "RNP_USER_AGENT"
>;

type SourceFactory = () => SourceAdapter;

export const SUPPORTED_SOURCE_CODES = [
  "easuz",
  "eis",
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
        baseUrl: config.EIS_BASE_URL,
        searchUrl: config.EIS_SEARCH_URL,
        maxItems: config.EIS_MAX_ITEMS,
        userAgent: config.EIS_USER_AGENT
      }),
    rnp: () =>
      createRnpSourceAdapter({
        baseUrl: config.RNP_BASE_URL,
        searchUrl: config.RNP_SEARCH_URL,
        maxItems: config.RNP_MAX_ITEMS,
        userAgent: config.RNP_USER_AGENT
      })
  };
}

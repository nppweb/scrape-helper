import { describe, expect, it } from "vitest";
import { resolveEnabledSources } from "./index";

describe("resolveEnabledSources", () => {
  it("keeps known sources from ENABLED_SOURCES", () => {
    const resolution = resolveEnabledSources({
      ENABLED_SOURCES: [
        "easuz",
        "eis",
        "rnp",
        "fedresurs",
        "fns",
        "gistorgi"
      ],
      EASUZ_BASE_URL: "https://easuz.mosreg.ru",
      EASUZ_SEARCH_URL: "https://easuz.mosreg.ru/tenders",
      EASUZ_MAX_ITEMS: 5,
      EASUZ_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      GISTORGI_BASE_URL: "https://torgi.gov.ru",
      GISTORGI_SEARCH_URL: "https://torgi.gov.ru/new/public/lots/search",
      GISTORGI_MAX_ITEMS: 5,
      GISTORGI_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      FNS_BASE_URL: "https://egrul.nalog.ru",
      FNS_LOOKUP_QUERIES: ["7707083893"],
      FNS_MAX_ITEMS: 2,
      FNS_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      FNS_DOWNLOAD_EXTRACT: true,
      FEDRESURS_BASE_URL: "https://bankrot.fedresurs.ru",
      FEDRESURS_API_URL: "https://bank-publications-prod.fedresurs.ru",
      FEDRESURS_API_LOGIN: undefined,
      FEDRESURS_API_PASSWORD: undefined,
      FEDRESURS_API_LOOKBACK_DAYS: 31,
      FEDRESURS_SEARCH_URL: "https://bankrot.fedresurs.ru/Messages.aspx",
      FEDRESURS_MAX_ITEMS: 5,
      FEDRESURS_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      EIS_BASE_URL: "https://zakupki.gov.ru",
      EIS_SEARCH_URL:
        "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=&morphology=on&sortDirection=false&recordsPerPage=_10&showLotsInfoHidden=false",
      EIS_CONTRACTS_SEARCH_URL:
        "https://zakupki.gov.ru/epz/contract/search/results.html?searchString=&recordsPerPage=_10",
      EIS_CONTRACTS_223_SEARCH_URL:
        "https://zakupki.gov.ru/epz/contractfz223/search/results.html?searchString=&recordsPerPage=_10",
      EIS_SEARCH_TERMS: ["Росэнергоатом", "атомная электростанция"],
      EIS_MAX_ITEMS: 5,
      EIS_CONTRACTS_MAX_ITEMS: 5,
      EIS_CONTRACTS_223_MAX_ITEMS: 5,
      EIS_MAX_PAGES: 3,
      EIS_RECORDS_PER_PAGE: 10,
      EIS_PUBLISH_DATE_FROM: "2025-01-01",
      EIS_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      RNP_BASE_URL: "https://zakupki.gov.ru",
      RNP_SEARCH_URL:
        "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?searchString=&recordsPerPage=_10",
      RNP_SEARCH_URLS: [
        "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?fz44=on&recordsPerPage=_10",
        "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?fz223=on&recordsPerPage=_10"
      ],
      RNP_MAX_ITEMS: 5,
      RNP_USER_AGENT: "NPPWEB/1.0 (+https://example.test)"
    });

    expect(resolution.loadedCodes).toEqual([
      "easuz",
      "eis",
      "rnp",
      "fedresurs",
      "fns",
      "gistorgi"
    ]);
    expect(resolution.unknownCodes).toEqual([]);
    expect(resolution.fallbackApplied).toBe(false);
  });

  it("returns no adapters when env contains only unknown values", () => {
    const resolution = resolveEnabledSources({
      ENABLED_SOURCES: ["unknown-source"],
      EASUZ_BASE_URL: "https://easuz.mosreg.ru",
      EASUZ_SEARCH_URL: "https://easuz.mosreg.ru/tenders",
      EASUZ_MAX_ITEMS: 5,
      EASUZ_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      GISTORGI_BASE_URL: "https://torgi.gov.ru",
      GISTORGI_SEARCH_URL: "https://torgi.gov.ru/new/public/lots/search",
      GISTORGI_MAX_ITEMS: 5,
      GISTORGI_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      FNS_BASE_URL: "https://egrul.nalog.ru",
      FNS_LOOKUP_QUERIES: ["7707083893"],
      FNS_MAX_ITEMS: 2,
      FNS_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      FNS_DOWNLOAD_EXTRACT: true,
      FEDRESURS_BASE_URL: "https://bankrot.fedresurs.ru",
      FEDRESURS_API_URL: "https://bank-publications-prod.fedresurs.ru",
      FEDRESURS_API_LOGIN: undefined,
      FEDRESURS_API_PASSWORD: undefined,
      FEDRESURS_API_LOOKBACK_DAYS: 31,
      FEDRESURS_SEARCH_URL: "https://bankrot.fedresurs.ru/Messages.aspx",
      FEDRESURS_MAX_ITEMS: 5,
      FEDRESURS_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      EIS_BASE_URL: "https://zakupki.gov.ru",
      EIS_SEARCH_URL:
        "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=&morphology=on&sortDirection=false&recordsPerPage=_10&showLotsInfoHidden=false",
      EIS_CONTRACTS_SEARCH_URL:
        "https://zakupki.gov.ru/epz/contract/search/results.html?searchString=&recordsPerPage=_10",
      EIS_CONTRACTS_223_SEARCH_URL:
        "https://zakupki.gov.ru/epz/contractfz223/search/results.html?searchString=&recordsPerPage=_10",
      EIS_SEARCH_TERMS: ["Росэнергоатом", "атомная электростанция"],
      EIS_MAX_ITEMS: 5,
      EIS_CONTRACTS_MAX_ITEMS: 5,
      EIS_CONTRACTS_223_MAX_ITEMS: 5,
      EIS_MAX_PAGES: 3,
      EIS_RECORDS_PER_PAGE: 10,
      EIS_PUBLISH_DATE_FROM: "2025-01-01",
      EIS_USER_AGENT: "NPPWEB/1.0 (+https://example.test)",
      RNP_BASE_URL: "https://zakupki.gov.ru",
      RNP_SEARCH_URL:
        "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?searchString=&recordsPerPage=_10",
      RNP_SEARCH_URLS: [
        "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?fz44=on&recordsPerPage=_10",
        "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?fz223=on&recordsPerPage=_10"
      ],
      RNP_MAX_ITEMS: 5,
      RNP_USER_AGENT: "NPPWEB/1.0 (+https://example.test)"
    });

    expect(resolution.loadedCodes).toEqual([]);
    expect(resolution.adapters).toEqual([]);
    expect(resolution.unknownCodes).toEqual(["unknown-source"]);
    expect(resolution.fallbackApplied).toBe(false);
  });
});

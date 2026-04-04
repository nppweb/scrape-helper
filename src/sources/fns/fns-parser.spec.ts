import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFnsSearchRows } from "./fns-parser";
import type { FnsSearchResultResponse } from "./types";

function readFixture(name: string) {
  return readFileSync(join(process.cwd(), "src", "sources", "fns", "__fixtures__", name), "utf-8");
}

describe("fns-parser", () => {
  it("maps FNS search rows into company enrichment records", () => {
    const payload = JSON.parse(readFixture("search-result.json")) as FnsSearchResultResponse;

    const companies = parseFnsSearchRows(payload.rows ?? [], {
      baseUrl: "https://egrul.nalog.ru",
      maxItems: 5
    });

    expect(companies).toHaveLength(1);
    expect(companies[0]).toMatchObject({
      externalId: "1027700132195",
      externalUrl: "https://egrul.nalog.ru/vyp-download/TOKEN123",
      sourcePageUrl: "https://egrul.nalog.ru/index.html",
      companyName: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"',
      shortName: "ПАО СБЕРБАНК",
      inn: "7707083893",
      kpp: "773601001",
      ogrn: "1027700132195",
      status: "ACTIVE",
      registrationDate: "2002-08-16T00:00:00+03:00",
      liquidationMark: false,
      region: "Г.Москва",
      sourceName: "fns",
      sourceType: "company"
    });
  });
});

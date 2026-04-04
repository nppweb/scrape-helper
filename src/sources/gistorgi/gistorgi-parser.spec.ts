import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGistorgiDetailPage, parseGistorgiSearchResults } from "./gistorgi-parser";

function readFixture(name: string) {
  return readFileSync(join(process.cwd(), "src", "sources", "gistorgi", "__fixtures__", name), "utf-8");
}

describe("gistorgi-parser", () => {
  it("extracts lot links from public search results", () => {
    const html = readFixture("search-results.html");

    const links = parseGistorgiSearchResults(html, {
      baseUrl: "https://torgi.gov.ru",
      maxItems: 10
    });

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      externalId: "22000057000000000046_2",
      detailUrl: "https://torgi.gov.ru/new/public/lots/lot/22000057000000000046_2/(lotInfo:info)",
      title: "Продажа нежилого помещения в г. Москве"
    });
  });

  it("parses auction fields from a lot page", () => {
    const html = readFixture("detail.html");

    const lot = parseGistorgiDetailPage(
      html,
      "https://torgi.gov.ru/new/public/lots/lot/22000057000000000046_2/(lotInfo:info)"
    );

    expect(lot).toMatchObject({
      externalId: "22000057000000000046_2",
      title: "Продажа нежилого помещения в г. Москве",
      description: "Продажа объекта недвижимости площадью 120 кв.м.",
      organizerName: "Департамент городского имущества",
      organizerInn: "7701234567",
      auctionType: "Приватизация",
      status: "Прием заявок",
      publishedAt: "2026-04-01T10:00:00+03:00",
      applicationDeadline: "2026-04-15T18:00:00+03:00",
      biddingDate: "2026-04-20T11:00:00+03:00",
      startPrice: 12500000,
      currency: "RUB",
      region: "г. Москва",
      lotInfo: "Нежилое помещение, этаж 1, отдельный вход.",
      sourceType: "auctions",
      sourceName: "gistorgi"
    });
  });
});

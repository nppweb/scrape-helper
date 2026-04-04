import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEisNoticePage, parseEisSearchResults } from "./eis-parser";

function readFixture(name: string) {
  return readFileSync(join(process.cwd(), "src", "sources", "eis", "__fixtures__", name), "utf-8");
}

describe("eis-parser", () => {
  it("extracts notice links from public search results", () => {
    const html = readFixture("search-results.html");

    const links = parseEisSearchResults(html, {
      baseUrl: "https://zakupki.gov.ru",
      maxItems: 10
    });

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      externalId: "0373100137626000001",
      detailUrl:
        "https://zakupki.gov.ru/epz/order/notice/ea44/view/common-info.html?regNumber=0373100137626000001",
      title: "№ 0373100137626000001"
    });
  });

  it("parses procurement fields from an EIS notice page", () => {
    const html = readFixture("notice.html");

    const notice = parseEisNoticePage(
      html,
      "https://zakupki.gov.ru/epz/order/notice/ea44/view/common-info.html?regNumber=0373100137626000001"
    );

    expect(notice).toMatchObject({
      externalId: "0373100137626000001",
      title: "Поставка серверного оборудования",
      customerName: "ФГБУ «Центр цифрового развития»",
      status: "Подача заявок",
      publishedAt: "2026-04-01T10:15:00+03:00",
      applicationDeadline: "2026-04-10T09:00:00+03:00",
      initialPrice: 1250000,
      currency: "RUB",
      region: "г. Москва",
      sourceType: "procurement",
      sourceName: "eis"
    });
  });
});

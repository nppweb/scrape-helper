import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEasuzNoticePage, parseEasuzSearchResults } from "./easuz-parser";

function readFixture(name: string) {
  return readFileSync(join(process.cwd(), "src", "sources", "easuz", "__fixtures__", name), "utf-8");
}

describe("easuz-parser", () => {
  it("extracts detail links from the public tenders catalog", () => {
    const html = readFixture("search-results.html");

    const links = parseEasuzSearchResults(html, {
      baseUrl: "https://easuz.mosreg.ru",
      maxItems: 10
    });

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      externalId: "385716",
      detailUrl: "https://easuz.mosreg.ru/tenders/385716",
      title:
        "Поставка расходных материалов для внутрисосудистых ультразвуковых исследований (лот 1) для нужд учреждений здравоохранения Московской области в 2025 году (Совместная закупка)"
    });
  });

  it("parses procurement fields from a public EASUZ notice page", () => {
    const html = readFixture("detail.html");

    const notice = parseEasuzNoticePage(html, "https://easuz.mosreg.ru/tenders/385716");

    expect(notice).toMatchObject({
      externalId: "385716",
      title:
        "Поставка расходных материалов для внутрисосудистых ультразвуковых исследований (лот 1) для нужд учреждений здравоохранения Московской области в 2025 году (Совместная закупка)",
      customerName: "КОМИТЕТ ПО КОНКУРЕНТНОЙ ПОЛИТИКЕ МОСКОВСКОЙ ОБЛАСТИ",
      customerInn: "5024139723",
      status: "Закупка завершена",
      publishedAt: "2024-08-21T15:46:00+03:00",
      applicationDeadline: "2024-08-29T10:00:00+03:00",
      initialPrice: 13658140.27,
      currency: "RUB",
      region: "Московская область",
      registryNumber: "060502-24",
      eisRegistrationNumber: "0148200005424000983",
      procurementType: "Иное по 44-ФЗ",
      platformName: "РТС-тендер",
      sourceName: "easuz",
      sourceType: "procurement"
    });
  });
});

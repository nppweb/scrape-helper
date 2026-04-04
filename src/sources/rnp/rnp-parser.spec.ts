import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseRnpDetailPage, parseRnpSearchResults } from "./rnp-parser";

function readFixture(name: string) {
  return readFileSync(join(process.cwd(), "src", "sources", "rnp", "__fixtures__", name), "utf-8");
}

describe("rnp-parser", () => {
  it("extracts entry links from public rnp search results", () => {
    const html = readFixture("search-results.html");

    const links = parseRnpSearchResults(html, {
      baseUrl: "https://zakupki.gov.ru",
      maxItems: 10
    });

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      externalId: "12345678",
      detailUrl: "https://zakupki.gov.ru/epz/dishonestsupplier/view/info.html?dishonestSupplierId=12345678",
      supplierName: 'ООО "Недобросовестный поставщик"'
    });
  });

  it("parses rnp detail fields from public entry page", () => {
    const html = readFixture("detail.html");

    const entry = parseRnpDetailPage(
      html,
      "https://zakupki.gov.ru/epz/dishonestsupplier/view/info.html?dishonestSupplierId=12345678"
    );

    expect(entry).toMatchObject({
      externalId: "12345678",
      supplierName: 'ООО "Недобросовестный поставщик"',
      supplierInn: "7701234567",
      supplierOgrn: "1027700123456",
      registryStatus: "Включен в реестр",
      decisionDate: "2026-03-12T00:00:00+03:00",
      inclusionDate: "2026-03-15T00:00:00+03:00",
      exclusionDate: "2028-03-15T00:00:00+03:00",
      customerName: 'ГБУ "Городской заказчик"',
      legalBasis: "44-ФЗ, статья 104",
      region: "г. Москва",
      sourceType: "registry",
      sourceName: "rnp"
    });
  });
});

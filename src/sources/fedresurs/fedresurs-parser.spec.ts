import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseFedresursDetailPage,
  parseFedresursSearchResults
} from "./fedresurs-parser";

function readFixture(name: string) {
  return readFileSync(
    join(process.cwd(), "src", "sources", "fedresurs", "__fixtures__", name),
    "utf-8"
  );
}

describe("parseFedresursSearchResults", () => {
  it("extracts detail links from public search html", () => {
    const html = readFixture("search-results.html");

    const results = parseFedresursSearchResults(html, {
      baseUrl: "https://bankrot.fedresurs.ru",
      maxItems: 10
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      externalId: "12345678",
      detailUrl: "https://bankrot.fedresurs.ru/MessageWindow.aspx?ID=12345678",
      title: "Сообщение о введении процедуры наблюдения"
    });
  });
});

describe("parseFedresursDetailPage", () => {
  it("extracts bankruptcy signal fields from detail html", () => {
    const html = readFixture("detail.html");

    const message = parseFedresursDetailPage(
      html,
      "https://bankrot.fedresurs.ru/MessageWindow.aspx?ID=12345678"
    );

    expect(message.externalId).toBe("12345678");
    expect(message.messageType).toBe("Сообщение о банкротстве");
    expect(message.subjectName).toBe('ООО "Стройресурс"');
    expect(message.subjectInn).toBe("7701234567");
    expect(message.subjectOgrn).toBe("1027700123456");
    expect(message.publishedAt).toBe("2026-04-03T12:30:00+03:00");
    expect(message.eventDate).toBe("2026-04-01T00:00:00+03:00");
    expect(message.bankruptcyStage).toBe("Наблюдение");
    expect(message.caseNumber).toBe("А40-12345/2026");
    expect(message.courtName).toBe("Арбитражный суд города Москвы");
    expect(message.description).toContain("процедуру наблюдения");
    expect(message.checksum).toHaveLength(64);
  });
});

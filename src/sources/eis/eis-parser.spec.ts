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
      title: "№ 0373100137626000001",
      matchedQuery: undefined
    });
  });

  it("prefers common-info links over print-form modals for the same registration number", () => {
    const html = `
      <html>
        <body>
          <a href="/epz/order/notice/printForm/listModal.html?regNumber=12345678901234567890">Печать</a>
          <a href="/epz/order/notice/ea44/view/common-info.html?regNumber=12345678901234567890">Карточка</a>
        </body>
      </html>
    `;

    const links = parseEisSearchResults(html, {
      baseUrl: "https://zakupki.gov.ru",
      maxItems: 10
    });

    expect(links).toEqual([
      {
        externalId: "12345678901234567890",
        detailUrl:
          "https://zakupki.gov.ru/epz/order/notice/ea44/view/common-info.html?regNumber=12345678901234567890",
        title: "Карточка",
        matchedQuery: undefined
      }
    ]);
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

  it("parses procurement fields from the live common-info layout", () => {
    const html = `
      <html>
        <body>
          <div class="cardMainInfo row">
            <div class="sectionMainInfo borderRight col-6">
              <div class="sectionMainInfo__header">
                <div class="cardMainInfo__title d-flex text-truncate">44-ФЗ</div>
              </div>
              <div class="sectionMainInfo__body">
                <div class="cardMainInfo__section">
                  <span class="cardMainInfo__title">Объект закупки</span>
                  <span class="cardMainInfo__content">Поставка оборудования для АЭС</span>
                </div>
                <div class="cardMainInfo__section">
                  <span class="cardMainInfo__title">Заказчик</span>
                  <span class="cardMainInfo__content">АО Концерн Росэнергоатом</span>
                </div>
              </div>
            </div>
            <div class="sectionMainInfo borderRight col-3 colSpaceBetween">
              <div class="price">
                <span class="cardMainInfo__title">Начальная цена</span>
                <span class="cardMainInfo__content cost">12 500 000,00 ₽</span>
              </div>
              <div class="date">
                <div class="cardMainInfo__section">
                  <span class="cardMainInfo__title">Размещено</span>
                  <span class="cardMainInfo__content">05.04.2026</span>
                </div>
                <div class="cardMainInfo__section">
                  <span class="cardMainInfo__title">Окончание подачи заявок</span>
                  <span class="cardMainInfo__content">10.04.2026 09:00 (МСК)</span>
                </div>
              </div>
            </div>
          </div>
          <div class="container">
            <div class="row blockInfo">
              <div class="col">
                <section class="blockInfo__section section">
                  <span class="section__title">Этап закупки</span>
                  <span class="section__info">Подача заявок</span>
                </section>
                <section class="blockInfo__section section">
                  <span class="section__title">Организация, осуществляющая размещение</span>
                  <span class="section__info">АО Концерн Росэнергоатом</span>
                </section>
                <section class="blockInfo__section section">
                  <span class="section__title">Регион</span>
                  <span class="section__info">Ростовская обл</span>
                </section>
                <section class="blockInfo__section section">
                  <span class="section__title">Начальная (максимальная) цена контракта</span>
                  <span class="section__info">12 500 000,00</span>
                </section>
                <section class="blockInfo__section section">
                  <span class="section__title">Валюта</span>
                  <span class="section__info">РОССИЙСКИЙ РУБЛЬ</span>
                </section>
              </div>
            </div>
          </div>
          <div class="partners">
            Поделитесь мнением о качестве работы единой информационной системы
            <a href="http://www.sberbank-ast.ru/">SBERBANK-AST.RU</a>
          </div>
        </body>
      </html>
    `;

    const notice = parseEisNoticePage(
      html,
      "https://zakupki.gov.ru/epz/order/notice/ea20/view/common-info.html?regNumber=0773100000326000001"
    );

    expect(notice).toMatchObject({
      externalId: "0773100000326000001",
      title: "Поставка оборудования для АЭС",
      customerName: "АО Концерн Росэнергоатом",
      status: "Подача заявок",
      publishedAt: "2026-04-05T00:00:00+03:00",
      applicationDeadline: "2026-04-10T09:00:00+03:00",
      initialPrice: 12500000,
      currency: "RUB",
      region: "Ростовская обл"
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildGistorgiPublicLotUrl,
  parseGistorgiDetailResponse,
  parseGistorgiSearchResults
} from "./gistorgi-parser";

describe("gistorgi-parser", () => {
  it("extracts lot links from search api response", () => {
    const rawJson = JSON.stringify({
      content: [
        {
          id: "22000057000000000046_2",
          lotName: "Продажа нежилого помещения в г. Москве"
        },
        {
          id: "22000057000000000047_1",
          lotName: "Продажа земельного участка"
        }
      ]
    });

    const links = parseGistorgiSearchResults(rawJson, {
      baseUrl: "https://torgi.gov.ru",
      maxItems: 10
    });

    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({
      externalId: "22000057000000000046_2",
      detailUrl: buildGistorgiPublicLotUrl(
        "https://torgi.gov.ru",
        "22000057000000000046_2"
      ),
      title: "Продажа нежилого помещения в г. Москве"
    });
  });

  it("parses auction fields from detail api response", () => {
    const rawJson = JSON.stringify({
      id: "22000057000000000046_2",
      lotName: "Продажа нежилого помещения в г. Москве",
      lotDescription: "Продажа объекта недвижимости площадью 120 кв.м.",
      organizerInfo: {
        fullName: "Департамент городского имущества",
        inn: "7701234567"
      },
      biddType: {
        name: "Приватизация"
      },
      lotStatus: "Прием заявок",
      noticeFirstVersionPublicationDate: "2026-04-01T10:00:00+03:00",
      biddEndTime: "2026-04-15T18:00:00+03:00",
      auctionStartDate: "2026-04-20T11:00:00+03:00",
      priceMin: 12500000,
      currencyCode: "RUB",
      subjectRFName: "г. Москва",
      estateAddress: "г. Москва, ул. Тестовая, д. 1",
      characteristics: [
        {
          characteristicName: "Площадь",
          characteristicValue: "120 кв.м."
        }
      ],
      noticeNumber: "22000057000000000046",
      lotNumber: "2",
      category: {
        name: "Недвижимость"
      },
      etpUrl: "https://example-etp.test/auction/22000057000000000046_2",
      typeTransaction: "SALE"
    });

    const lot = parseGistorgiDetailResponse(rawJson, {
      baseUrl: "https://torgi.gov.ru",
      externalId: "22000057000000000046_2"
    });

    expect(lot).toMatchObject({
      externalId: "22000057000000000046_2",
      externalUrl: "https://torgi.gov.ru/new/public/lots/lot/22000057000000000046_2/(lotInfo:info)",
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
      lotInfo: "г. Москва, ул. Тестовая, д. 1. Площадь: 120 кв.м.",
      noticeNumber: "22000057000000000046",
      lotNumber: "2",
      category: "Недвижимость",
      etpUrl: "https://example-etp.test/auction/22000057000000000046_2",
      transactionType: "SALE",
      sourceType: "auctions",
      sourceName: "gistorgi"
    });
  });
});

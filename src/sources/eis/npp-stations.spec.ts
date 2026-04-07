import { describe, expect, it } from "vitest";
import { resolveNppStationNameFromText } from "./npp-stations";

describe("resolveNppStationNameFromText", () => {
  it("recognizes station names in indirect grammatical forms", () => {
    expect(
      resolveNppStationNameFromText([
        "Право заключения договора на транспортирование отходов Ростовской АЭС"
      ])
    ).toBe("Ростовская атомная станция");

    expect(
      resolveNppStationNameFromText([
        "Оказание услуг для филиала АО Концерн Росэнергоатом Ленинградской атомной станции"
      ])
    ).toBe("Ленинградская атомная станция");
  });
});

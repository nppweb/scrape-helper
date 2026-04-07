const STATION_NAME_ENDINGS = "(?:ая|ой|ую|ое|ом|ие|их)?";
const ATOMIC_LABEL_PATTERN =
  "(?:атомн(?:ая|ой|ую|ое|ом|ых)?\\s+станци(?:я|и|ю|е|ей|ям|ями|ях)|аэс(?:-[а-яa-z]+)*)";

const NPP_STATION_DEFINITIONS = [
  { canonical: "Балаковская атомная станция", stem: "балаковск" },
  { canonical: "Белоярская атомная станция", stem: "белоярск" },
  { canonical: "Билибинская атомная станция", stem: "билибинск" },
  { canonical: "Калининская атомная станция", stem: "калининск" },
  { canonical: "Кольская атомная станция", stem: "кольск" },
  { canonical: "Курская атомная станция", stem: "курск" },
  { canonical: "Ленинградская атомная станция", stem: "ленинградск" },
  { canonical: "Нововоронежская атомная станция", stem: "нововоронежск" },
  { canonical: "Ростовская атомная станция", stem: "ростовск" },
  { canonical: "Смоленская атомная станция", stem: "смоленск" }
] as const;

const NPP_STATION_PATTERNS = NPP_STATION_DEFINITIONS.map((station) => ({
  canonical: station.canonical,
  pattern: new RegExp(`${station.stem}${STATION_NAME_ENDINGS}\\s+${ATOMIC_LABEL_PATTERN}`, "i")
}));

export function resolveNppStationNameFromText(
  values: ReadonlyArray<string | null | undefined>
): string | undefined {
  const haystack = values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!haystack) {
    return undefined;
  }

  return NPP_STATION_PATTERNS.find((station) => station.pattern.test(haystack))?.canonical;
}

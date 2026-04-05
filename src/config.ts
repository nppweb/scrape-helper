import "dotenv/config";
import { z } from "zod";

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }

  return value !== "false";
}

function parseStringList(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? [...new Set(items)] : fallback;
}

const envSchema = z.object({
  CONTROL_HOST: z.string().default("0.0.0.0"),
  CONTROL_PORT: z.coerce.number().int().positive().default(3001),
  BACKEND_INTERNAL_URL: z
    .string()
    .url()
    .default("http://backend-api:3000/api/internal/scraper/config"),
  BACKEND_SOURCE_RUNS_URL: z
    .string()
    .url()
    .default("http://backend-api:3000/api/internal/scraper/source-runs"),
  API_INGEST_TOKEN: z.string().optional(),
  RABBITMQ_URL: z.string().default("amqp://app:app@localhost:5672"),
  QUEUE_RAW_EVENT: z.string().default("source.raw.v1"),
  QUEUE_QUARANTINE_EVENT: z.string().default("source.raw.quarantine.v1"),
  SCRAPE_SCHEDULE: z.string().default("*/30 * * * *"),
  SHARED_CONTRACTS_DIR: z.string().default("../contracts"),
  S3_ENDPOINT: z.string().default("http://localhost:9000"),
  S3_REGION: z.string().default("ru-central-1"),
  S3_ACCESS_KEY: z.string().default("minio"),
  S3_SECRET_KEY: z.string().default("minio123"),
  S3_BUCKET: z.string().default("scraper-artifacts"),
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .transform((value) => parseBoolean(value, true)),
  ENABLED_SOURCES: z
    .string()
    .default("easuz,eis,eis_contracts,eis_contracts_223,rnp,fedresurs,fns,gistorgi")
    .transform((value) =>
      parseStringList(value, [
        "easuz",
        "eis",
        "eis_contracts",
        "eis_contracts_223",
        "rnp",
        "fedresurs",
        "fns",
        "gistorgi"
      ])
    ),
  EASUZ_BASE_URL: z.string().url().default("https://easuz.mosreg.ru"),
  EASUZ_SEARCH_URL: z.string().url().default("https://easuz.mosreg.ru/tenders"),
  EASUZ_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  EASUZ_USER_AGENT: z
    .string()
    .default("NPPWEB procurement monitor/1.0 (+https://example.local/nppweb)"),
  FNS_BASE_URL: z.string().url().default("https://egrul.nalog.ru"),
  FNS_LOOKUP_QUERIES: z
    .string()
    .default("")
    .transform((value) => parseStringList(value, [])),
  FNS_MAX_ITEMS: z.coerce.number().int().positive().max(10).default(3),
  FNS_USER_AGENT: z
    .string()
    .default("NPPWEB procurement monitor/1.0 (+https://example.local/nppweb)"),
  FNS_DOWNLOAD_EXTRACT: z
    .string()
    .optional()
    .transform((value) => parseBoolean(value, true)),
  GISTORGI_BASE_URL: z.string().url().default("https://torgi.gov.ru"),
  GISTORGI_SEARCH_URL: z.string().url().default("https://torgi.gov.ru/new/public/lots/search"),
  GISTORGI_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  GISTORGI_USER_AGENT: z
    .string()
    .default("NPPWEB procurement monitor/1.0 (+https://example.local/nppweb)"),
  FEDRESURS_BASE_URL: z.string().url().default("https://bankrot.fedresurs.ru"),
  FEDRESURS_SEARCH_URL: z.string().url().default("https://bankrot.fedresurs.ru/Messages.aspx"),
  FEDRESURS_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  FEDRESURS_USER_AGENT: z
    .string()
    .default("NPPWEB procurement monitor/1.0 (+https://example.local/nppweb)"),
  EIS_BASE_URL: z.string().url().default("https://zakupki.gov.ru"),
  EIS_SEARCH_URL: z
    .string()
    .url()
    .default(
      "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=&morphology=on&sortDirection=false&recordsPerPage=_10&showLotsInfoHidden=false"
    ),
  EIS_SEARCH_TERMS: z
    .string()
    .default(
      [
        "АО Концерн Росэнергоатом",
        "Концерн Росэнергоатом",
        "Российский концерн по производству электрической и тепловой энергии на атомных станциях",
        "Балаковская АЭС-АВТО",
        "Балаковская атомная станция",
        "Белоярская АЭС",
        "Белоярская атомная станция",
        "Билибинская АЭС",
        "Билибинская атомная станция",
        "Калининская АЭС-СЕРВИС",
        "Калининская атомная станция",
        "Кольская АЭС",
        "Кольская атомная станция",
        "Курская АЭС-СЕРВИС",
        "Курская атомная станция",
        "Ленинградская АЭС-АВТО",
        "Ленинградская атомная станция",
        "Нововоронежская АЭС",
        "Нововоронежская атомная станция",
        "Ростовская АЭС",
        "Ростовская атомная станция",
        "Смоленская АЭС-СЕРВИС",
        "Смоленская атомная станция"
      ].join(",")
    )
    .transform((value) => parseStringList(value, [])),
  EIS_MAX_ITEMS: z.coerce.number().int().positive().max(500).default(120),
  EIS_MAX_PAGES: z.coerce.number().int().positive().max(100).default(20),
  EIS_RECORDS_PER_PAGE: z.coerce.number().int().positive().max(50).default(20),
  EIS_PUBLISH_DATE_FROM: z.string().default("2025-01-01"),
  EIS_CONTRACTS_SEARCH_URL: z
    .string()
    .url()
    .default("https://zakupki.gov.ru/epz/contract/search/results.html?searchString=&recordsPerPage=_10"),
  EIS_CONTRACTS_MAX_ITEMS: z.coerce.number().int().positive().max(500).default(180),
  EIS_CONTRACTS_223_SEARCH_URL: z
    .string()
    .url()
    .default(
      "https://zakupki.gov.ru/epz/contractfz223/search/results.html?searchString=&recordsPerPage=_10"
    ),
  EIS_CONTRACTS_223_MAX_ITEMS: z.coerce.number().int().positive().max(500).default(240),
  EIS_USER_AGENT: z
    .string()
    .default("NPPWEB procurement monitor/1.0 (+https://example.local/nppweb)"),
  RNP_BASE_URL: z.string().url().default("https://zakupki.gov.ru"),
  RNP_SEARCH_URL: z
    .string()
    .url()
    .default(
      "https://zakupki.gov.ru/epz/dishonestsupplier/search/results.html?searchString=&recordsPerPage=_10"
    ),
  RNP_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  RNP_USER_AGENT: z
    .string()
    .default("NPPWEB procurement monitor/1.0 (+https://example.local/nppweb)"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(1000),
  CIRCUIT_BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  CIRCUIT_BREAKER_OPEN_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  HTTP_PROXY: z.string().optional(),
  HTTPS_PROXY: z.string().optional(),
  NO_PROXY: z.string().optional()
});

export const config = envSchema.parse(process.env);

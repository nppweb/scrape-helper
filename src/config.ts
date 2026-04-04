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
  RABBITMQ_URL: z.string().default("amqp://app:app@localhost:5672"),
  QUEUE_RAW_EVENT: z.string().default("source.raw.v1"),
  QUEUE_QUARANTINE_EVENT: z.string().default("source.raw.quarantine.v1"),
  SCRAPE_SCHEDULE: z.string().default("*/30 * * * *"),
  SHARED_CONTRACTS_DIR: z.string().default("../shared-contracts"),
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
    .default("demo-source")
    .transform((value) => parseStringList(value, ["demo-source"])),
  DEMO_SOURCE_BASE_URL: z.string().url().default("https://demo-source.local"),
  DEMO_SOURCE_ITEM_COUNT: z.coerce.number().int().positive().max(20).default(2),
  FIND_TENDER_API_URL: z
    .string()
    .default("https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages?limit=5"),
  EASUZ_BASE_URL: z.string().url().default("https://easuz.mosreg.ru"),
  EASUZ_SEARCH_URL: z.string().url().default("https://easuz.mosreg.ru/tenders"),
  EASUZ_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  EASUZ_USER_AGENT: z
    .string()
    .default("AIMSORA procurement monitor/1.0 (+https://example.local/aimsora)"),
  FNS_BASE_URL: z.string().url().default("https://egrul.nalog.ru"),
  FNS_LOOKUP_QUERIES: z
    .string()
    .default("")
    .transform((value) => parseStringList(value, [])),
  FNS_MAX_ITEMS: z.coerce.number().int().positive().max(10).default(3),
  FNS_USER_AGENT: z
    .string()
    .default("AIMSORA procurement monitor/1.0 (+https://example.local/aimsora)"),
  FNS_DOWNLOAD_EXTRACT: z
    .string()
    .optional()
    .transform((value) => parseBoolean(value, true)),
  GISTORGI_BASE_URL: z.string().url().default("https://torgi.gov.ru"),
  GISTORGI_SEARCH_URL: z.string().url().default("https://torgi.gov.ru/new/public/lots/search"),
  GISTORGI_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  GISTORGI_USER_AGENT: z
    .string()
    .default("AIMSORA procurement monitor/1.0 (+https://example.local/aimsora)"),
  FEDRESURS_BASE_URL: z.string().url().default("https://bankrot.fedresurs.ru"),
  FEDRESURS_SEARCH_URL: z.string().url().default("https://bankrot.fedresurs.ru/Messages.aspx"),
  FEDRESURS_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  FEDRESURS_USER_AGENT: z
    .string()
    .default("AIMSORA procurement monitor/1.0 (+https://example.local/aimsora)"),
  EIS_BASE_URL: z.string().url().default("https://zakupki.gov.ru"),
  EIS_SEARCH_URL: z
    .string()
    .url()
    .default(
      "https://zakupki.gov.ru/epz/order/extendedsearch/results.html?searchString=&morphology=on&sortDirection=false&recordsPerPage=_10&showLotsInfoHidden=false"
    ),
  EIS_MAX_ITEMS: z.coerce.number().int().positive().max(20).default(5),
  EIS_USER_AGENT: z
    .string()
    .default("AIMSORA procurement monitor/1.0 (+https://example.local/aimsora)"),
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
    .default("AIMSORA procurement monitor/1.0 (+https://example.local/aimsora)"),
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

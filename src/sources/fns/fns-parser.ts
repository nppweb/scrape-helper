import { createHash } from "node:crypto";
import type { FnsParsedCompany, FnsSearchRow } from "./types";

export function parseFnsSearchRows(
  rows: FnsSearchRow[],
  options: { baseUrl: string; maxItems: number }
): FnsParsedCompany[] {
  return rows
    .filter((row) => row.k === "ul" || row.k === "ul1")
    .slice(0, options.maxItems)
    .map((row) => mapRowToCompany(row, options.baseUrl));
}

function mapRowToCompany(row: FnsSearchRow, baseUrl: string): FnsParsedCompany {
  const status = deriveCompanyStatus(row);
  const externalId = row.o?.trim() || row.i?.trim() || "unknown";

  return {
    externalId,
    externalUrl: row.t ? `${trimTrailingSlash(baseUrl)}/vyp-download/${row.t}` : undefined,
    sourcePageUrl: `${trimTrailingSlash(baseUrl)}/index.html`,
    sourceName: "fns",
    sourceType: "company",
    companyName: cleanText(row.n),
    shortName: cleanText(row.c),
    inn: normalizeIdentifier(row.i),
    kpp: normalizeIdentifier(row.p),
    ogrn: normalizeIdentifier(row.o),
    status,
    registrationDate: parseRussianDate(row.r),
    address: undefined,
    okved: undefined,
    liquidationMark: status !== "ACTIVE",
    region: cleanText(row.rn),
    checksum: createHash("sha256").update(JSON.stringify(row)).digest("hex"),
    extractToken: row.t?.trim() || undefined
  };
}

function deriveCompanyStatus(row: FnsSearchRow): string {
  if (cleanText(row.e)) {
    return "LIQUIDATED";
  }

  if (cleanText(row.v)) {
    return "INVALID_REGISTRATION";
  }

  return "ACTIVE";
}

function parseRussianDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.match(/\b(\d{2})\.(\d{2})\.(\d{4})\b/);
  if (!match) {
    return undefined;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}T00:00:00+03:00`;
}

function cleanText(value: string | undefined): string | undefined {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function normalizeIdentifier(value: string | undefined): string | undefined {
  const normalized = (value ?? "").replace(/[^\d]/g, "");
  return normalized || undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

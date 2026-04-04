import type { CollectedRawRecord } from "../adapter";
import type { FnsParsedCompany } from "./types";

export function mapFnsCompanyToCollectedRecord(input: {
  company: FnsParsedCompany;
  rawJson: string;
  lookupQuery: string;
  extractPdf?: Buffer;
}): CollectedRawRecord {
  const { company, rawJson, lookupQuery, extractPdf } = input;

  return {
    url: company.externalUrl ?? company.sourcePageUrl,
    raw: {
      sourceName: company.sourceName,
      sourceType: company.sourceType,
      externalId: company.externalId,
      externalUrl: company.externalUrl,
      sourcePageUrl: company.sourcePageUrl,
      companyName: company.companyName,
      shortName: company.shortName,
      inn: company.inn,
      kpp: company.kpp,
      ogrn: company.ogrn,
      status: company.status,
      registrationDate: company.registrationDate,
      address: company.address,
      okved: company.okved,
      liquidationMark: company.liquidationMark,
      region: company.region,
      lookupQuery,
      checksum: company.checksum
    },
    metadata: {
      adapter: "fns",
      sourceType: company.sourceType
    },
    artifacts: [
      {
        kind: "RAW_JSON",
        fileName: `fns-${company.externalId}.json`,
        contentType: "application/json; charset=utf-8",
        body: rawJson,
        metadata: {
          externalId: company.externalId,
          lookupQuery,
          source: "fns"
        }
      },
      ...(extractPdf
        ? [
            {
              kind: "REPORT_FILE" as const,
              fileName: `fns-${company.externalId}.pdf`,
              contentType: "application/pdf",
              body: extractPdf,
              metadata: {
                externalId: company.externalId,
                source: "fns"
              }
            }
          ]
        : [])
    ]
  };
}

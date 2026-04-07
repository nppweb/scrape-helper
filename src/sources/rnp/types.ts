export type RnpClientConfig = {
  baseUrl: string;
  maxItems: number;
  userAgent: string;
};

export type RnpSearchResultLink = {
  externalId: string;
  detailUrl: string;
  supplierName?: string;
  searchCategory?: string;
};

export type RnpParsedEntry = {
  externalId: string;
  externalUrl: string;
  sourcePageUrl: string;
  sourceName: "rnp";
  sourceType: "registry";
  searchCategory?: string;
  supplierName?: string;
  supplierInn?: string;
  supplierOgrn?: string;
  registryStatus?: string;
  reason?: string;
  decisionDate?: string;
  inclusionDate?: string;
  exclusionDate?: string;
  customerName?: string;
  legalBasis?: string;
  region?: string;
  checksum: string;
};

export type EisClientConfig = {
  baseUrl: string;
  detailLinkPatterns: string[];
  maxPages: number;
  publishDateFrom?: string;
  recordsPerPage: number;
  searchUrl: string;
  searchTerms: string[];
  maxItems: number;
  userAgent: string;
};

export type EisSearchResultLink = {
  externalId: string;
  detailUrl: string;
  title?: string;
  matchedQuery?: string;
};

export type EisParsedNotice = {
  externalId: string;
  externalUrl: string;
  sourcePageUrl: string;
  sourceName: string;
  sourceType: "procurement" | "contract";
  title?: string;
  description?: string;
  customerName?: string;
  supplierName?: string;
  status?: string;
  publishedAt?: string;
  applicationDeadline?: string;
  initialPrice?: number;
  currency?: string;
  region?: string;
  checksum: string;
};

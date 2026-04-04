export type EisClientConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export type EisSearchResultLink = {
  externalId: string;
  detailUrl: string;
  title?: string;
};

export type EisParsedNotice = {
  externalId: string;
  externalUrl: string;
  sourcePageUrl: string;
  sourceName: "eis";
  sourceType: "procurement";
  title?: string;
  description?: string;
  customerName?: string;
  status?: string;
  publishedAt?: string;
  applicationDeadline?: string;
  initialPrice?: number;
  currency?: string;
  region?: string;
  checksum: string;
};

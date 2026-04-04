export type EasuzClientConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export type EasuzSearchResultLink = {
  externalId: string;
  detailUrl: string;
  title?: string;
};

export type EasuzParsedNotice = {
  externalId: string;
  externalUrl: string;
  sourcePageUrl: string;
  sourceName: "easuz";
  sourceType: "procurement";
  title?: string;
  description?: string;
  customerName?: string;
  customerInn?: string;
  status?: string;
  publishedAt?: string;
  applicationDeadline?: string;
  initialPrice?: number;
  currency?: string;
  region?: string;
  registryNumber?: string;
  eisRegistrationNumber?: string;
  procurementType?: string;
  platformName?: string;
  checksum: string;
};

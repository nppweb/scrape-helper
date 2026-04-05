export type GistorgiClientConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export type GistorgiSearchResultLink = {
  externalId: string;
  detailUrl: string;
  title?: string;
};

export type GistorgiParsedLot = {
  externalId: string;
  externalUrl: string;
  sourcePageUrl: string;
  sourceName: "gistorgi";
  sourceType: "auctions";
  title?: string;
  description?: string;
  organizerName?: string;
  organizerInn?: string;
  auctionType?: string;
  status?: string;
  publishedAt?: string;
  applicationDeadline?: string;
  biddingDate?: string;
  startPrice?: number;
  currency?: string;
  region?: string;
  lotInfo?: string;
  noticeNumber?: string;
  lotNumber?: string;
  category?: string;
  etpUrl?: string;
  transactionType?: string;
  checksum: string;
};

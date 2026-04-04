export type FedresursClientConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
};

export type FedresursSearchResultLink = {
  externalId: string;
  detailUrl: string;
  title?: string;
};

export type FedresursParsedMessage = {
  externalId: string;
  externalUrl: string;
  sourcePageUrl: string;
  sourceName: "fedresurs";
  sourceType: "bankruptcy";
  messageType?: string;
  subjectName?: string;
  subjectInn?: string;
  subjectOgrn?: string;
  publishedAt?: string;
  eventDate?: string;
  title?: string;
  description?: string;
  bankruptcyStage?: string;
  caseNumber?: string;
  courtName?: string;
  checksum: string;
};

export type FedresursClientConfig = {
  baseUrl: string;
  searchUrl: string;
  maxItems: number;
  userAgent: string;
  apiUrl?: string;
  apiLogin?: string;
  apiPassword?: string;
  apiLookbackDays?: number;
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

export type FedresursApiAuthResponse = {
  jwt: string;
};

export type FedresursApiParticipant = {
  name?: string | null;
  inn?: string | null;
  ogrn?: string | null;
  ogrnip?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
};

export type FedresursApiBankruptInfo = {
  guid: string;
  type?: string | null;
  data?: FedresursApiParticipant | null;
};

export type FedresursApiMessage = {
  guid: string;
  bankruptGuid?: string | null;
  annulmentMessageGuid?: string | null;
  number?: string | null;
  datePublish?: string | null;
  dateEvent?: string | null;
  content?: string | null;
  type?: string | null;
  lockReason?: string | null;
  hasViolation?: boolean | null;
  bankruptInfo?: FedresursApiBankruptInfo | null;
};

export type FedresursApiSearchResponse = {
  pageData?: FedresursApiMessage[] | null;
  total?: number;
};

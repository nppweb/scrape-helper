export type FnsClientConfig = {
  baseUrl: string;
  lookupQueries: string[];
  maxItems: number;
  userAgent: string;
  downloadExtract: boolean;
};

export type FnsSearchInitResponse = {
  t: string;
  captchaRequired: boolean;
};

export type FnsSearchRow = {
  c?: string;
  cnt?: string;
  e?: string;
  g?: string;
  i?: string;
  k?: string;
  n?: string;
  o?: string;
  p?: string;
  pg?: string;
  r?: string;
  rn?: string;
  t?: string;
  tot?: string;
  v?: string;
};

export type FnsSearchResultResponse = {
  status?: "wait";
  rows?: FnsSearchRow[];
};

export type FnsParsedCompany = {
  externalId: string;
  externalUrl?: string;
  sourcePageUrl: string;
  sourceName: "fns";
  sourceType: "company";
  companyName?: string;
  shortName?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  status?: string;
  registrationDate?: string;
  address?: string;
  okved?: string;
  liquidationMark?: boolean;
  region?: string;
  checksum: string;
  extractToken?: string;
};

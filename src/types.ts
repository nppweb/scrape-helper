export type RawSourceEvent = {
  eventId: string;
  source: string;
  collectedAt: string;
  url: string;
  payloadVersion: "v1";
  raw: Record<string, unknown>;
};

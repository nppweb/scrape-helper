import type { CollectedRawRecord } from "../adapter";
import type { FedresursParsedMessage } from "./types";

export function mapFedresursMessageToCollectedRecord(input: {
  message: FedresursParsedMessage;
  html: string;
}): CollectedRawRecord {
  const { message, html } = input;

  return {
    url: message.externalUrl,
    raw: {
      sourceName: message.sourceName,
      sourceType: message.sourceType,
      externalId: message.externalId,
      externalUrl: message.externalUrl,
      sourcePageUrl: message.sourcePageUrl,
      messageType: message.messageType,
      subjectName: message.subjectName,
      subjectInn: message.subjectInn,
      subjectOgrn: message.subjectOgrn,
      publishedAt: message.publishedAt,
      eventDate: message.eventDate,
      title: message.title,
      description: message.description,
      bankruptcyStage: message.bankruptcyStage,
      caseNumber: message.caseNumber,
      courtName: message.courtName,
      checksum: message.checksum
    },
    metadata: {
      adapter: "fedresurs",
      sourceType: message.sourceType
    },
    artifacts: [
      {
        kind: "RAW_HTML",
        fileName: `fedresurs-${message.externalId}.html`,
        contentType: "text/html; charset=utf-8",
        body: html,
        metadata: {
          externalId: message.externalId,
          externalUrl: message.externalUrl,
          source: "fedresurs"
        }
      }
    ]
  };
}

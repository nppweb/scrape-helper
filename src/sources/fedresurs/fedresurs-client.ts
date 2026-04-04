import type { Logger } from "pino";
import { withRetries } from "../../utils/retry";
import {
  parseFedresursDetailPage,
  parseFedresursSearchResults
} from "./fedresurs-parser";
import type {
  FedresursClientConfig,
  FedresursParsedMessage,
  FedresursSearchResultLink
} from "./types";

export class FedresursClient {
  constructor(private readonly config: FedresursClientConfig) {}

  async listMessageLinks(
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<FedresursSearchResultLink[]> {
    const html = await this.fetchText(this.config.searchUrl, logger, requestTimeoutMs, "search page");
    return parseFedresursSearchResults(html, {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
  }

  async fetchMessage(
    detailUrl: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<{ html: string; message: FedresursParsedMessage }> {
    const html = await this.fetchText(detailUrl, logger, requestTimeoutMs, "detail page");

    return {
      html,
      message: parseFedresursDetailPage(html, detailUrl)
    };
  }

  private async fetchText(
    url: string,
    logger: Logger,
    requestTimeoutMs: number,
    resourceName: string
  ): Promise<string> {
    return withRetries(
      async () => {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(requestTimeoutMs),
          headers: {
            accept: "text/html,application/xhtml+xml",
            "user-agent": this.config.userAgent
          }
        });

        if (!response.ok) {
          throw new Error(`Fedresurs ${resourceName} returned HTTP ${response.status}`);
        }

        return response.text();
      },
      2,
      1000,
      {
        onRetry: ({ attempt, delayMs, error }) => {
          logger.warn(
            {
              url,
              resourceName,
              attempt,
              delayMs,
              err: error
            },
            "fedresurs request failed; retry scheduled"
          );
        }
      }
    );
  }
}

import type { Logger } from "pino";
import { withRetries } from "../../utils/retry";
import { parseRnpDetailPage, parseRnpSearchResults } from "./rnp-parser";
import type { RnpClientConfig, RnpParsedEntry, RnpSearchResultLink } from "./types";

export class RnpClient {
  constructor(private readonly config: RnpClientConfig) {}

  async listEntryLinks(logger: Logger, requestTimeoutMs: number): Promise<RnpSearchResultLink[]> {
    const html = await this.fetchText(this.config.searchUrl, logger, requestTimeoutMs, "search page");
    return parseRnpSearchResults(html, {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
  }

  async fetchEntry(
    detailUrl: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<{ html: string; entry: RnpParsedEntry }> {
    const html = await this.fetchText(detailUrl, logger, requestTimeoutMs, "detail page");
    return {
      html,
      entry: parseRnpDetailPage(html, detailUrl)
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
          throw new Error(`RNP ${resourceName} returned HTTP ${response.status}`);
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
            "rnp request failed; retry scheduled"
          );
        }
      }
    );
  }
}

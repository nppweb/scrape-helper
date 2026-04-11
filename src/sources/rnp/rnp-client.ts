import type { Logger } from "pino";
import { describeOutboundHttpError, fetch } from "../../http-client";
import { withRetries } from "../../utils/retry";
import { buildBrowserLikeHtmlHeaders, describeZakupkiHttpStatus } from "../browser-headers";
import { parseRnpDetailPage, parseRnpSearchResults } from "./rnp-parser";
import type { RnpClientConfig, RnpParsedEntry, RnpSearchResultLink } from "./types";

export class RnpClient {
  constructor(private readonly config: RnpClientConfig) {}

  async listEntryLinksFromUrl(
    searchUrl: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<RnpSearchResultLink[]> {
    const html = await this.fetchText(
      searchUrl,
      logger,
      requestTimeoutMs,
      "search page",
      new URL("/", this.config.baseUrl).toString()
    );
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
    const html = await this.fetchText(
      detailUrl,
      logger,
      requestTimeoutMs,
      "detail page",
      new URL("/", this.config.baseUrl).toString()
    );
    return {
      html,
      entry: parseRnpDetailPage(html, detailUrl)
    };
  }

  private async fetchText(
    url: string,
    logger: Logger,
    requestTimeoutMs: number,
    resourceName: string,
    referer?: string
  ): Promise<string> {
    return withRetries(
      async () => {
        let response;
        try {
          response = await fetch(url, {
            signal: AbortSignal.timeout(requestTimeoutMs),
            headers: buildBrowserLikeHtmlHeaders({
              userAgent: this.config.userAgent,
              referer
            })
          });
        } catch (error) {
          throw describeOutboundHttpError(error, url);
        }

        if (!response.ok) {
          throw new Error(`RNP ${resourceName} ${describeZakupkiHttpStatus(response.status)}`);
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

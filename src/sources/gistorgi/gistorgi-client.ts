import type { Logger } from "pino";
import { describeOutboundHttpError, fetch } from "../../http-client";
import { withRetries } from "../../utils/retry";
import {
  parseGistorgiDetailResponse,
  parseGistorgiSearchResults
} from "./gistorgi-parser";
import type {
  GistorgiClientConfig,
  GistorgiParsedLot,
  GistorgiSearchResultLink
} from "./types";

export class GistorgiClient {
  constructor(private readonly config: GistorgiClientConfig) {}

  async listLotLinks(logger: Logger, requestTimeoutMs: number): Promise<GistorgiSearchResultLink[]> {
    const rawJson = await this.fetchText(
      this.buildSearchApiUrl(),
      logger,
      requestTimeoutMs,
      "search api"
    );
    return parseGistorgiSearchResults(rawJson, {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
  }

  async fetchLot(
    externalId: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<{ rawJson: string; lot: GistorgiParsedLot }> {
    const rawJson = await this.fetchText(
      this.buildDetailApiUrl(externalId),
      logger,
      requestTimeoutMs,
      "detail api"
    );
    return {
      rawJson,
      lot: parseGistorgiDetailResponse(rawJson, {
        baseUrl: this.config.baseUrl,
        externalId
      })
    };
  }

  private buildSearchApiUrl(): string {
    return this.buildApiUrl(this.config.searchUrl, "/new/api/public/lotcards/search");
  }

  private buildDetailApiUrl(externalId: string): string {
    return this.buildApiUrl(this.config.baseUrl, `/new/api/public/lotcards/${encodeURIComponent(externalId)}`);
  }

  private buildApiUrl(inputUrl: string, fallbackPath: string): string {
    try {
      const url = new URL(inputUrl);

      if (url.pathname === "/new/public/lots/search") {
        url.pathname = "/new/api/public/lotcards/search";
        return url.toString();
      }

      if (url.pathname.endsWith("/new/api/public/lotcards/search")) {
        return url.toString();
      }

      return new URL(fallbackPath, url.origin).toString();
    } catch {
      return new URL(fallbackPath, this.config.baseUrl).toString();
    }
  }

  private async fetchText(
    url: string,
    logger: Logger,
    requestTimeoutMs: number,
    resourceName: string
  ): Promise<string> {
    return withRetries(
      async () => {
        let response;
        try {
          response = await fetch(url, {
            signal: AbortSignal.timeout(requestTimeoutMs),
            headers: {
              accept: "application/json, text/plain;q=0.9, */*;q=0.1",
              "user-agent": this.config.userAgent
            }
          });
        } catch (error) {
          throw describeOutboundHttpError(error, url);
        }

        if (!response.ok) {
          throw new Error(`GISTORGI ${resourceName} returned HTTP ${response.status} for ${url}`);
        }

        return response.text();
      },
      2,
      1000,
      {
        onRetry: ({ attempt, delayMs, error }) => {
          logger.warn({ url, resourceName, attempt, delayMs, err: error }, "gistorgi request failed; retry scheduled");
        }
      }
    );
  }
}

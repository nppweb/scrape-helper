import type { Logger } from "pino";
import { withRetries } from "../../utils/retry";
import { parseGistorgiDetailPage, parseGistorgiSearchResults } from "./gistorgi-parser";
import type {
  GistorgiClientConfig,
  GistorgiParsedLot,
  GistorgiSearchResultLink
} from "./types";

export class GistorgiClient {
  constructor(private readonly config: GistorgiClientConfig) {}

  async listLotLinks(logger: Logger, requestTimeoutMs: number): Promise<GistorgiSearchResultLink[]> {
    const html = await this.fetchText(this.config.searchUrl, logger, requestTimeoutMs, "search page");
    return parseGistorgiSearchResults(html, {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
  }

  async fetchLot(
    detailUrl: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<{ html: string; lot: GistorgiParsedLot }> {
    const html = await this.fetchText(detailUrl, logger, requestTimeoutMs, "detail page");
    return {
      html,
      lot: parseGistorgiDetailPage(html, detailUrl)
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
          throw new Error(`GISTORGI ${resourceName} returned HTTP ${response.status}`);
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

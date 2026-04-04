import { createHash } from "node:crypto";
import type { Logger } from "pino";
import { withRetries } from "../../utils/retry";
import { parseEisNoticePage, parseEisSearchResults } from "./eis-parser";
import type { EisClientConfig, EisParsedNotice, EisSearchResultLink } from "./types";

export class EisClient {
  constructor(private readonly config: EisClientConfig) {}

  async listNoticeLinks(logger: Logger, requestTimeoutMs: number): Promise<EisSearchResultLink[]> {
    const html = await this.fetchText(this.config.searchUrl, logger, requestTimeoutMs, "search page");
    return parseEisSearchResults(html, {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
  }

  async fetchNotice(
    detailUrl: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<{ html: string; notice: EisParsedNotice }> {
    const html = await this.fetchText(detailUrl, logger, requestTimeoutMs, "notice page");
    return {
      html,
      notice: parseEisNoticePage(html, detailUrl)
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
          throw new Error(`EIS ${resourceName} returned HTTP ${response.status}`);
        }

        const html = await response.text();
        logger.debug(
          {
            url,
            resourceName,
            checksum: createHash("sha256").update(html).digest("hex")
          },
          "eis response fetched"
        );
        return html;
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
            "eis request failed; retry scheduled"
          );
        }
      }
    );
  }
}

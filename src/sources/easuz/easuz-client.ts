import { createHash } from "node:crypto";
import type { Logger } from "pino";
import { withRetries } from "../../utils/retry";
import { parseEasuzNoticePage, parseEasuzSearchResults } from "./easuz-parser";
import type { EasuzClientConfig, EasuzParsedNotice, EasuzSearchResultLink } from "./types";

export class EasuzClient {
  constructor(private readonly config: EasuzClientConfig) {}

  async listNoticeLinks(logger: Logger, requestTimeoutMs: number): Promise<EasuzSearchResultLink[]> {
    const html = await this.fetchText(this.config.searchUrl, logger, requestTimeoutMs, "catalog page");
    return parseEasuzSearchResults(html, {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
  }

  async fetchNotice(
    detailUrl: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<{ html: string; notice: EasuzParsedNotice }> {
    const html = await this.fetchText(detailUrl, logger, requestTimeoutMs, "notice page");

    return {
      html,
      notice: parseEasuzNoticePage(html, detailUrl)
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
            "accept-language": "ru-RU,ru;q=0.9,en;q=0.8",
            "user-agent": this.config.userAgent
          }
        });

        if (!response.ok) {
          throw new Error(`EASUZ ${resourceName} returned HTTP ${response.status}`);
        }

        const html = await response.text();
        logger.debug(
          {
            url,
            resourceName,
            checksum: createHash("sha256").update(html).digest("hex")
          },
          "easuz response fetched"
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
            "easuz request failed; retry scheduled"
          );
        }
      }
    );
  }
}

import { createHash } from "node:crypto";
import type { Logger } from "pino";
import { describeOutboundHttpError, fetch } from "../../http-client";
import { withRetries } from "../../utils/retry";
import { parseEisNoticePage, parseEisSearchResults } from "./eis-parser";
import type { EisClientConfig, EisParsedNotice, EisSearchResultLink } from "./types";

export class EisClient {
  constructor(private readonly config: EisClientConfig) {}

  async listNoticeLinks(logger: Logger, requestTimeoutMs: number): Promise<EisSearchResultLink[]> {
    const links = new Map<string, EisSearchResultLink>();

    for (const query of buildEisSearchQueries(this.config.searchTerms)) {
      const searchUrl = buildEisSearchUrl(this.config.searchUrl, query);
      const html = await this.fetchText(searchUrl, logger, requestTimeoutMs, "search page");
      const parsedLinks = parseEisSearchResults(html, {
        baseUrl: this.config.baseUrl,
        maxItems: this.config.maxItems
      });

      for (const link of parsedLinks) {
        if (links.has(link.externalId)) {
          continue;
        }

        links.set(link.externalId, {
          ...link,
          matchedQuery: query || undefined
        });
      }
    }

    return Array.from(links.values());
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
        let response;
        try {
          response = await fetch(url, {
            signal: AbortSignal.timeout(requestTimeoutMs),
            headers: {
              accept: "text/html,application/xhtml+xml",
              "user-agent": this.config.userAgent
            }
          });
        } catch (error) {
          throw describeOutboundHttpError(error, url);
        }

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

function buildEisSearchQueries(searchTerms: string[]): string[] {
  const queries = [""];

  for (const term of searchTerms) {
    if (!term || queries.includes(term)) {
      continue;
    }

    queries.push(term);
  }

  return queries;
}

function buildEisSearchUrl(baseSearchUrl: string, query: string): string {
  const url = new URL(baseSearchUrl);
  url.searchParams.set("searchString", query);
  return url.toString();
}

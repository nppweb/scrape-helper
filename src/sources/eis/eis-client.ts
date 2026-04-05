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
      for (let pageNumber = 1; pageNumber <= this.config.maxPages; pageNumber += 1) {
        const searchUrl = buildEisSearchUrl(this.config.searchUrl, {
          query,
          pageNumber,
          publishDateFrom: this.config.publishDateFrom,
          recordsPerPage: this.config.recordsPerPage
        });
        const html = await this.fetchText(searchUrl, logger, requestTimeoutMs, "search page");
        const parsedLinks = parseEisSearchResults(html, {
          baseUrl: this.config.baseUrl,
          maxItems: this.config.maxItems,
          detailLinkPatterns: this.config.detailLinkPatterns
        });

        for (const link of parsedLinks) {
          const candidate = {
            ...link,
            matchedQuery: query || undefined
          };
          const existing = links.get(link.externalId);

          if (
            !existing ||
            (!existing.matchedQuery && candidate.matchedQuery) ||
            (existing.matchedQuery === candidate.matchedQuery &&
              candidate.detailUrl.length < existing.detailUrl.length)
          ) {
            links.set(link.externalId, candidate);
          }

          if (links.size >= this.config.maxItems) {
            return Array.from(links.values());
          }
        }

        if (
          parsedLinks.length === 0 ||
          parsedLinks.length < Math.min(this.config.recordsPerPage, this.config.maxItems)
        ) {
          break;
        }
      }
    }

    return Array.from(links.values());
  }

  async fetchNotice(
    detailUrl: string,
    logger: Logger,
    requestTimeoutMs: number,
    options?: { fallbackExternalId?: string }
  ): Promise<{ html: string; notice: EisParsedNotice }> {
    const html = await this.fetchText(detailUrl, logger, requestTimeoutMs, "notice page");
    return {
      html,
      notice: parseEisNoticePage(html, detailUrl, options)
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
  const queries = searchTerms.length > 0 ? [] : [""];

  for (const term of searchTerms) {
    if (!term || queries.includes(term)) {
      continue;
    }

    queries.push(term);
  }

  return queries;
}

function buildEisSearchUrl(
  baseSearchUrl: string,
  options: {
    query: string;
    pageNumber: number;
    publishDateFrom?: string;
    recordsPerPage: number;
  }
): string {
  const url = new URL(baseSearchUrl);
  url.searchParams.set("searchString", options.query);
  url.searchParams.set("pageNumber", String(options.pageNumber));
  url.searchParams.set("recordsPerPage", `_${options.recordsPerPage}`);
  url.searchParams.set("sortDirection", "false");

  if (options.publishDateFrom) {
    url.searchParams.set("publishDateFrom", formatEisDate(options.publishDateFrom));
  }

  return url.toString();
}

function formatEisDate(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return trimmed;
  }

  return `${match[3]}.${match[2]}.${match[1]}`;
}

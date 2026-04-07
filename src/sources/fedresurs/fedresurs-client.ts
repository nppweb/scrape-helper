import type { Logger } from "pino";
import { describeOutboundHttpError, fetch } from "../../http-client";
import { withRetries } from "../../utils/retry";
import {
  parseFedresursApiMessage,
  parseFedresursDetailPage,
  parseFedresursSearchResults
} from "./fedresurs-parser";
import type {
  FedresursApiAuthResponse,
  FedresursApiMessage,
  FedresursApiSearchResponse,
  FedresursClientConfig,
  FedresursParsedMessage,
  FedresursSearchResultLink
} from "./types";

export class FedresursClient {
  constructor(private readonly config: FedresursClientConfig) {}

  hasOfficialApiConfig(): boolean {
    return Boolean(this.config.apiUrl && this.config.apiLogin && this.config.apiPassword);
  }

  async listRecentMessagesFromApi(
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<Array<{ rawJson: string; message: FedresursParsedMessage }>> {
    if (!this.hasOfficialApiConfig()) {
      return [];
    }

    const jwt = await this.authenticate(logger, requestTimeoutMs);
    const now = new Date();
    const lookbackDays = Math.max(1, Math.min(this.config.apiLookbackDays ?? 31, 31));
    const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const apiResponse = await this.fetchJson<FedresursApiSearchResponse>(
      this.buildApiUrl("v1/messages", {
        DatePublishBegin: formatFedresursApiDate(from),
        DatePublishEnd: formatFedresursApiDate(now),
        IncludeContent: "true",
        IncludeBankruptInfo: "true",
        IsAnnulled: "false",
        IsLocked: "false",
        Limit: String(this.config.maxItems),
        Offset: "0"
      }),
      logger,
      requestTimeoutMs,
      "messages api",
      jwt
    );

    return (apiResponse.pageData ?? []).slice(0, this.config.maxItems).map((item) => ({
      rawJson: JSON.stringify(item, null, 2),
      message: parseFedresursApiMessage(item, { baseUrl: this.config.baseUrl })
    }));
  }

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

  private async authenticate(logger: Logger, requestTimeoutMs: number): Promise<string> {
    const response = await this.fetchJson<FedresursApiAuthResponse>(
      this.buildApiUrl("v1/auth"),
      logger,
      requestTimeoutMs,
      "auth api",
      undefined,
      {
        method: "POST",
        body: JSON.stringify({
          login: this.config.apiLogin,
          password: this.config.apiPassword
        })
      }
    );

    const jwt = response.jwt?.trim();
    if (!jwt) {
      throw new Error("Fedresurs auth api did not return JWT token");
    }

    return jwt;
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

  private async fetchJson<T>(
    url: string,
    logger: Logger,
    requestTimeoutMs: number,
    resourceName: string,
    jwt?: string,
    init?: { method?: string; body?: string }
  ): Promise<T> {
    return withRetries(
      async () => {
        let response;
        try {
          response = await fetch(url, {
            method: init?.method ?? "GET",
            body: init?.body,
            signal: AbortSignal.timeout(requestTimeoutMs),
            headers: {
              accept: "application/json",
              "content-type": init?.body ? "application/json" : undefined,
              authorization: jwt ? `Bearer ${jwt}` : undefined,
              "user-agent": this.config.userAgent
            }
          });
        } catch (error) {
          throw describeOutboundHttpError(error, url);
        }

        if (!response.ok) {
          throw new Error(`Fedresurs ${resourceName} returned HTTP ${response.status}`);
        }

        return (await response.json()) as T;
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

  private buildApiUrl(path: string, query?: Record<string, string>): string {
    const baseUrl = this.config.apiUrl ?? "";
    const url = new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }
}

function formatFedresursApiDate(value: Date): string {
  return value.toISOString().replace(/\.\d{3}Z$/, "");
}

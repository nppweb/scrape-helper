import type { Logger } from "pino";
import { withRetries } from "../../utils/retry";
import { parseFnsSearchRows } from "./fns-parser";
import type {
  FnsClientConfig,
  FnsParsedCompany,
  FnsSearchInitResponse,
  FnsSearchResultResponse
} from "./types";

export class FnsClient {
  constructor(private readonly config: FnsClientConfig) {}

  async lookupCompanies(
    query: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<Array<{ company: FnsParsedCompany; rawJson: string; extractPdf?: Buffer }>> {
    const search = await this.startSearch(query, logger, requestTimeoutMs);
    if (search.captchaRequired) {
      logger.warn({ query }, "fns captcha required; skipping lookup");
      return [];
    }

    const result = await this.waitForSearchResult(search.t, logger, requestTimeoutMs);
    const companies = parseFnsSearchRows(result.rows ?? [], {
      baseUrl: this.config.baseUrl,
      maxItems: this.config.maxItems
    });
    const rawJson = JSON.stringify(result, null, 2);

    const enrichedResults: Array<{ company: FnsParsedCompany; rawJson: string; extractPdf?: Buffer }> = [];
    for (const company of companies) {
      let extractPdf: Buffer | undefined;
      if (this.config.downloadExtract && company.extractToken) {
        try {
          extractPdf = await this.downloadExtract(company.extractToken, logger, requestTimeoutMs);
        } catch (error) {
          logger.warn(
            {
              err: error,
              query,
              externalId: company.externalId
            },
            "fns extract download failed; continuing with JSON payload only"
          );
        }
      }

      enrichedResults.push({ company, rawJson, extractPdf });
    }

    return enrichedResults;
  }

  private async startSearch(
    query: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<FnsSearchInitResponse> {
    return withRetries(
      async () => {
        const response = await fetch(this.config.baseUrl, {
          method: "POST",
          signal: AbortSignal.timeout(requestTimeoutMs),
          headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            accept: "application/json",
            "user-agent": this.config.userAgent
          },
          body: new URLSearchParams({ query }).toString()
        });

        if (!response.ok) {
          throw new Error(`FNS search init returned HTTP ${response.status}`);
        }

        return (await response.json()) as FnsSearchInitResponse;
      },
      2,
      1000,
      {
        onRetry: ({ attempt, delayMs, error }) => {
          logger.warn({ query, attempt, delayMs, err: error }, "fns search init failed; retry scheduled");
        }
      }
    );
  }

  private async waitForSearchResult(
    token: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<FnsSearchResultResponse> {
    const searchUrl = `${trimTrailingSlash(this.config.baseUrl)}/search-result/${token}`;

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await fetch(`${searchUrl}?r=${Date.now()}`, {
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          accept: "application/json",
          "user-agent": this.config.userAgent
        }
      });

      if (!response.ok) {
        throw new Error(`FNS search result returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as FnsSearchResultResponse;
      if (result.status !== "wait") {
        return result;
      }

      logger.info({ token, attempt }, "fns search result not ready yet");
      await sleep(1000);
    }

    throw new Error(`FNS search result polling timed out for token ${token}`);
  }

  private async downloadExtract(
    extractToken: string,
    logger: Logger,
    requestTimeoutMs: number
  ): Promise<Buffer> {
    const baseUrl = trimTrailingSlash(this.config.baseUrl);
    const requestUrl = `${baseUrl}/vyp-request/${extractToken}?r=${Date.now()}`;
    const requestResponse = await fetch(requestUrl, {
      signal: AbortSignal.timeout(requestTimeoutMs),
      headers: {
        accept: "application/json",
        "user-agent": this.config.userAgent
      }
    });

    if (!requestResponse.ok) {
      throw new Error(`FNS extract request returned HTTP ${requestResponse.status}`);
    }

    const requestPayload = (await requestResponse.json()) as { captchaRequired?: boolean };
    if (requestPayload.captchaRequired) {
      throw new Error("FNS extract requires captcha");
    }

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const statusResponse = await fetch(`${baseUrl}/vyp-status/${extractToken}?r=${Date.now()}`, {
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          accept: "application/json",
          "user-agent": this.config.userAgent
        }
      });

      if (!statusResponse.ok) {
        throw new Error(`FNS extract status returned HTTP ${statusResponse.status}`);
      }

      const statusPayload = (await statusResponse.json()) as { status?: string };
      if (statusPayload.status === "ready") {
        const fileResponse = await fetch(`${baseUrl}/vyp-download/${extractToken}`, {
          signal: AbortSignal.timeout(requestTimeoutMs),
          headers: {
            accept: "application/pdf",
            "user-agent": this.config.userAgent
          }
        });

        if (!fileResponse.ok) {
          throw new Error(`FNS extract download returned HTTP ${fileResponse.status}`);
        }

        const arrayBuffer = await fileResponse.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      if (statusPayload.status === "error") {
        throw new Error(`FNS extract generation failed for token ${extractToken}`);
      }

      logger.info({ extractToken, attempt }, "fns extract not ready yet");
      await sleep(1000);
    }

    throw new Error(`FNS extract polling timed out for token ${extractToken}`);
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

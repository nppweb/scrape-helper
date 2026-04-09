import { describe, expect, it } from "vitest";
import {
  describeOutboundHttpError,
  shouldBypassProxyForUrl,
  shouldRetryDirectConnection
} from "./http-client";

describe("shouldBypassProxyForUrl", () => {
  it("matches exact hosts and subdomains from NO_PROXY", () => {
    expect(
      shouldBypassProxyForUrl(
        "http://backend-api:3000/api/internal/scraper/config",
        "localhost,backend-api,.svc.cluster.local"
      )
    ).toBe(true);

    expect(
      shouldBypassProxyForUrl(
        "https://scraper.svc.cluster.local/health",
        "localhost,backend-api,.svc.cluster.local"
      )
    ).toBe(true);
  });

  it("matches host entries with explicit ports", () => {
    expect(shouldBypassProxyForUrl("http://minio:9000/minio/health/live", "minio:9000")).toBe(true);
    expect(shouldBypassProxyForUrl("http://minio:9001/", "minio:9000")).toBe(false);
  });

  it("does not bypass proxy for unrelated external hosts", () => {
    expect(
      shouldBypassProxyForUrl("https://bankrot.fedresurs.ru/Messages.aspx", "localhost,backend-api")
    ).toBe(false);
  });
});

describe("shouldRetryDirectConnection", () => {
  it("recognizes transport-layer fetch failures", () => {
    const error = new TypeError("fetch failed");
    Object.assign(error, {
      cause: {
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED 127.0.0.1:8080"
      }
    });

    expect(shouldRetryDirectConnection(error)).toBe(true);
  });

  it("ignores semantic application errors", () => {
    expect(shouldRetryDirectConnection(new Error("EASUZ catalog page returned HTTP 403"))).toBe(false);
  });
});

describe("describeOutboundHttpError", () => {
  it("wraps generic fetch failures into a user-facing network message", () => {
    const error = new TypeError("fetch failed");
    Object.assign(error, {
      cause: {
        code: "ENOTFOUND",
        message: "getaddrinfo ENOTFOUND torgi.gov.ru"
      }
    });

    const described = describeOutboundHttpError(error, "https://torgi.gov.ru/new/public/lots/search");
    expect(described.message).toContain("torgi.gov.ru");
    expect(described.message).toContain("сетевой ошибкой");
  });
});

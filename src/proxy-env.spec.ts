import { describe, expect, it } from "vitest";
import { resolveProxyEnv } from "./proxy-env";

describe("resolveProxyEnv", () => {
  it("uses uppercase variables when they are explicitly provided", () => {
    expect(
      resolveProxyEnv({
        HTTP_PROXY: "http://upper-http:8080",
        HTTPS_PROXY: "http://upper-https:8080",
        NO_PROXY: "localhost,backend-api"
      })
    ).toEqual({
      HTTP_PROXY: "http://upper-http:8080",
      HTTPS_PROXY: "http://upper-https:8080",
      NO_PROXY: "localhost,backend-api"
    });
  });

  it("accepts lowercase proxy variables from the environment", () => {
    expect(
      resolveProxyEnv({
        http_proxy: "http://lower-http:8080",
        https_proxy: "http://lower-https:8080",
        no_proxy: "localhost,minio"
      })
    ).toEqual({
      HTTP_PROXY: "http://lower-http:8080",
      HTTPS_PROXY: "http://lower-https:8080",
      NO_PROXY: "localhost,minio"
    });
  });

  it("falls back to a single configured proxy for both http and https traffic", () => {
    expect(
      resolveProxyEnv({
        HTTP_PROXY: "http://shared-proxy:8080"
      })
    ).toEqual({
      HTTP_PROXY: "http://shared-proxy:8080",
      HTTPS_PROXY: "http://shared-proxy:8080",
      NO_PROXY: undefined
    });

    expect(
      resolveProxyEnv({
        HTTPS_PROXY: "http://shared-proxy:8080"
      })
    ).toEqual({
      HTTP_PROXY: "http://shared-proxy:8080",
      HTTPS_PROXY: "http://shared-proxy:8080",
      NO_PROXY: undefined
    });
  });

  it("uses ALL_PROXY when protocol-specific variables are absent", () => {
    expect(
      resolveProxyEnv({
        ALL_PROXY: "socks5://proxy.internal:1080"
      })
    ).toEqual({
      HTTP_PROXY: "socks5://proxy.internal:1080",
      HTTPS_PROXY: "socks5://proxy.internal:1080",
      NO_PROXY: undefined
    });
  });
});

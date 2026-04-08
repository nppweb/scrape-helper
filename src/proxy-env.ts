type ProxyEnvInput = Partial<
  Record<
    | "HTTP_PROXY"
    | "http_proxy"
    | "HTTPS_PROXY"
    | "https_proxy"
    | "ALL_PROXY"
    | "all_proxy"
    | "NO_PROXY"
    | "no_proxy",
    string | undefined
  >
>;

function firstDefined(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return undefined;
}

export function resolveProxyEnv(env: ProxyEnvInput) {
  const httpProxy = firstDefined(
    env.HTTP_PROXY,
    env.http_proxy,
    env.ALL_PROXY,
    env.all_proxy,
    env.HTTPS_PROXY,
    env.https_proxy
  );
  const httpsProxy = firstDefined(
    env.HTTPS_PROXY,
    env.https_proxy,
    env.HTTP_PROXY,
    env.http_proxy,
    env.ALL_PROXY,
    env.all_proxy
  );
  const noProxy = firstDefined(env.NO_PROXY, env.no_proxy);

  return {
    HTTP_PROXY: httpProxy,
    HTTPS_PROXY: httpsProxy,
    NO_PROXY: noProxy
  };
}

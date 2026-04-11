export function buildBrowserLikeHtmlHeaders(input: {
  userAgent: string;
  referer?: string;
}): Record<string, string> {
  return {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "upgrade-insecure-requests": "1",
    ...(input.referer ? { referer: input.referer } : {}),
    "user-agent": input.userAgent
  };
}

export function buildBrowserLikeJsonHeaders(input: {
  userAgent: string;
  jwt?: string;
  hasBody?: boolean;
}): Record<string, string | undefined> {
  return {
    accept: "application/json",
    "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    authorization: input.jwt ? `Bearer ${input.jwt}` : undefined,
    "content-type": input.hasBody ? "application/json" : undefined,
    "user-agent": input.userAgent
  };
}

export function describeZakupkiHttpStatus(status: number): string {
  if (status === 434) {
    return "returned HTTP 434. Zakupki likely rejected the automated request; проверьте маршрут через HTTPS_PROXY/HTTP_PROXY и доступность выдачи из текущего контура.";
  }

  if (status === 403) {
    return "returned HTTP 403. Zakupki denied access to the request; проверьте сетевой маршрут и ограничения на стороне площадки.";
  }

  return `returned HTTP ${status}`;
}

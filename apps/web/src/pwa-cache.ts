export function isPublishedBoardRequest({ url, request }: { url: URL; request: Request }) {
  return request.method === "GET" && /^\/v1\/boards\/\d{4}-\d{2}-\d{2}$/.test(url.pathname);
}

export function isCookieOnlyFinishRequest({ url, request }: { url: URL; request: Request }) {
  return request.method === "POST" && !request.headers.has("authorization") && /^\/v1\/plays\/[^/]+\/finish$/.test(url.pathname);
}

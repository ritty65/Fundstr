import {
  FUNDSTR_EVT_URL,
  FUNDSTR_REQ_URL,
  HTTP_FALLBACK_TIMEOUT_MS,
} from "@/nutzap/relayEndpoints";
import { NUTZAP_HTTP_AUTH_HEADER } from "@/nutzap/relayConfig";

const HTTP_FAILURE_THRESHOLD = 3;
const HTTP_FAILURE_BACKOFF_MS = 60_000;

type FailureEntry = {
  count: number;
  retryAt: number;
};

const failureCache = new Map<string, FailureEntry>();

export class HttpFallbackThrottledError extends Error {
  readonly url: string;
  readonly retryAt: number;

  constructor(url: string, retryAt: number) {
    super(`HTTP fallback suppressed after repeated failures (url: ${url})`);
    this.name = "HttpFallbackThrottledError";
    this.url = url;
    this.retryAt = retryAt;
  }
}

function normalizeFailureKey(url: string): string {
  return url.trim().toLowerCase();
}

function shouldThrottle(url: string, now: number): FailureEntry | null {
  const key = normalizeFailureKey(url);
  const entry = failureCache.get(key);
  if (!entry) {
    return null;
  }
  if (now >= entry.retryAt) {
    failureCache.delete(key);
    return null;
  }
  if (entry.count < HTTP_FAILURE_THRESHOLD) {
    return null;
  }
  return entry;
}

function recordFailure(url: string, now: number): void {
  const key = normalizeFailureKey(url);
  const entry = failureCache.get(key);
  if (!entry || now >= entry.retryAt) {
    failureCache.set(key, { count: 1, retryAt: now + HTTP_FAILURE_BACKOFF_MS });
    return;
  }
  failureCache.set(key, {
    count: entry.count + 1,
    retryAt: now + HTTP_FAILURE_BACKOFF_MS,
  });
}

function recordSuccess(url: string): void {
  const key = normalizeFailureKey(url);
  failureCache.delete(key);
}

export const DEFAULT_HTTP_ACCEPT =
  "application/nostr+json, application/json;q=0.9, */*;q=0.1";

export type HttpPublishAck = {
  id: string;
  accepted: boolean;
  message?: string;
  via: "http";
};

export type PublishEventViaHttpOptions = {
  url?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

export type RequestEventsViaHttpOptions = {
  url?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
};

type AbortResources = {
  controller: AbortController | null;
  dispose: () => void;
};

function createAbortResources(timeoutMs: number): AbortResources {
  if (typeof AbortController === "undefined" || timeoutMs <= 0) {
    return { controller: null, dispose: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    controller,
    dispose: () => {
      clearTimeout(timer);
    },
  };
}

function normalizeSnippet(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 200) || "[empty response body]";
}

function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch === "undefined") {
    throw new Error("Global fetch is not available in this environment");
  }
  return fetch;
}

export async function publishEventViaHttp(
  event: Record<string, any>,
  options: PublishEventViaHttpOptions = {},
): Promise<HttpPublishAck> {
  const {
    url = FUNDSTR_EVT_URL,
    timeoutMs = HTTP_FALLBACK_TIMEOUT_MS,
    headers = {},
    fetchImpl,
  } = options;
  if (!url) {
    throw new Error("FUNDSTR_EVT_URL is not configured");
  }

  const { controller, dispose } = createAbortResources(timeoutMs);
  const fetchFn = resolveFetch(fetchImpl);
  let response: Response | undefined;
  let bodyText = "";

  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Accept: DEFAULT_HTTP_ACCEPT,
        ...(NUTZAP_HTTP_AUTH_HEADER
          ? { [NUTZAP_HTTP_AUTH_HEADER.name]: NUTZAP_HTTP_AUTH_HEADER.value }
          : {}),
        ...headers,
      },
      body: JSON.stringify(event),
      cache: "no-store",
      signal: controller?.signal,
    });
    bodyText = await response.text();
  } catch (err) {
    dispose();
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Publish request timed out after ${timeoutMs}ms`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  }

  dispose();

  if (!response) {
    throw new Error("Relay publish failed: no response received");
  }

  if (!response.ok) {
    const snippet = normalizeSnippet(bodyText);
    throw new Error(`Relay rejected with status ${response.status}: ${snippet}`);
  }

  let ackRaw: any = null;
  if (bodyText) {
    try {
      ackRaw = JSON.parse(bodyText);
    } catch (err) {
      throw new Error("Relay returned invalid JSON", { cause: err as Error });
    }
  }

  const ack: HttpPublishAck = {
    id: typeof ackRaw?.id === "string" && ackRaw.id ? ackRaw.id : (event as any).id,
    accepted: ackRaw?.accepted === true,
    message: typeof ackRaw?.message === "string" ? ackRaw.message : undefined,
    via: "http",
  };

  return ack;
}

export function buildRequestUrl(base: string, filters: any[]): string {
  const serialized = JSON.stringify(filters);
  try {
    const url = new URL(base);
    url.searchParams.set("filters", serialized);
    return url.toString();
  } catch {
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}filters=${encodeURIComponent(serialized)}`;
  }
}

export async function requestEventsViaHttp(
  filters: Record<string, any>[],
  options: RequestEventsViaHttpOptions = {},
): Promise<any[]> {
  const {
    url = FUNDSTR_REQ_URL,
    timeoutMs = HTTP_FALLBACK_TIMEOUT_MS,
    headers = {},
    fetchImpl,
  } = options;
  if (!url) {
    throw new Error("FUNDSTR_REQ_URL is not configured");
  }

  const failureUrl = url;
  const now = Date.now();
  const throttled = shouldThrottle(failureUrl, now);
  if (throttled) {
    throw new HttpFallbackThrottledError(failureUrl, throttled.retryAt);
  }

  const requestUrl = buildRequestUrl(url, filters);
  const fetchFn = resolveFetch(fetchImpl);
  const { controller, dispose } = createAbortResources(timeoutMs);
  let response: Response | undefined;
  let bodyText = "";

  const throwWithFailure = (error: Error): never => {
    recordFailure(failureUrl, Date.now());
    throw error;
  };

  try {
    response = await fetchFn(requestUrl, {
      method: "GET",
      headers: {
        Accept: DEFAULT_HTTP_ACCEPT,
        ...(NUTZAP_HTTP_AUTH_HEADER
          ? { [NUTZAP_HTTP_AUTH_HEADER.name]: NUTZAP_HTTP_AUTH_HEADER.value }
          : {}),
        ...headers,
      },
      cache: "no-store",
      signal: controller?.signal,
    });
    bodyText = await response.text();
  } catch (err) {
    dispose();
    if (err instanceof Error && err.name === "AbortError") {
      throwWithFailure(
        new Error(
          `HTTP fallback timed out after ${timeoutMs}ms (url: ${requestUrl})`,
        ),
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throwWithFailure(
      new Error(`${message} (url: ${requestUrl})`, {
        cause: err instanceof Error ? err : undefined,
      }),
    );
  }

  dispose();

  if (!response) {
    recordSuccess(failureUrl);
    return [];
  }

  if (!response.ok) {
    const snippet = normalizeSnippet(bodyText);
    throwWithFailure(
      new Error(
        `HTTP query failed with status ${response.status}: ${snippet} (url: ${requestUrl})`,
      ),
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const normalizedType = contentType.toLowerCase();
  const isJson =
    normalizedType.includes("application/json") ||
    normalizedType.includes("application/nostr+json");

  if (!isJson) {
    const snippet = normalizeSnippet(bodyText);
    throwWithFailure(
      new Error(
        `HTTP query returned unexpected content-type ${contentType || "unknown"}: ${snippet}`,
      ),
    );
  }

  let data: any = null;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch (err) {
    const snippet = normalizeSnippet(bodyText);
    throwWithFailure(
      new Error(
        `HTTP response contained invalid JSON: ${snippet} (url: ${requestUrl})`,
        { cause: err as Error },
      ),
    );
  }

  if (Array.isArray(data)) {
    recordSuccess(failureUrl);
    return data;
  }
  if (data && Array.isArray((data as any).events)) {
    recordSuccess(failureUrl);
    return (data as any).events as any[];
  }
  recordSuccess(failureUrl);
  return [];
}

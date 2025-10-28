import {
  FUNDSTR_EVT_URL,
  FUNDSTR_REQ_URL,
  HTTP_FALLBACK_TIMEOUT_MS,
} from "@/nutzap/relayEndpoints";

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

  if (!ack.accepted) {
    const reason = ack.message || "Relay rejected event";
    throw new Error(reason);
  }

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

  const requestUrl = buildRequestUrl(url, filters);
  const fetchFn = resolveFetch(fetchImpl);
  const { controller, dispose } = createAbortResources(timeoutMs);
  let response: Response | undefined;
  let bodyText = "";

  try {
    response = await fetchFn(requestUrl, {
      method: "GET",
      headers: {
        Accept: DEFAULT_HTTP_ACCEPT,
        ...headers,
      },
      cache: "no-store",
      signal: controller?.signal,
    });
    bodyText = await response.text();
  } catch (err) {
    dispose();
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `HTTP fallback timed out after ${timeoutMs}ms (url: ${requestUrl})`,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message} (url: ${requestUrl})`, {
      cause: err instanceof Error ? err : undefined,
    });
  }

  dispose();

  if (!response) {
    return [];
  }

  if (!response.ok) {
    const snippet = normalizeSnippet(bodyText);
    throw new Error(
      `HTTP query failed with status ${response.status}: ${snippet} (url: ${requestUrl})`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const normalizedType = contentType.toLowerCase();
  const isJson =
    normalizedType.includes("application/json") ||
    normalizedType.includes("application/nostr+json");

  if (!isJson) {
    const snippet = normalizeSnippet(bodyText);
    throw new Error(
      `HTTP query returned unexpected content-type ${contentType || "unknown"}: ${snippet}`,
    );
  }

  let data: any = null;
  try {
    data = bodyText ? JSON.parse(bodyText) : null;
  } catch (err) {
    const snippet = normalizeSnippet(bodyText);
    throw new Error(
      `HTTP response contained invalid JSON: ${snippet} (url: ${requestUrl})`,
      { cause: err as Error },
    );
  }

  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray((data as any).events)) {
    return (data as any).events as any[];
  }
  return [];
}

export type ParsedAuthHeader = {
  name: string;
  value: string;
};

/**
 * Parses a user-provided header string (e.g. "Authorization: Bearer token")
 * into a tuple that can be added to `fetch` headers. Accepts `name=value`
 * and `name: value` formats; when no delimiter is present the string is
 * treated as the header value for `Authorization`.
 */
export function parseAuthHeader(raw: unknown): ParsedAuthHeader | null {
  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const separatorIndex = trimmed.search(/[:=]/);
  if (separatorIndex > -1) {
    const name = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!value) {
      return null;
    }
    return { name: name || "Authorization", value };
  }

  return { name: "Authorization", value: trimmed };
}

export function authHeaderRecord(header: ParsedAuthHeader | null): Record<string, string> | null {
  if (!header) {
    return null;
  }
  return { [header.name]: header.value };
}

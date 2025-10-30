export interface FileMeta {
  t: "file";
  v: number;
  url: string;
  name: string;
  mime: string;
  bytes: number;
  key?: string | null;
  iv?: string | null;
  sha256?: string | null;
  thumb?: string | null;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return normalizeString(value);
}

export function normalizeFileMeta(input: unknown): FileMeta | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Record<string, unknown>;

  const type = normalizeString(candidate.t);
  if (type !== "file") return null;

  const versionRaw = Number(candidate.v);
  const version = Number.isFinite(versionRaw) && versionRaw > 0 ? Math.floor(versionRaw) : 1;
  if (version !== 1) return null;

  const url = normalizeString(candidate.url);
  if (!url) return null;

  const mime = normalizeString(candidate.mime) ?? "application/octet-stream";
  const name = normalizeString(candidate.name) ?? "";
  const bytesRaw = Number(candidate.bytes);
  const bytes = Number.isFinite(bytesRaw) && bytesRaw >= 0 ? Math.round(bytesRaw) : 0;

  const file: FileMeta = {
    t: "file",
    v: version,
    url,
    name,
    mime,
    bytes,
  };

  const key = normalizeNullableString(candidate.key);
  if (key !== undefined) file.key = key;

  const iv = normalizeNullableString(candidate.iv);
  if (iv !== undefined) file.iv = iv;

  const sha256 = normalizeNullableString(candidate.sha256);
  if (sha256 !== undefined) file.sha256 = sha256;

  const thumb = normalizeNullableString(candidate.thumb);
  if (thumb !== undefined) file.thumb = thumb;

  return file;
}

export function isFileMeta(value: unknown): value is FileMeta {
  if (!value || typeof value !== "object") return false;
  const meta = value as FileMeta;
  return (
    meta.t === "file" &&
    typeof meta.url === "string" &&
    meta.url.length > 0 &&
    typeof meta.name === "string" &&
    typeof meta.mime === "string" &&
    typeof meta.bytes === "number" &&
    Number.isFinite(meta.bytes)
  );
}

export function extractFilesFromContent(content: string): FileMeta[] {
  if (typeof content !== "string" || !content) return [];
  const lines = content.split("\n");
  const files: FileMeta[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed);
      const normalized = normalizeFileMeta(parsed);
      if (normalized) {
        files.push(normalized);
      }
    } catch {
      // ignore parse errors
    }
  }
  return files;
}

export function stripFileMetaLines(content: string): string {
  if (typeof content !== "string" || !content) return "";
  const lines = content.split("\n");
  const filtered: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
      filtered.push(rawLine);
      continue;
    }
    let skip = false;
    try {
      const parsed = JSON.parse(trimmed);
      if (normalizeFileMeta(parsed)) {
        skip = true;
      }
    } catch {
      // keep original line on parse error
    }
    if (!skip) {
      filtered.push(rawLine);
    }
  }
  return filtered.join("\n").trim();
}

export function buildEventContent(text: string, files: FileMeta[]): string {
  const parts: string[] = [];
  if (typeof text === "string" && text.length > 0) {
    parts.push(text);
  }
  for (const file of files) {
    parts.push(JSON.stringify(file));
  }
  return parts.join("\n");
}

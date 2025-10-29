export interface UploadRequest {
  fileId: string;
  blob: Blob;
  name: string;
  mime: string;
  bytes: number;
  endpoint: string;
  /** Additional metadata sent alongside the upload */
  metadata?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
  onProgress?: (progress: { loaded: number; total: number }) => void;
  headers?: Record<string, string>;
  withCredentials?: boolean;
}

export interface UploadResult {
  url: string;
  status: number;
  responseText: string;
  headers: Record<string, string>;
}

export interface UploadAdapter {
  upload(request: UploadRequest): Promise<UploadResult>;
}

export interface HttpUploadAdapterOptions {
  defaultHeaders?: Record<string, string>;
  fieldName?: string;
  method?: string;
  transformResponse?: (xhr: XMLHttpRequest) => UploadResult;
}

export function createHttpUploadAdapter(
  options: HttpUploadAdapterOptions = {},
): UploadAdapter {
  const {
    defaultHeaders = {},
    fieldName = "file",
    method = "POST",
    transformResponse,
  } = options;

  return {
    upload({
      fileId,
      blob,
      endpoint,
      name,
      mime,
      bytes,
      metadata,
      signal,
      onProgress,
      headers,
      withCredentials,
    }: UploadRequest): Promise<UploadResult> {
      return new Promise<UploadResult>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, endpoint, true);
        if (withCredentials) {
          xhr.withCredentials = true;
        }
        const finalHeaders = { ...defaultHeaders, ...headers };
        Object.entries(finalHeaders).forEach(([key, value]) => {
          if (value != null) {
            xhr.setRequestHeader(key, value);
          }
        });
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            onProgress?.({ loaded: event.loaded, total: event.total });
          } else {
            onProgress?.({ loaded: event.loaded, total: bytes });
          }
        };
        xhr.onreadystatechange = () => {
          if (xhr.readyState === XMLHttpRequest.DONE) {
            if (signal) {
              signal.removeEventListener("abort", handleAbort);
            }
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const response = transformResponse
                  ? transformResponse(xhr)
                  : defaultTransform(xhr);
                resolve(response);
              } catch (err) {
                reject(err);
              }
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };
        xhr.onerror = () => {
          if (signal) {
            signal.removeEventListener("abort", handleAbort);
          }
          reject(new Error("Network error during upload"));
        };
        const handleAbort = () => {
          xhr.abort();
          reject(new DOMException("Upload aborted", "AbortError"));
        };
        if (signal) {
          if (signal.aborted) {
            handleAbort();
            return;
          }
          signal.addEventListener("abort", handleAbort, { once: true });
        }
        const formData = new FormData();
        formData.append(fieldName, blob, name);
        formData.append("id", fileId);
        formData.append("name", name);
        formData.append("type", mime);
        formData.append("bytes", String(bytes));
        if (metadata) {
          Object.entries(metadata).forEach(([key, value]) => {
            if (value == null) return;
            formData.append(key, String(value));
          });
        }
        xhr.send(formData);
      });
    },
  };
}

function defaultTransform(xhr: XMLHttpRequest): UploadResult {
  const headers: Record<string, string> = {};
  const rawHeaders = xhr.getAllResponseHeaders();
  rawHeaders
    .trim()
    .split(/\r?\n/u)
    .forEach((line) => {
      if (!line) return;
      const [key, ...rest] = line.split(":");
      headers[key.trim().toLowerCase()] = rest.join(":").trim();
    });
  try {
    const data = JSON.parse(xhr.responseText || "{}");
    if (!data.url || typeof data.url !== "string") {
      throw new Error("Upload response missing url");
    }
    return {
      url: data.url,
      status: xhr.status,
      responseText: xhr.responseText,
      headers,
    };
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error("Failed to parse upload response");
  }
}

export const defaultUploadAdapter = createHttpUploadAdapter();

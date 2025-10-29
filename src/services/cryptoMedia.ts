function ensureCrypto(): Crypto {
  const cryptoObj =
    (typeof globalThis !== "undefined" && (globalThis as Crypto | undefined | any).crypto) ||
    (typeof window !== "undefined" ? window.crypto : undefined);
  if (!cryptoObj || !cryptoObj.subtle) {
    throw new Error("Web Crypto API is not available in this environment");
  }
  return cryptoObj;
}

const cryptoApi = ensureCrypto();
const subtle = cryptoApi.subtle;

export function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  const padded = normalized + (pad ? "=".repeat(4 - pad) : "");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateAesGcmKey(length: 128 | 192 | 256 = 256) {
  const key = await subtle.generateKey(
    {
      name: "AES-GCM",
      length,
    },
    true,
    ["encrypt", "decrypt"],
  );
  const raw = new Uint8Array(await subtle.exportKey("raw", key));
  return {
    key,
    raw,
    keyB64: base64UrlEncode(raw),
  } as const;
}

export function generateIv(bytes = 12) {
  const iv = cryptoApi.getRandomValues(new Uint8Array(bytes));
  return {
    iv,
    ivB64: base64UrlEncode(iv),
  } as const;
}

export async function encryptAesGcm(
  data: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array,
): Promise<ArrayBuffer> {
  return subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    data,
  );
}

export async function sha256(data: ArrayBuffer) {
  const digest = await subtle.digest("SHA-256", data);
  const hash = new Uint8Array(digest);
  return {
    hash,
    hashB64: base64UrlEncode(hash),
  } as const;
}

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if ("arrayBuffer" in blob) {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

export async function generateThumbnail(
  blob: Blob,
  maxSize = 256,
): Promise<string | null> {
  if (!blob.type.startsWith("image/")) {
    return null;
  }
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    bitmap = null;
  }
  if (!bitmap) {
    try {
      const dataUrl = await blobToDataUrl(blob);
      const img = document.createElement("img");
      img.src = dataUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed"));
      });
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      if (scale < 1) {
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
      } else {
        canvas.width = img.width || maxSize;
        canvas.height = img.height || maxSize;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const thumbBlob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/webp", 0.82),
      );
      if (!thumbBlob) return null;
      return blobToDataUrl(thumbBlob);
    } catch {
      return null;
    }
  }
  const { width, height } = bitmap;
  const scale = Math.min(1, maxSize / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const thumbBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", 0.82),
  );
  if (!thumbBlob) return null;
  return blobToDataUrl(thumbBlob);
}

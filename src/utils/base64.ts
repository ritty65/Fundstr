export function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(data).toString("base64");
  }

  if (typeof btoa !== "undefined") {
    let binary = "";
    data.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary);
  }

  throw new Error("No base64 encoder available");
}

export function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }

  if (typeof atob === "undefined") {
    throw new Error("No base64 decoder available");
  }

  const binary = atob(value);
  const result = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    result[i] = binary.charCodeAt(i);
  }

  return result;
}

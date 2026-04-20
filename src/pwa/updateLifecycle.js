const SENSITIVE_UPDATE_PREFIXES = [
  "/wallet",
  "/nostr-messenger",
  "/creator-studio",
  "/restore",
  "/unlock",
];

export function parseDeployMarker(rawMarker) {
  if (typeof rawMarker !== "string") {
    return null;
  }

  const lines = rawMarker
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const marker = {};
  for (const line of lines) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key) {
      continue;
    }

    marker[key] = value;
  }

  return marker;
}

export function isSensitiveUpdatePath(pathname) {
  if (typeof pathname !== "string") {
    return false;
  }

  const normalizedPath = pathname.trim() || "/";
  return SENSITIVE_UPDATE_PREFIXES.some(
    (prefix) =>
      normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}

export function isNewerLiveDeploy(currentBuildId, liveDeploySha) {
  if (
    typeof currentBuildId !== "string" ||
    typeof liveDeploySha !== "string" ||
    !currentBuildId.trim() ||
    !liveDeploySha.trim()
  ) {
    return false;
  }

  return currentBuildId.trim() !== liveDeploySha.trim();
}

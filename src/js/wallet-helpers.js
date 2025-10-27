function flattenProofs(proofs) {
  if (!Array.isArray(proofs)) {
    return [];
  }
  const flattened = [];
  for (const entry of proofs) {
    if (!entry) continue;
    if (Array.isArray(entry)) {
      flattened.push(...entry);
    } else {
      flattened.push(entry);
    }
  }
  return flattened;
}

function normalizeAmount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getAmountForTokenSet(tokenSet) {
  if (!tokenSet || !Array.isArray(tokenSet.proofs)) {
    return 0;
  }
  return flattenProofs(tokenSet.proofs).reduce(
    (sum, proof) => sum + normalizeAmount(proof?.amount),
    0,
  );
}

function getTokenAmounts(tokenSets) {
  if (!Array.isArray(tokenSets) || !tokenSets.length) {
    return [];
  }

  const groups = new Map();

  for (const token of tokenSets) {
    if (!token || !Array.isArray(token.proofs)) {
      continue;
    }
    const amount = getAmountForTokenSet(token);
    const unit = typeof token.unit === "string" && token.unit ? token.unit : "sat";
    const mint = typeof token.mint === "string" ? token.mint : "";
    const key = `${mint}__${unit}`;
    groups.set(key, (groups.get(key) ?? 0) + amount);
  }

  return Array.from(groups.entries()).map(([key, amount]) => {
    const [mint, unit] = key.split("__");
    return { mint, unit, amount };
  });
}

function getShortUrl(url) {
  url = url.replace("https://", "");
  url = url.replace("http://", "");
  const cut_param = 26;
  if (url.length > cut_param && url.indexOf("/") != -1) {
    url =
      url.substring(0, url.indexOf("/") + 1) +
      "..." +
      url.substring(url.length - cut_param / 2, url.length);
  }
  // cut the url if it is too long, keep the first cut_param/2 characters and the last cut_param/2 characters
  if (url.length > cut_param) {
    url =
      url.substring(0, cut_param / 2) +
      "..." +
      url.substring(url.length - cut_param / 2, url.length);
  }

  return url;
}

export { getShortUrl, getAmountForTokenSet, getTokenAmounts };

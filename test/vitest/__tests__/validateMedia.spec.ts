import { describe, it, expect, vi } from "vitest";
import {
  isTrustedUrl,
  normalizeYouTube,
  ipfsToGateway,
  normalizeMediaUrl,
  extractIframeSrc,
  determineMediaType,
  filterValidMedia,
} from "../../../src/utils/validateMedia";

describe("validateMedia", () => {
  it("accepts trusted schemes and hosts", () => {
    expect(isTrustedUrl("https://fundstr.me/media.png")).toBe(true);
    expect(isTrustedUrl("https://cdn.fundstr.me/video.mp4")).toBe(true);
    expect(isTrustedUrl("ipfs://cid")).toBe(true);
    expect(isTrustedUrl("nostr:foo")).toBe(true);
  });

  it("rejects untrusted schemes and hosts", () => {
    expect(isTrustedUrl("http://example.com")).toBe(false);
    expect(isTrustedUrl("ftp://example.com")).toBe(false);
    expect(isTrustedUrl("https://evil.example")).toBe(false);
  });

  it("blocks malicious iframe sources", () => {
    const javascriptSrc = '<iframe src="javascript:alert(1)"></iframe>';
    const dataSrc = '<iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="></iframe>';

    expect(isTrustedUrl(javascriptSrc)).toBe(false);
    expect(normalizeMediaUrl(javascriptSrc)).toBe("javascript:alert(1)");

    expect(isTrustedUrl(dataSrc)).toBe(false);
    expect(normalizeMediaUrl(dataSrc)).toBe(
      "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    );
  });

  it("normalizes youtube links", () => {
    const url = "https://youtu.be/ab_cd-12345";
    expect(normalizeYouTube(url)).toBe(
      "https://www.youtube.com/embed/ab_cd-12345",
    );
  });

  it("converts ipfs links to gateway", () => {
    const url = "ipfs://bafy123/file.png";
    expect(ipfsToGateway(url)).toBe(
      "https://nftstorage.link/ipfs/bafy123/file.png",
    );
    expect(normalizeMediaUrl(url)).toBe(
      "https://nftstorage.link/ipfs/bafy123/file.png",
    );
  });

  it("parses iframe snippets", () => {
    const snippet = '<iframe src="https://example.com/embed"></iframe>';
    expect(extractIframeSrc(snippet)).toBe("https://example.com/embed");
    expect(normalizeMediaUrl(snippet)).toBe("https://example.com/embed");
  });

  it("returns empty string for non-string media inputs", () => {
    expect(extractIframeSrc(undefined)).toBe("");
    expect(extractIframeSrc(null)).toBe("");
    expect(normalizeMediaUrl(undefined)).toBe("");
    expect(normalizeMediaUrl(123 as unknown as string)).toBe("");
  });

  it("detects media type", () => {
    expect(determineMediaType("https://example.com/video.mp4")).toBe("video");
    expect(determineMediaType("https://example.com/song.mp3")).toBe("audio");
    expect(determineMediaType("https://www.youtube.com/embed/id")).toBe(
      "youtube",
    );
    expect(determineMediaType("https://example.com/image.png")).toBe("image");
    expect(determineMediaType("https://example.com/page")).toBe("iframe");
  });

  it("detects nostr event links", () => {
    expect(determineMediaType("https://primal.net/e/abc123")).toBe("nostr");
    expect(determineMediaType("https://snort.social/e/def456")).toBe("nostr");
  });

  it("filters invalid media entries", () => {
    const media = filterValidMedia([
      { url: "" },
      { url: "http://bad.com" },
      { url: "https://cdn.fundstr.me/ok.png" },
    ]);
    expect(media).toEqual([{ url: "https://cdn.fundstr.me/ok.png" }]);
  });

  it("honors env-configured trusted hosts", async () => {
    vi.stubEnv("VITE_TRUSTED_MEDIA_HOSTS", "media.customcdn.com, images.partner.net");
    vi.resetModules();
    const module = await import("../../../src/utils/validateMedia");

    expect(module.isTrustedUrl("https://media.customcdn.com/image.png")).toBe(true);
    expect(module.isTrustedUrl("https://images.partner.net/photo.webp")).toBe(true);
    expect(module.isTrustedUrl("https://untrusted.cdn.net/photo.webp")).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("accepts and rejects media hosts by type", () => {
    expect(isTrustedUrl("https://assets.fundstr.me/photo.jpeg")).toBe(true);
    expect(determineMediaType("https://assets.fundstr.me/photo.jpeg")).toBe("image");

    expect(isTrustedUrl("https://media.fundstr.me/clip.mp4")).toBe(true);
    expect(determineMediaType("https://media.fundstr.me/clip.mp4")).toBe("video");

    expect(isTrustedUrl("https://cdn.fundstr.me/song.mp3")).toBe(true);
    expect(determineMediaType("https://cdn.fundstr.me/song.mp3")).toBe("audio");

    expect(isTrustedUrl("https://staging.fundstr.me/embed/page")).toBe(true);
    expect(determineMediaType("https://staging.fundstr.me/embed/page")).toBe("iframe");

    expect(isTrustedUrl("https://malicious.example.com/evil.mp4")).toBe(false);
  });
});

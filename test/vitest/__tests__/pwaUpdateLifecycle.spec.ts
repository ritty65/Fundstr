import { describe, expect, it } from "vitest";
import {
  isNewerLiveDeploy,
  isSensitiveUpdatePath,
  parseDeployMarker,
} from "src/pwa/updateLifecycle";

describe("parseDeployMarker", () => {
  it("extracts deploy marker fields from text", () => {
    expect(
      parseDeployMarker(`env=production
sha=abc123
ref=main
built_at=2026-04-20T08:04:16Z
run_id=12345
`),
    ).toEqual({
      env: "production",
      sha: "abc123",
      ref: "main",
      built_at: "2026-04-20T08:04:16Z",
      run_id: "12345",
    });
  });

  it("returns null for non-string or empty markers", () => {
    expect(parseDeployMarker(undefined as unknown as string)).toBeNull();
    expect(parseDeployMarker("")).toBeNull();
  });
});

describe("isSensitiveUpdatePath", () => {
  it("flags wallet and publishing paths as sensitive", () => {
    expect(isSensitiveUpdatePath("/wallet")).toBe(true);
    expect(isSensitiveUpdatePath("/wallet/send")).toBe(true);
    expect(isSensitiveUpdatePath("/nostr-messenger")).toBe(true);
    expect(isSensitiveUpdatePath("/creator-studio/drafts")).toBe(true);
    expect(isSensitiveUpdatePath("/restore")).toBe(true);
    expect(isSensitiveUpdatePath("/unlock")).toBe(true);
  });

  it("does not flag passive discovery pages", () => {
    expect(isSensitiveUpdatePath("/find-creators")).toBe(false);
    expect(isSensitiveUpdatePath("/creator/npub1test/profile")).toBe(false);
    expect(isSensitiveUpdatePath("/settings")).toBe(false);
  });
});

describe("isNewerLiveDeploy", () => {
  it("detects when the live deploy SHA differs from the current build", () => {
    expect(isNewerLiveDeploy("abc123", "def456")).toBe(true);
  });

  it("ignores identical or missing build identifiers", () => {
    expect(isNewerLiveDeploy("abc123", "abc123")).toBe(false);
    expect(isNewerLiveDeploy("", "abc123")).toBe(false);
    expect(isNewerLiveDeploy("abc123", "")).toBe(false);
  });
});

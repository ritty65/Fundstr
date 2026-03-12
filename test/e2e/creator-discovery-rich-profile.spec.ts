import { test, expect, type Page } from "@playwright/test";
import { nip19 } from "nostr-tools";

import {
  installDeterministicRelayMocks,
  resetBrowserState,
  seedRelayEvent,
} from "./support/journey-fixtures";

const CREATOR_HEX = "a".repeat(64);
const CREATOR_NPUB = nip19.npubEncode(CREATOR_HEX);
const CREATOR_HANDLE = "alice@fundstr.me";
const CREATOR_TIER_ID = "founders-video";
const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const LINK_URL = "https://fundstr.me/roadmap";

async function installDiscoveryMocks(page: Page) {
  const creatorResult = {
    pubkey: CREATOR_HEX,
    profile: {
      display_name: "Alice Media Creator",
      name: "alice",
      about: "Video-rich supporter experiences for the Fundstr community.",
      picture: "https://fundstr.me/avatar.png",
      banner: "https://fundstr.me/banner.png",
      nip05: CREATOR_HANDLE,
      nip05_verified_value: CREATOR_HANDLE,
      has_nutzap: true,
    },
    followers: 42,
    following: 12,
    joined: 1700000000,
    tiers: [
      {
        id: CREATOR_TIER_ID,
        name: "Founders Club",
        price_sats: 5000,
        frequency: "monthly",
        description: "Monthly studio tour with behind-the-scenes posts.",
        benefits: ["Private updates", "Studio tour"],
        media: [
          { url: VIDEO_URL, type: "video", title: "Studio tour" },
          { url: LINK_URL, type: "link", title: "Roadmap" },
        ],
      },
    ],
  };

  await page.route("**/discover/creators**", async (route) => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("q") || "").toLowerCase();
    const matches =
      query === "*" ||
      query === CREATOR_HANDLE.toLowerCase() ||
      query.includes("alice") ||
      query.includes(CREATOR_NPUB.toLowerCase());

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: matches ? 1 : 0,
        results: matches ? [creatorResult] : [],
        warnings: [],
        cached: false,
        tookMs: 12,
      }),
    });
  });

  await page.route("**/discover/creators/by-pubkeys**", async (route) => {
    const url = new URL(route.request().url());
    const npubs = (url.searchParams.get("npubs") || "").split(",");
    const matches = npubs.includes(CREATOR_NPUB);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: matches ? 1 : 0,
        results: matches ? [creatorResult] : [],
        warnings: [],
        cached: false,
        tookMs: 9,
        query: "by-pubkeys",
      }),
    });
  });

  await page.route("**/nutzap/profile-and-tiers**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pubkey: CREATOR_HEX,
        meta: creatorResult.profile,
        nutzapProfile: {
          trustedMints: ["https://mint.fundstr.me"],
          relays: ["wss://relay.fundstr.me"],
          p2pk: CREATOR_HEX,
          tierAddr: `30019:${CREATOR_HEX}:tiers`,
        },
        tiers: creatorResult.tiers,
        source: "discovery",
        stale: false,
      }),
    });
  });
}

async function seedCreatorRelayState(page: Page) {
  await seedRelayEvent(page, {
    id: "profile-10019",
    pubkey: CREATOR_HEX,
    kind: 10019,
    created_at: 1700000100,
    tags: [
      ["t", "nutzap-profile"],
      ["client", "fundstr"],
      ["mint", "https://mint.fundstr.me", "sat"],
      ["relay", "wss://relay.fundstr.me"],
      ["pubkey", CREATOR_HEX],
      ["a", `30019:${CREATOR_HEX}:tiers`],
    ],
    content: JSON.stringify({
      v: 1,
      p2pk: CREATOR_HEX,
      mints: ["https://mint.fundstr.me"],
      relays: ["wss://relay.fundstr.me"],
      tierAddr: `30019:${CREATOR_HEX}:tiers`,
    }),
    sig: "f".repeat(128),
  });

  await seedRelayEvent(page, {
    id: "tiers-30019",
    pubkey: CREATOR_HEX,
    kind: 30019,
    created_at: 1700000200,
    tags: [["d", "tiers"]],
    content: JSON.stringify({
      v: 1,
      tiers: [
        {
          id: CREATOR_TIER_ID,
          title: "Founders Club",
          price: 5000,
          frequency: "monthly",
          description: "Monthly studio tour with behind-the-scenes posts.",
          benefits: ["Private updates", "Studio tour"],
          media: [
            { url: VIDEO_URL, type: "video", title: "Studio tour" },
            { url: LINK_URL, type: "link", title: "Roadmap" },
          ],
        },
      ],
    }),
    sig: "e".repeat(128),
  });
}

test.describe("creator discovery and rich profile flows", () => {
  test.beforeEach(async ({ page }) => {
    await installDeterministicRelayMocks(page);
    await installDiscoveryMocks(page);
    await resetBrowserState(page);
  });

  test("loads a public creator profile from a verified NIP-05 route and renders rich tier media", async ({
    page,
  }) => {
    await page.goto("/");
    await seedCreatorRelayState(page);

    await page.goto(`/creator/${encodeURIComponent(CREATOR_HANDLE)}/profile`, {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", { name: "Alice Media Creator" }),
    ).toBeVisible();
    await expect(
      page.locator(".tier-card__media iframe").first(),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Roadmap" })).toBeVisible();
  });

  test("find creators search accepts pasted public profile links", async ({
    page,
  }) => {
    await page.goto("/find-creators", { waitUntil: "domcontentloaded" });

    const searchInput = page.getByLabel("Search Nostr profiles");
    await searchInput.fill(
      `https://fundstr.me/creator/${encodeURIComponent(
        CREATOR_HANDLE,
      )}/profile`,
    );
    await searchInput.press("Enter");

    await expect(page.getByText("Alice Media Creator")).toBeVisible();
    await expect(page.getByText("1 creator found")).toBeVisible();
    await expect(
      page.getByText(/signal is aborted without reason/i),
    ).toHaveCount(0);
  });

  test("quick enter searches do not surface aborted-request banners", async ({
    page,
  }) => {
    await page.goto("/find-creators", { waitUntil: "domcontentloaded" });

    const searchInput = page.getByLabel("Search Nostr profiles");
    await searchInput.fill("alice");
    await searchInput.press("Enter");

    await expect(page.getByText("Alice Media Creator")).toBeVisible();
    await expect(
      page.getByText(/signal is aborted without reason/i),
    ).toHaveCount(0);
    await expect(page.locator(".status-banner__text")).not.toContainText(
      /aborted/i,
    );
  });
});

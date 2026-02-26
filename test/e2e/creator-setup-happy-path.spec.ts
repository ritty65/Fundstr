import { test, expect } from "@playwright/test";
import {
  bootstrapFundstr,
  completeOnboarding,
  installDeterministicRelayMocks,
  TEST_CREATOR_HEX,
  TEST_MINT_URL,
  resetBrowserState,
} from "./support/journey-fixtures";

const DISPLAY_NAME = "E2E Creator";
const PICTURE_URL = "https://example.com/avatar.png";
const TIER_TITLE = "Founders Club";
const TIER_PRICE = "5000";

test.describe("creator studio happy path", () => {
  test("creator configures profile, publishes tiers, and profile page renders", async ({ page }) => {
    await installDeterministicRelayMocks(page);
    await resetBrowserState(page);
    await bootstrapFundstr(page);
    await completeOnboarding(page);

    await page.goto("/creator-studio");
    await expect(page.getByRole("heading", { name: "Creator Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Relay status: Connected")).toBeVisible();

    await page.getByLabel("Creator author (npub or hex)").fill(TEST_CREATOR_HEX);
    await expect(page.getByText("Relay and author ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Profile identity")).toBeVisible();
    await page.getByLabel("Display name").fill(DISPLAY_NAME);
    await page.getByLabel("Picture URL").fill(PICTURE_URL);
    await page.getByPlaceholder("Add mint & press enter").fill(TEST_MINT_URL);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Add new key" }).click();
    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Manage Tiers")).toBeVisible();
    await page.getByRole("button", { name: "Add Tier" }).click();
    const tierCard = page.locator(".tier-composer__card").first();
    await tierCard.getByLabel("Title").fill(TIER_TITLE);
    await tierCard.getByLabel("Price (sats)").fill(TIER_PRICE);
    await tierCard.getByLabel("Frequency").click();
    await page.getByRole("option", { name: /Monthly/i }).click();

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    const publishButton = page.getByRole("button", { name: "Publish profile & tiers" });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    await page.waitForFunction(() => {
      return (window as any).__FUNDSTR_E2E_RELAY__?.getEventCount?.() >= 3;
    });

    await page.goto(`/creator/${TEST_CREATOR_HEX}/profile`);

    await expect(page.getByRole("heading", { name: DISPLAY_NAME })).toBeVisible();
    await expect(page.getByText(TEST_MINT_URL)).toBeVisible();
    await expect(page.getByRole("heading", { name: TIER_TITLE })).toBeVisible();
    await expect(page.locator(".profile-tier-list")).toContainText(/5[\s,\u202f]?000\s*sats/i);
  });
});

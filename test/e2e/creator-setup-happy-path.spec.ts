import { test, expect, type Page } from "@playwright/test";
import {
  bootstrapAndCompleteOnboarding,
  installDeterministicRelayMocks,
  installMintCatalogMocks,
  TEST_CREATOR_HEX,
  TEST_KEYSET_ID,
  TEST_MINT_URL,
  resetBrowserState,
} from "./support/journey-fixtures";

const DISPLAY_NAME = "E2E Creator";
const PICTURE_URL = "https://example.com/avatar.png";
const TIER_TITLE = "Founders Club";
const TIER_PRICE = "5000";

async function ensureCreatorP2pkSelected(page: Page, publicKey: string) {
  const publishingInput = page.getByLabel("Publishing P2PK public");
  const getValue = async () =>
    (await publishingInput.inputValue()).trim().toLowerCase();
  const expectedValue = publicKey.trim().toLowerCase();

  if ((await getValue()) === expectedValue) {
    return;
  }

  const useSavedKeyButton = page.getByRole("button", {
    name: "Use saved key",
  });
  if (await useSavedKeyButton.isVisible()) {
    await useSavedKeyButton.click();
  }

  if ((await getValue()) !== expectedValue) {
    const p2pkSelect = page.getByLabel("Saved P2PK keys");
    await p2pkSelect.click();
    await page
      .getByRole("option", {
        name: new RegExp(`${publicKey.slice(0, 8)}.*${publicKey.slice(-4)}`),
      })
      .click();
  }

  await expect
    .poll(async () => getValue(), { timeout: 5000 })
    .toBe(expectedValue);
}

test.describe("creator studio happy path", () => {
  test("creator configures profile, publishes tiers, and profile page renders", async ({
    page,
  }) => {
    await installDeterministicRelayMocks(page);
    await installMintCatalogMocks(page);
    await resetBrowserState(page);
    const api = await bootstrapAndCompleteOnboarding(page);
    await api.seedMint({ url: TEST_MINT_URL, keysetId: TEST_KEYSET_ID });

    await page.goto("/creator-studio");
    await expect(
      page.getByRole("heading", { name: "Creator Dashboard" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Edit Fundstr Profile" }).click();

    await expect(page.getByText("Profile identity")).toBeVisible();
    await page.getByLabel("Display name").fill(DISPLAY_NAME);
    await page.getByLabel("Picture URL").fill(PICTURE_URL);
    await page.getByPlaceholder("Add mint & press enter").fill(TEST_MINT_URL);
    await page.keyboard.press("Enter");
    await expect(
      page.locator(".chip-input__chips").getByText(TEST_MINT_URL, {
        exact: true,
      }),
    ).toBeVisible();
    const { publicKey } = await api.seedCreatorP2pk();
    await ensureCreatorP2pkSelected(page, publicKey);

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Manage Tiers")).toBeVisible();
    await page.getByRole("button", { name: "Add Tier" }).click();
    const tierCard = page.locator(".tier-composer__card").first();
    await tierCard.getByLabel("Title").fill(TIER_TITLE);
    await tierCard.getByLabel("Price (sats)").fill(TIER_PRICE);
    await tierCard.getByRole("combobox", { name: "Frequency" }).click({
      force: true,
    });
    await page.getByRole("option", { name: /Monthly/i }).click();

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.locator(".preview-hero__name")).toContainText(
      DISPLAY_NAME,
    );
    await expect(
      page.locator(".preview-tier-card__title").first(),
    ).toContainText(TIER_TITLE);

    const publishButton = page.getByRole("button", {
      name: "Publish profile & tiers",
    });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    await page.waitForFunction(() => {
      return (window as any).__FUNDSTR_E2E_RELAY__?.getEventCount?.() >= 3;
    });

    const publishedEvents = await page.evaluate(() => {
      return (window as any).__FUNDSTR_E2E_RELAY__?.getEvents?.() ?? [];
    });

    const publishedKinds = publishedEvents.map((event: any) => event.kind);
    expect(publishedKinds).toEqual(
      expect.arrayContaining([10019, 30019, 30000]),
    );

    const profileEvent = publishedEvents.find(
      (event: any) => event.kind === 10019,
    );
    expect(profileEvent?.pubkey).toBe(TEST_CREATOR_HEX);
    expect(profileEvent?.tags).toEqual(
      expect.arrayContaining([["mint", TEST_MINT_URL, "sat"]]),
    );

    const canonicalTiers = publishedEvents.find(
      (event: any) => event.kind === 30019,
    );
    expect(canonicalTiers?.content).toContain(TIER_TITLE);
    expect(canonicalTiers?.content).toContain(TIER_PRICE);
  });
});

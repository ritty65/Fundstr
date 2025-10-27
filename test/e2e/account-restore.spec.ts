import { test, expect, type Page } from "@playwright/test";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  bootstrapFundstr,
  resetBrowserState,
  TEST_KEYSET_ID,
  TEST_MINT_URL,
} from "./support/journey-fixtures";

const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const INVALID_MNEMONIC = "abandon abandon abandon";
const DEFAULT_RESTORE_AMOUNTS = [512, 256, 128, 64];
const DENOMINATIONS = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
} as const;
const MINT_INFO_PRIVKEY = "11".repeat(32);
const MINT_INFO_PUBKEY = secp256k1.ProjectivePoint.BASE
  .multiply(BigInt(`0x${MINT_INFO_PRIVKEY}`))
  .toHex(true);

type KeyPair = { priv: string; pub: string };

type MintMockController = {
  publicKeys: Record<number, string>;
  pubkey: string;
  expectedBalance: number;
  restoreCallCount(): number;
  failNextRestore(message?: string): void;
};

function buildKeyPairs(): Map<number, KeyPair> {
  const pairs = new Map<number, KeyPair>();
  DENOMINATIONS.forEach((denom, index) => {
    const privHex = (index + 1).toString(16).padStart(64, "0");
    const pubHex = secp256k1.ProjectivePoint.BASE
      .multiply(BigInt(`0x${privHex}`))
      .toHex(true);
    pairs.set(denom, { priv: privHex, pub: pubHex });
  });
  return pairs;
}

async function localizedNumber(page: Page, value: number): Promise<string> {
  return page.evaluate(
    (amount) => new Intl.NumberFormat(navigator.language).format(amount),
    value,
  );
}

async function waitForMintBalance(page: Page, amount: number) {
  const formatted = await localizedNumber(page, amount);
  const badge = page
    .locator(".q-badge")
    .filter({ hasText: new RegExp(`${formatted}\\s+sat`, "i") });
  await expect(badge).toBeVisible();
}

async function expectNoMintBalance(page: Page, amount: number) {
  const formatted = await localizedNumber(page, amount);
  const badge = page
    .locator(".q-badge")
    .filter({ hasText: new RegExp(`${formatted}\\s+sat`, "i") });
  await expect(badge).toHaveCount(0);
}

async function setupRestoreMintMocks(
  page: Page,
  restoreAmounts: number[],
): Promise<MintMockController> {
  const keyPairs = buildKeyPairs();
  const publicKeys = Object.fromEntries(
    Array.from(keyPairs.entries(), ([amount, pair]) => [amount, pair.pub]),
  ) as Record<number, string>;
  let restoreQueue = [...restoreAmounts];
  let restoreCalls = 0;
  let failNext = false;
  let failureMessage = "Mint offline";

  const fulfillJson = (route: any, body: unknown, status = 200) =>
    route.fulfill({
      status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const handleOptions = (route: any) =>
    route.fulfill({
      status: 204,
      headers: CORS_HEADERS,
    });

  await page.route(`${TEST_MINT_URL}/keys`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    return route.fulfill({ status: 200, headers: CORS_HEADERS, body: "" });
  });

  await page.route(new RegExp(`${TEST_MINT_URL.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}/v1/keys(?:/.+)?`), (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    return fulfillJson(route, {
      keysets: [
        {
          id: TEST_KEYSET_ID,
          unit: "sat",
          keys: publicKeys,
        },
      ],
    });
  });

  await page.route(`${TEST_MINT_URL}/v1/keysets`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    return fulfillJson(route, {
      keysets: [
        {
          id: TEST_KEYSET_ID,
          unit: "sat",
          active: true,
        },
      ],
    });
  });

  await page.route(`${TEST_MINT_URL}/info`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    return fulfillJson(route, { name: "Fixture Mint", version: "1.0.0" });
  });

  await page.route(`${TEST_MINT_URL}/v1/info`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    return fulfillJson(route, {
      name: "Fixture Mint",
      pubkey: MINT_INFO_PUBKEY,
      version: "1.0.0",
      contact: [],
      nuts: {
        4: { methods: [], disabled: false },
        5: { methods: [], disabled: false },
      },
    });
  });

  await page.route(`${TEST_MINT_URL}/v1/checkstate`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    const body = JSON.parse(route.request().postData() || "{}") as {
      Ys?: string[];
    };
    const states = (body.Ys ?? []).map((Y) => ({
      Y,
      state: "UNSPENT",
      witness: null,
    }));
    return fulfillJson(route, { states });
  });

  await page.route(`${TEST_MINT_URL}/v1/restore`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return handleOptions(route);
    }
    restoreCalls += 1;
    if (failNext) {
      failNext = false;
      return fulfillJson(route, { error: failureMessage }, 500);
    }

    const requestBody = JSON.parse(route.request().postData() || "{}") as {
      outputs?: Array<{ B_: string; id?: string; amount?: number }>;
    };
    const outputs = requestBody.outputs ?? [];
    const signedOutputs: typeof outputs = [];
    const signatures: Array<{ id: string; amount: number; C_: string }> = [];

    for (const output of outputs) {
      if (restoreQueue.length === 0) {
        break;
      }
      const amount = restoreQueue.shift()!;
      const pair = keyPairs.get(amount);
      if (!pair) {
        continue;
      }
      const BPoint = secp256k1.ProjectivePoint.fromHex(output.B_);
      const CPoint = BPoint.multiply(BigInt(`0x${pair.priv}`));
      signedOutputs.push({ ...output, amount });
      signatures.push({
        id: output.id ?? TEST_KEYSET_ID,
        amount,
        C_: CPoint.toHex(true),
      });
    }

    return fulfillJson(route, {
      outputs: signedOutputs,
      signatures,
    });
  });

  return {
    publicKeys,
    pubkey: MINT_INFO_PUBKEY,
    expectedBalance: restoreAmounts.reduce((sum, value) => sum + value, 0),
    restoreCallCount() {
      return restoreCalls;
    },
    failNextRestore(message = "Mint offline") {
      failNext = true;
      failureMessage = message;
    },
  };
}

async function prepareRestorePage(page: Page, restoreAmounts = DEFAULT_RESTORE_AMOUNTS) {
  await resetBrowserState(page);
  const mintMock = await setupRestoreMintMocks(page, restoreAmounts);
  const api = await bootstrapFundstr(page);
  await api.seedMint({
    url: TEST_MINT_URL,
    keysetId: TEST_KEYSET_ID,
    nickname: "Fixture Mint",
    keys: mintMock.publicKeys,
    info: {
      name: "Fixture Mint",
      pubkey: mintMock.pubkey,
      version: "1.0.0",
    },
  });
  await page.goto("/restore");
  await expect(page).toHaveURL(/\/restore$/);
  await expect(page.getByRole("button", { name: /Restore All Mints/i })).toBeVisible();
  return { api, mintMock };
}

async function getStoredMintPubkey(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("cashu.mints");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed[0]?.info?.pubkey ?? null;
    } catch {
      return null;
    }
  });
}

test.describe("account restore", () => {
  test("restores balances from mnemonic", async ({ page }) => {
    const { mintMock } = await prepareRestorePage(page);
    const mnemonicInput = page.getByLabel("Seed phrase");
    await mnemonicInput.fill(VALID_MNEMONIC);
    await page.getByRole("button", { name: /Restore All Mints/i }).click();

    await waitForMintBalance(page, mintMock.expectedBalance);

    const storedPubkey = await getStoredMintPubkey(page);
    expect(storedPubkey).toBe(mintMock.pubkey);
    expect(mintMock.restoreCallCount()).toBeGreaterThan(0);
  });

  test("rejects invalid mnemonic and resets state before retry", async ({ page }) => {
    const { mintMock } = await prepareRestorePage(page);
    const mnemonicInput = page.getByLabel("Seed phrase");
    const restoreButton = page.getByRole("button", { name: /Restore All Mints/i });

    await mnemonicInput.fill(INVALID_MNEMONIC);
    await restoreButton.click();

    const errorMessage = page.locator("text=Mnemonic should be at least 12 words.");
    await expect(errorMessage).toBeVisible();
    expect(mintMock.restoreCallCount()).toBe(0);

    await mnemonicInput.fill(VALID_MNEMONIC);
    await restoreButton.click();

    await waitForMintBalance(page, mintMock.expectedBalance);
    await expect(errorMessage).toHaveCount(0);
    expect(mintMock.restoreCallCount()).toBeGreaterThan(0);
  });

  test("surfaces mint failure and allows retry", async ({ page }) => {
    const { mintMock } = await prepareRestorePage(page);
    const mnemonicInput = page.getByLabel("Seed phrase");
    const restoreButton = page.getByRole("button", { name: /Restore All Mints/i });

    await mnemonicInput.fill(VALID_MNEMONIC);
    mintMock.failNextRestore("Mint temporarily unavailable");
    await restoreButton.click();

    const errorNotification = page
      .locator(".q-notification")
      .filter({ hasText: /Error restoring mints/i });
    await expect(errorNotification).toBeVisible();
    await expectNoMintBalance(page, mintMock.expectedBalance);
    await expect(restoreButton).toBeEnabled();

    await restoreButton.click();

    await waitForMintBalance(page, mintMock.expectedBalance);
    await expect(errorNotification).toHaveCount(0);
    expect(mintMock.restoreCallCount()).toBeGreaterThanOrEqual(2);
  });
});

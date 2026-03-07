import { test, expect } from "@playwright/test";
import type { E2EApi } from "./support/e2e-api";
import {
  bootstrapAndCompleteOnboarding,
  TEST_KEYSET_ID,
  TEST_MINT_URL,
} from "./support/journey-fixtures";

async function setupWallet(page: any) {
  const api = await bootstrapAndCompleteOnboarding(page);
  await api.seedMint({
    url: TEST_MINT_URL,
    keysetId: TEST_KEYSET_ID,
  });
  await page.goto("/wallet");
  await expect(page).toHaveURL(/\/wallet/);
  return api;
}

async function requestMintTopUp(
  page: any,
  api: E2EApi,
  amount: number,
  proofAmounts: number[],
  description?: string,
) {
  await page.getByRole("button", { name: /Receive/i }).click();
  await page.getByRole("button", { name: /Lightning/i }).click();
  const amountInput = page.getByLabel(/Amount \(sat/i);
  await amountInput.fill(String(amount));
  await page.getByRole("button", { name: "Create Invoice" }).click();
  let quoteId: string | null = null;
  await expect
    .poll(async () => {
      quoteId = await api.walletMockGetLastMintQuote();
      return Boolean(quoteId);
    })
    .toBe(true);
  if (!quoteId) {
    throw new Error("Failed to capture mock mint quote");
  }
  await api.walletMockPayMintQuote(quoteId, {
    proofAmounts,
    description,
  });
  await expect
    .poll(async () => {
      const invoices = await api.getInvoiceHistory();
      return invoices.find((entry) => entry.quote === quoteId)?.status ?? null;
    })
    .toBe("paid");
  return quoteId;
}

async function createMockInvoice(
  api: E2EApi,
  amount: number,
  description?: string,
) {
  return api.walletMockCreateLightningInvoice({ amount, description });
}

test.describe("wallet flows happy path", () => {
  test("mint top-up updates balance and history", async ({ page }) => {
    const api = await setupWallet(page);
    const mintAmount = 4000;
    const quoteId = await requestMintTopUp(
      page,
      api,
      mintAmount,
      [2000, 1000, 500, 500],
    );

    const snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBe(mintAmount);

    const history = await api.getHistoryTokens();
    const latest = history.at(-1);
    expect(latest?.amount).toBe(mintAmount);
    expect(latest?.status).toBe("paid");

    const invoices = await api.getInvoiceHistory();
    const mintedInvoice = invoices.find((entry) => entry.quote === quoteId);
    expect(mintedInvoice?.status).toBe("paid");
  });

  test("pay lightning invoice deducts balance and records history", async ({
    page,
  }) => {
    const api = await setupWallet(page);
    const mintAmount = 5000;
    await requestMintTopUp(page, api, mintAmount, [2000, 2000, 1000]);
    await page.goto("/wallet");

    const invoice = await createMockInvoice(api, 1500, "Mock service");
    await api.walletMockPayLightningInvoice(invoice.request);
    await expect
      .poll(async () => {
        const invoices = await api.getInvoiceHistory();
        return (
          invoices.find((entry) => entry.quote === invoice.quote)?.status ??
          null
        );
      })
      .toBe("paid");

    const snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBe(mintAmount - 1500);

    const history = await api.getHistoryTokens();
    const outgoing = history.find((entry) => entry.amount === -1500);
    expect(outgoing).toBeTruthy();
    expect(outgoing?.status).toBe("paid");

    const invoices = await api.getInvoiceHistory();
    const paidInvoice = invoices.find((entry) => entry.quote === invoice.quote);
    expect(paidInvoice?.status).toBe("paid");
  });

  test("send ecash creates pending history entry", async ({ page }) => {
    const api = await setupWallet(page);
    const mintAmount = 4500;
    await requestMintTopUp(page, api, mintAmount, [2000, 1000, 1000, 500]);
    await page.goto("/wallet");

    await api.walletMockCreatePendingEcash(700, "Test ecash send");

    await expect
      .poll(async () => {
        const history = await api.getHistoryTokens();
        const latest = history.at(-1);
        return latest ? { amount: latest.amount, status: latest.status } : null;
      })
      .toEqual({ amount: -700, status: "pending" });

    const history = await api.getHistoryTokens();
    const latest = history.at(-1);
    expect(latest?.amount).toBe(-700);
    expect(latest?.status).toBe("pending");

    const snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBe(mintAmount - 700);
  });

  test("redeem ecash restores balance and history", async ({ page }) => {
    const api = await setupWallet(page);
    const mintAmount = 3200;
    await requestMintTopUp(page, api, mintAmount, [2000, 800, 400]);
    await page.goto("/wallet");

    const redeemAmount = 800;
    const token = await api.generateToken(redeemAmount);

    const snapshotAfterSend = await api.getSnapshot();
    expect(snapshotAfterSend.balance).toBe(mintAmount - redeemAmount);

    expect(token).toMatch(/^cashu/);
    await api.redeemToken(redeemAmount);

    const finalSnapshot = await api.getSnapshot();
    expect(finalSnapshot.balance).toBe(mintAmount);

    const history = await api.getHistoryTokens();
    const incoming = history.find((entry) => entry.amount === redeemAmount);
    expect(incoming).toBeTruthy();
    expect(incoming?.status).toBe("paid");
  });
});

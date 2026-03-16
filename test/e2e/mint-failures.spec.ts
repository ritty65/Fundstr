import { test, expect } from "@playwright/test";

test("handles mint HTTP failures without crediting balance", async ({ page }) => {
  let resolveMintRequest!: (url: string) => void;
  const mintRequest = new Promise<string>((resolve) => {
    resolveMintRequest = resolve;
  });

  const mintUrlPattern = /https:\/\/fundstr\.test\/mint\?amount=200/;

  await page.context().route(mintUrlPattern, (route) => {
    resolveMintRequest(route.request().url());
    route.fulfill({ status: 500, body: "Mint down" });
  });

  const originUrl = "https://fundstr.test/";

  await page.context().route(originUrl, (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!DOCTYPE html><html><head></head><body></body></html>",
    });
  });

  const html = `
    <button id="check">Check Mint</button>
    <div id="status"></div>
    <script>
      localStorage.clear();
      localStorage.setItem('cashu.wallet.balance', '0');
      async function checkMint() {
        try {
          const response = await fetch('/mint?amount=200');
          if (!response.ok) {
            throw new Error('Mint unavailable');
          }
          const data = await response.json();
          const balance = Number(localStorage.getItem('cashu.wallet.balance') || '0');
          localStorage.setItem('cashu.wallet.balance', String(balance + (data.amount || 0)));
          document.getElementById('status').textContent = 'Mint success';
        } catch (err) {
          document.getElementById('status').textContent = 'Mint unavailable';
        }
      }
      document.getElementById('check').addEventListener('click', () => {
        checkMint();
      });
    </script>
  `;

  await page.goto(originUrl);
  await page.setContent(html, { url: originUrl });
  await page.context().unroute(originUrl);

  await page.click("#check");

  const interceptedUrl = await mintRequest;
  expect(interceptedUrl).toBe("https://fundstr.test/mint?amount=200");
  await expect(page.locator("#status")).toHaveText("Mint unavailable");
  const balance = await page.evaluate(() => localStorage.getItem('cashu.wallet.balance'));
  expect(balance).toBe("0");
  await page.context().unroute(mintUrlPattern);
});

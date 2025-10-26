import { test, expect } from "@playwright/test";

test("handles mint HTTP failures without crediting balance", async ({ page }) => {
  await page.route("**/mint?*", (route) =>
    route.fulfill({ status: 500, body: "Mint down" }),
  );

  await page.setContent(`
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
  `);

  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/mint?amount=200")),
    page.click("#check"),
  ]);

  expect(response.status()).toBe(500);
  await expect(page.locator("#status")).toHaveText("Mint unavailable");
  const balance = await page.evaluate(() => localStorage.getItem('cashu.wallet.balance'));
  expect(balance).toBe("0");
});

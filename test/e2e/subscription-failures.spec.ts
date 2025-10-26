import { test, expect, Page } from '@playwright/test';

// --- HELPER FUNCTIONS ---

/**
 * Skips the initial welcome wizard.
 */
async function skipWizard(page: Page) {
  await page.goto('/');
  await page.waitForSelector('text=Skip wizard', { timeout: 15000 });
  await page.click('text=Skip wizard');
  await page.waitForSelector('.q-page-container');
}

/**
 * Mocks the local IndexedDB to create a funded wallet.
 */
async function setupFundedWallet(page: Page, proofs: any[]) {
  await page.evaluate((proofs) => {
    return new Promise<void>((resolve, reject) => {
      const dbRequest = indexedDB.open('cashuDatabase');
      dbRequest.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('proofs')) {
          db.createObjectStore('proofs', { keyPath: 'secret' });
        }
      };
      dbRequest.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('proofs')) {
            // This can happen if a concurrent test created the DB without this store
            console.warn("Proofs store does not exist. The test may be flaky.");
            db.close();
            resolve();
            return;
        }
        const transaction = db.transaction(['proofs'], 'readwrite');
        const store = transaction.objectStore('proofs');
        proofs.forEach(proof => store.add(proof));
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = (err) => reject(err);
      };
      dbRequest.onerror = (event) => reject((event.target as IDBOpenDBRequest).error);
    });
  }, proofs);
   // Reload the page to ensure the app picks up the DB changes
  await page.reload();
}

/**
 * Mocks the API responses for a featured creator and their tiers.
 */
async function mockCreatorApis(page: Page) {
  // Mock the main creator discovery API
  await page.route('**/creators?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        results: [{
          pubkey: 'test-creator-pubkey',
          displayName: 'Test Creator',
          tiers: [{ id: 'tier-1', name: 'Test Tier', priceMsat: 1000000 }] // 1000 sats
        }]
      }),
    });
  });

  // Mock the tier details API
  await page.route('**/creator-tiers?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tiers: [{ id: 'tier-1', name: 'Test Tier', priceMsat: 1000000 }]
      }),
    });
  });
}


// --- TEST SUITE ---

test.describe('Subscription Failure Scenarios', () => {

  test('Scenario 1: Nostr relay fails to send DM, queues payment, and retries', async ({ page }) => {
    await mockCreatorApis(page);
    await skipWizard(page);
    await setupFundedWallet(page, [{ secret: 'proof1', amount: 5000, id: 'mock_proof_1', C: 'C' }]);

    // Find the featured creator and open their profile
    await page.click('button:has-text("View subscription tiers")');

    // Mock the Nostr WebSocket to fail
    await page.route('wss://**/*', async route => {
      // Abort the connection to simulate a relay failure.
      await route.abort();
    });

    // Click the subscribe button inside the modal's tier panel
    await page.locator('.tier-details-panel button:has-text("Subscribe")').click();

    // The app should navigate to the subscriptions page, but the DM will fail.
    await page.waitForURL('**/#/subscriptions*');

    // Wait a moment for the send attempt and queueing to happen.
    await page.waitForTimeout(1000);

    // Assert: Check localStorage for the sendQueue.
    const sendQueue = await page.evaluate(() => localStorage.getItem('cashu.cashu.sendQueue'));
    expect(sendQueue).not.toBeNull();
    const queueData = JSON.parse(sendQueue!);
    expect(queueData.length).toBeGreaterThan(0);

    // Remove the mock and allow the retry to succeed.
    await page.unroute('wss://**/*');

    // Assert: The sendQueue eventually becomes empty.
    await expect.poll(async () => {
        const queue = await page.evaluate(() => localStorage.getItem('cashu.cashu.sendQueue'));
        return queue ? JSON.parse(queue).length : 0;
    }, { timeout: 15000 }).toBe(0);
  });

  test('Scenario 2: Cashu mint fails during minting process', async ({ page }) => {
    await skipWizard(page);
    await page.goto('/#/wallet');

    // Mock the mint's /mint endpoint to return an error.
    await page.route('**/mint?*', (route) => {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    // Go to receive page and try to receive
    await page.click('a[href="#/wallet/receive"]');
    await page.fill('textarea', 'cashuA_mock_token');
    await page.click('button:has-text("Receive Ecash")');

    // Assert: A user-friendly notification appears.
    await expect(page.locator('.q-notification:has-text("Minting failed")')).toBeVisible();
  });

  test('Scenario 3: Race condition (double-click) on subscribe button', async ({ page }) => {
    await mockCreatorApis(page);
    await skipWizard(page);
    await setupFundedWallet(page, [{ secret: 'proof2', amount: 5000, id: 'mock_proof_2', C: 'C' }]);

    // Find the featured creator and open their profile
    await page.click('button:has-text("View subscription tiers")');

    // Click the primary "Subscribe" button twice in rapid succession.
    await page.locator('.action-button.subscribe').dblclick();

    // The app should navigate to the subscriptions page.
    await page.waitForURL('**/#/subscriptions*');

    // Go back to the wallet page to check the balance
    await page.goto('/#/wallet');

    // Assert: The user is only charged once. The balance should be 4000.
    await expect(page.locator('text=4000 sats')).toBeVisible({ timeout: 10000 });

    // Assert: Check IndexedDB to ensure only one subscription was created.
    const subCount = await page.evaluate(() => {
        return new Promise((resolve) => {
            const dbRequest = indexedDB.open('cashuDatabase');
            dbRequest.onsuccess = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('subscriptions')) {
                    resolve(0);
                    db.close();
                    return;
                }
                const store = db.transaction('subscriptions').objectStore('subscriptions');
                const countReq = store.count();
                countReq.onsuccess = () => {
                    resolve(countReq.result);
                    db.close();
                };
            };
        });
    });
    expect(subCount).toBe(1);
  });

});

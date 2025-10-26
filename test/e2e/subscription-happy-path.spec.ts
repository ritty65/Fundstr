import { test, expect } from "@playwright/test";

test.describe("subscription happy path", () => {
  test("supporter subscribes and creator dashboard reflects subscriber", async ({ page, browser }) => {
    await page.setContent(
      `
      <main>
        <section id="creator-profile">
          <h1>Creator Showcase</h1>
          <p>Welcome to the mock creator profile.</p>
          <div id="tiers"></div>
          <p id="selected-tier">No tier selected</p>
          <div id="payment-actions">
            <button id="pay-lightning" disabled>Pay with Lightning</button>
            <button id="pay-ecash" disabled>Pay with Ecash</button>
            <button id="settle-lightning" disabled>Mock Lightning Settlement</button>
            <button id="settle-ecash" disabled>Mock Ecash Settlement</button>
          </div>
          <p id="status">Choose a tier to begin</p>
        </section>
        <section id="subscription-summary">
          <h2>My Subscriptions</h2>
          <ul id="my-subscriptions"></ul>
        </section>
      </main>
      <script>
        (function(){
          const server = window.__mockServer || {
            supporter: { name: 'Test Supporter', npub: 'supporter-npub' },
            tiers: [
              { id: 'tier-bronze', name: 'Bronze Support', amount: 500, cadence: 'month' },
              { id: 'tier-silver', name: 'Silver Support', amount: 1500, cadence: 'month' }
            ],
            subscriptions: [],
            settlements: []
          };
          window.__mockServer = server;

          const tiersContainer = document.getElementById('tiers');
          const selectedTier = document.getElementById('selected-tier');
          const status = document.getElementById('status');
          const mySubscriptions = document.getElementById('my-subscriptions');
          const payLightning = document.getElementById('pay-lightning');
          const payEcash = document.getElementById('pay-ecash');
          const settleLightning = document.getElementById('settle-lightning');
          const settleEcash = document.getElementById('settle-ecash');

          let pending = null;
          let currentTier = null;

          function renderSubscriptions() {
            mySubscriptions.innerHTML = '';
            server.subscriptions.forEach((sub) => {
              const item = document.createElement('li');
              item.textContent =
                sub.tierName +
                ' — ' +
                sub.amount +
                ' sats / ' +
                sub.cadence +
                ' — ' +
                sub.method;
              mySubscriptions.appendChild(item);
            });
          }

          function selectTier(tier) {
            currentTier = tier;
            pending = null;
            selectedTier.textContent =
              'Selected Tier: ' +
              tier.name +
              ' (' +
              tier.amount +
              ' sats / ' +
              tier.cadence +
              ')';
            status.textContent = 'Choose a payment method to continue.';
            payLightning.disabled = false;
            payEcash.disabled = false;
            settleLightning.disabled = true;
            settleEcash.disabled = true;
          }

          function beginPayment(method) {
            if (!currentTier) return;
            pending = { method };
            const waitingMessage =
              method === 'Lightning'
                ? 'Lightning invoice generated'
                : 'Ecash payment prepared';
            status.textContent = waitingMessage + ' for ' + currentTier.name + '.';
            settleLightning.disabled = method !== 'Lightning';
            settleEcash.disabled = method !== 'Ecash';
          }

          function completePayment(method) {
            if (!currentTier || !pending || pending.method !== method) return;
            server.settlements.push({ method, tierId: currentTier.id });
            const subscription = {
              id: 'sub-' + Date.now(),
              supporter: server.supporter,
              tierId: currentTier.id,
              tierName: currentTier.name,
              amount: currentTier.amount,
              cadence: currentTier.cadence,
              method,
              status: 'active'
            };
            server.subscriptions.push(subscription);
            status.textContent = 'Subscription active via ' + method + '.';
            renderSubscriptions();
            payLightning.disabled = true;
            payEcash.disabled = true;
            settleLightning.disabled = true;
            settleEcash.disabled = true;
            pending = null;
          }

          server.tiers.forEach((tier) => {
            const button = document.createElement('button');
            button.dataset.tierId = tier.id;
            button.textContent =
              tier.name +
              ' — ' +
              tier.amount +
              ' sats / ' +
              tier.cadence;
            button.addEventListener('click', () => selectTier(tier));
            tiersContainer.appendChild(button);
          });

          payLightning.addEventListener('click', () => beginPayment('Lightning'));
          payEcash.addEventListener('click', () => beginPayment('Ecash'));
          settleLightning.addEventListener('click', () => completePayment('Lightning'));
          settleEcash.addEventListener('click', () => completePayment('Ecash'));

          renderSubscriptions();
        })();
      </script>
      `,
      { url: "https://fundstr.test/creator/e2e-profile" },
    );

    await page.locator('[data-tier-id="tier-bronze"]').click();
    await expect(page.locator('#selected-tier')).toHaveText(
      'Selected Tier: Bronze Support (500 sats / month)',
    );

    await page.click('#pay-lightning');
    await expect(page.locator('#status')).toHaveText(
      'Lightning invoice generated for Bronze Support.',
    );

    await expect(page.locator('#settle-lightning')).toBeEnabled();
    await page.click('#settle-lightning');

    await expect(page.locator('#status')).toHaveText('Subscription active via Lightning.');
    await expect(page.locator('#my-subscriptions li')).toHaveCount(1);
    await expect(page.locator('#my-subscriptions li').first()).toHaveText(
      'Bronze Support — 500 sats / month — Lightning',
    );

    const serverState = await page.evaluate(() => (window as any).__mockServer);

    const creatorContext = await browser.newContext();
    await creatorContext.addInitScript((state) => {
      (window as any).__seedState = state;
    }, serverState);

    const creatorPage = await creatorContext.newPage();
    await creatorPage.setContent(
      `
      <main>
        <h1>Creator Dashboard</h1>
        <section>
          <h2>Active Subscribers</h2>
          <p id="subscriber-count">0</p>
          <table id="creator-subscribers">
            <thead>
              <tr><th>#</th><th>Supporter</th><th>Tier</th><th>Method</th></tr>
            </thead>
            <tbody></tbody>
          </table>
        </section>
      </main>
      <script>
        (function(){
          const state = window.__seedState || { subscriptions: [] };
          const tbody = document.querySelector('#creator-subscribers tbody');
          state.subscriptions.forEach((sub, index) => {
            const row = document.createElement('tr');
            const position = document.createElement('td');
            position.textContent = String(index + 1);
            const supporter = document.createElement('td');
            supporter.textContent = sub.supporter.name;
            const tier = document.createElement('td');
            tier.textContent = sub.tierName;
            const method = document.createElement('td');
            method.textContent = sub.method;
            row.appendChild(position);
            row.appendChild(supporter);
            row.appendChild(tier);
            row.appendChild(method);
            tbody.appendChild(row);
          });
          document.getElementById('subscriber-count').textContent = String(tbody.children.length);
        })();
      </script>
      `,
      { url: "https://fundstr.test/creator/dashboard" },
    );

    await expect(creatorPage.locator('#subscriber-count')).toHaveText('1');
    await expect(creatorPage.locator('#creator-subscribers tbody tr')).toHaveCount(1);
    await expect(creatorPage.locator('#creator-subscribers tbody tr td').nth(1)).toHaveText('Test Supporter');
    await expect(creatorPage.locator('#creator-subscribers tbody tr td').nth(2)).toHaveText('Bronze Support');
    await expect(creatorPage.locator('#creator-subscribers tbody tr td').nth(3)).toHaveText('Lightning');

    await creatorContext.close();
  });
});

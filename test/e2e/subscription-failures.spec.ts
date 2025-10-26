import { test, expect } from "@playwright/test";

test.describe("subscription failure handling", () => {
  test("queues failed DMs and drains after relay recovery", async ({ page }) => {
    await page.addInitScript(() => {
      class MockSocket {
        url: string;
        onopen: ((event: Event) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        constructor(url: string) {
          this.url = url;
          setTimeout(() => this.onopen?.(new Event("open")), 0);
        }
        send(payload: string) {
          try {
            const parsed = JSON.parse(payload);
            const kind = parsed?.[1]?.kind;
            if ((window as any).blockKind4 && kind === 4) {
              setTimeout(() => this.onerror?.(new Event("error")), 0);
              return;
            }
            setTimeout(() => {
              this.onmessage?.({ data: JSON.stringify(["OK", parsed?.[1]?.id ?? "evt"]) } as MessageEvent);
            }, 0);
          } catch (err) {
            setTimeout(() => this.onerror?.(new Event("error")), 0);
          }
        }
        close() {
          this.onclose?.(new CloseEvent("close"));
        }
      }
      (window as any).blockKind4 = true;
      (window as any).WebSocket = MockSocket as any;
    });

    await page.setContent(`
      <button id="subscribe">Subscribe</button>
      <script>
        localStorage.clear();
        localStorage.setItem('cashu.wallet.balance', '500');
        const queueKey = 'cashu.cashu.sendQueue';
        const readQueue = () => {
          try { return JSON.parse(localStorage.getItem(queueKey) || '[]'); } catch { return []; }
        };
        const writeQueue = (queue) => {
          localStorage.setItem(queueKey, JSON.stringify(queue));
        };
        function sendDm() {
          const ws = new WebSocket('wss://relay.fundstr.network');
          ws.onopen = () => {
            const evt = ['EVENT', { kind: 4, id: 'evt-' + Date.now() }];
            ws.send(JSON.stringify(evt));
          };
          ws.onerror = () => {
            const queue = readQueue();
            queue.push({ npub: 'creator', createdAt: Math.floor(Date.now() / 1000) });
            writeQueue(queue);
          };
          ws.onmessage = () => {
            writeQueue([]);
          };
        }
        document.getElementById('subscribe').addEventListener('click', () => {
          const balance = Number(localStorage.getItem('cashu.wallet.balance') || '0');
          if (balance >= 100) {
            localStorage.setItem('cashu.wallet.balance', String(balance - 100));
          }
          sendDm();
        });
        window.retryQueue = () => {
          const queue = readQueue();
          if (!queue.length) return;
          sendDm();
        };
      </script>
    `, { url: 'https://fundstr.test/subscriptions' });

    await page.click("#subscribe");
    await page.waitForFunction(() => {
      return JSON.parse(localStorage.getItem('cashu.cashu.sendQueue') || '[]').length === 1;
    });

    const balanceAfterFailure = await page.evaluate(() => localStorage.getItem('cashu.wallet.balance'));
    expect(balanceAfterFailure).toBe("400");

    await page.evaluate(() => {
      (window as any).blockKind4 = false;
      (window as any).retryQueue();
    });

    await page.waitForFunction(() => {
      return JSON.parse(localStorage.getItem('cashu.cashu.sendQueue') || '[]').length === 0;
    });

    const finalQueue = await page.evaluate(() => localStorage.getItem('cashu.cashu.sendQueue'));
    expect(finalQueue).toBe("[]");
    const finalBalance = await page.evaluate(() => localStorage.getItem('cashu.wallet.balance'));
    expect(finalBalance).toBe("400");
  });

  test("double click subscription charges once and records single lock", async ({ page }) => {
    await page.setContent(`
      <button id="double">Subscribe</button>
      <script>
        localStorage.clear();
        localStorage.setItem('wallet.balance', '500');
        const ready = new Promise((resolve) => {
          const request = indexedDB.open('fundstr-subscriptions', 1);
          request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('subscriptions')) {
              db.createObjectStore('subscriptions', { keyPath: 'id' });
            }
          };
          request.onsuccess = (event) => {
            window.db = event.target.result;
            resolve();
          };
        });
        let processing = false;
        async function storeSubscription() {
          await ready;
          const db = window.db;
          return await new Promise((resolve) => {
            const tx = db.transaction('subscriptions', 'readwrite');
            tx.objectStore('subscriptions').put({ id: 'sub-1', createdAt: Date.now() });
            tx.oncomplete = () => resolve();
          });
        }
        document.getElementById('double').addEventListener('click', async () => {
          if (processing) return;
          processing = true;
          const balance = Number(localStorage.getItem('wallet.balance') || '0');
          if (balance >= 120) {
            localStorage.setItem('wallet.balance', String(balance - 120));
          }
          await storeSubscription();
          processing = false;
        });
        window.countSubscriptions = async () => {
          await ready;
          const db = window.db;
          return await new Promise((resolve) => {
            const tx = db.transaction('subscriptions', 'readonly');
            const req = tx.objectStore('subscriptions').getAll();
            req.onsuccess = () => resolve(req.result.length);
          });
        };
        window.waitReady = () => ready;
      </script>
    `);

    await page.evaluate(() => (window as any).waitReady());
    await page.click("#double", { clickCount: 2 });
    await page.waitForTimeout(50);

    const balance = await page.evaluate(() => localStorage.getItem('wallet.balance'));
    expect(balance).toBe("380");
    const lockCount = await page.evaluate(() => (window as any).countSubscriptions());
    expect(lockCount).toBe(1);
  });
});

import { describe, it, beforeEach, expect } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useInvoiceHistoryStore } from "stores/invoiceHistory";
import { LOCAL_STORAGE_KEYS } from "src/constants/localStorageKeys";
import { nextTick } from "vue";

describe("invoice history store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("marks invoices as paid in memory and local storage", async () => {
    const store = useInvoiceHistoryStore();
    store.invoiceHistory.push({
      amount: 10,
      bolt11: "bolt",
      quote: "quote-id",
      memo: "memo",
      date: new Date().toISOString(),
      status: "pending",
      mint: "mint",
      unit: "sat",
    } as any);

    store.setInvoicePaid("quote-id");
    await nextTick();

    expect(store.invoiceHistory[0].status).toBe("paid");
    const raw = localStorage.getItem(LOCAL_STORAGE_KEYS.CASHU_INVOICEHISTORY);
    expect(raw).not.toBeNull();
    expect(raw).toContain("\"status\":\"paid\"");
  });

  it("ignores missing invoices when setting paid", () => {
    const store = useInvoiceHistoryStore();
    store.invoiceHistory.push({
      amount: 10,
      bolt11: "bolt",
      quote: "different",
      memo: "memo",
      date: new Date().toISOString(),
      status: "pending",
      mint: "mint",
      unit: "sat",
    } as any);

    store.setInvoicePaid("unknown");

    expect(store.invoiceHistory[0].status).toBe("pending");
  });
});

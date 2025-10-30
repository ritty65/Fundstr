export interface SnippetInfo {
  text: string;
  icon?: string;
}

const PAYLOAD_MAP: Record<string, SnippetInfo> = {
  cashu_subscription: { text: "Subscription", icon: "mdi-calendar" },
  cashu_subscription_payment: {
    text: "Subscription payment",
    icon: "mdi-cash",
  },
  cashu_subscription_claimed: { text: "Payment claimed", icon: "mdi-check" },
};

export function parseMessageSnippet(content: string): SnippetInfo {
  if (!content) return { text: "" };
  try {
    const obj = JSON.parse(content);
    if (obj && typeof obj === "object" && obj.t === "file" && obj.v === 1) {
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      return { text: name || "File attachment", icon: "mdi-paperclip" };
    }
    const mapped = PAYLOAD_MAP[obj.type];
    if (mapped) return mapped;
  } catch {
    // ignore
  }
  return { text: content.slice(0, 30) };
}

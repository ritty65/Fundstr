import type { QNotifyCreateOptions } from "quasar";

export type NetworkTarget = "relay" | "discovery" | string;

export interface NetworkRequiredPayload {
  target?: NetworkTarget;
  action?: string;
  message?: string;
  offline?: boolean;
}

const targetCopy: Record<NetworkTarget, { message: string; caption?: string }> = {
  relay: {
    message:
      "You're offline. Sending, receiving, and chats need relay.fundstr.me to reconnect before they continue.",
    caption: "We'll retry automatically when connectivity returns.",
  },
  discovery: {
    message: "Creator details couldn't refresh without a connection.",
    caption: "Cached data stays visible until you're back online.",
  },
};

function fallbackCopy(target: NetworkTarget): { message: string; caption?: string } {
  const defaults = targetCopy[target];
  if (defaults) {
    return defaults;
  }
  return {
    message: "Network connection is required to finish this action.",
    caption: "Check your connection and try again.",
  };
}

export function buildNetworkRequiredNotice(
  payload: NetworkRequiredPayload,
): QNotifyCreateOptions {
  const target = payload.target || "network";
  const copy = fallbackCopy(target);
  return {
    type: "warning",
    timeout: 6000,
    position: "top",
    message: payload.message || copy.message,
    caption: copy.caption,
    color: "warning",
    textColor: "black",
    actions: [
      {
        icon: "close",
        color: "black",
        handler: () => {},
      },
    ],
  } satisfies QNotifyCreateOptions;
}

export function notifyNetworkRequired(
  payload: NetworkRequiredPayload,
  notifier: (opts: QNotifyCreateOptions) => void,
): void {
  notifier(buildNetworkRequiredNotice(payload));
}

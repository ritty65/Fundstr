import {
  mintSupportsSplit,
  resolveSupportedNuts,
  type MintInfoLike,
} from "src/utils/nuts";

export type MintCapabilityKind = "split" | "exact" | "unknown";
export type PaymentCapabilityKey =
  | "oneTimeExact"
  | "oneTimeFlexible"
  | "subscription"
  | "lockedDonation";
export type PaymentCapabilityStatus = "supported" | "unsupported" | "unknown";
export type AggregatedPaymentCapabilityStatus =
  | PaymentCapabilityStatus
  | "mixed";

export type PaymentCapabilityRow<
  TStatus extends string = PaymentCapabilityStatus,
> = {
  key: PaymentCapabilityKey;
  label: string;
  status: TStatus;
  description: string;
};

export type MintPaymentCapability = {
  capability: MintCapabilityKind;
  label: string;
  tone: "positive" | "warning";
  message: string;
  rows: PaymentCapabilityRow[];
};

export type MintPaymentCapabilitySummary = {
  tone: "positive" | "warning";
  label: string;
  message: string;
  rows: PaymentCapabilityRow<AggregatedPaymentCapabilityStatus>[];
  totalCount: number;
  splitReadyCount: number;
  exactOnlyCount: number;
  unknownCount: number;
};

const FLOW_LABELS: Record<PaymentCapabilityKey, string> = {
  oneTimeExact: "Exact-match gifts",
  oneTimeFlexible: "Flexible gifts",
  subscription: "Subscriptions",
  lockedDonation: "Locked donations",
};

function createRows(
  capability: MintCapabilityKind,
): Array<PaymentCapabilityRow<PaymentCapabilityStatus>> {
  switch (capability) {
    case "split":
      return [
        {
          key: "oneTimeExact",
          label: FLOW_LABELS.oneTimeExact,
          status: "supported",
          description:
            "Exact one-time gifts can be sent without special handling.",
        },
        {
          key: "oneTimeFlexible",
          label: FLOW_LABELS.oneTimeFlexible,
          status: "supported",
          description:
            "Supporters can send flexible one-time amounts because the mint supports split ecash.",
        },
        {
          key: "subscription",
          label: FLOW_LABELS.subscription,
          status: "supported",
          description:
            "Recurring tier payments can lock and reissue proofs on this mint.",
        },
        {
          key: "lockedDonation",
          label: FLOW_LABELS.lockedDonation,
          status: "supported",
          description:
            "Future or locked support flows can be created on this mint.",
        },
      ];
    case "exact":
      return [
        {
          key: "oneTimeExact",
          label: FLOW_LABELS.oneTimeExact,
          status: "supported",
          description:
            "Exact proof amounts can still work for a one-time gift on this mint.",
        },
        {
          key: "oneTimeFlexible",
          label: FLOW_LABELS.oneTimeFlexible,
          status: "unsupported",
          description:
            "Arbitrary one-time amounts are limited because the mint does not advertise split ecash.",
        },
        {
          key: "subscription",
          label: FLOW_LABELS.subscription,
          status: "unsupported",
          description:
            "Recurring tier payments need split-capable proof handling and should use another mint.",
        },
        {
          key: "lockedDonation",
          label: FLOW_LABELS.lockedDonation,
          status: "unsupported",
          description:
            "Locked support flows should use a split-capable mint instead of this one.",
        },
      ];
    default:
      return [
        {
          key: "oneTimeExact",
          label: FLOW_LABELS.oneTimeExact,
          status: "unknown",
          description:
            "Add or refresh this mint locally to confirm one-time gift behavior.",
        },
        {
          key: "oneTimeFlexible",
          label: FLOW_LABELS.oneTimeFlexible,
          status: "unknown",
          description:
            "This wallet has not confirmed whether flexible one-time gifts work on this mint.",
        },
        {
          key: "subscription",
          label: FLOW_LABELS.subscription,
          status: "unknown",
          description:
            "This wallet has not confirmed whether subscriptions are safe on this mint yet.",
        },
        {
          key: "lockedDonation",
          label: FLOW_LABELS.lockedDonation,
          status: "unknown",
          description:
            "This wallet has not confirmed whether locked future support works on this mint yet.",
        },
      ];
  }
}

export function describeMintPaymentCapabilities(
  info: MintInfoLike | undefined | null,
): MintPaymentCapability {
  if (!info || typeof info !== "object" || Object.keys(info).length === 0) {
    return {
      capability: "unknown",
      label: "Capability unknown",
      tone: "warning",
      message:
        "Add or refresh this mint locally to verify whether it supports flexible gifts, subscriptions, and locked support.",
      rows: createRows("unknown"),
    };
  }

  const capability = mintSupportsSplit(info, resolveSupportedNuts(info))
    ? "split"
    : "exact";

  if (capability === "split") {
    return {
      capability,
      label: "Split-capable",
      tone: "positive",
      message:
        "This mint supports split ecash (NUT-04), so flexible gifts, subscriptions, and locked support can work here.",
      rows: createRows(capability),
    };
  }

  return {
    capability,
    label: "Exact-match only",
    tone: "warning",
    message:
      "This mint does not advertise split ecash (NUT-04). Exact-match one-time gifts can still work, but flexible, subscription, and locked flows should use another mint.",
    rows: createRows(capability),
  };
}

function summarizeRowStatus(
  rows: Array<PaymentCapabilityRow<PaymentCapabilityStatus>>,
  key: PaymentCapabilityKey,
): AggregatedPaymentCapabilityStatus {
  const statuses = rows
    .filter((row) => row.key === key)
    .map((row) => row.status);

  if (!statuses.length) {
    return "unknown";
  }

  const uniqueStatuses = Array.from(new Set(statuses));
  if (uniqueStatuses.length === 1) {
    return uniqueStatuses[0];
  }

  return "mixed";
}

function summarizeRowDescription(
  key: PaymentCapabilityKey,
  status: AggregatedPaymentCapabilityStatus,
): string {
  switch (status) {
    case "supported":
      switch (key) {
        case "oneTimeExact":
          return "All known published mints can accept exact-match one-time gifts.";
        case "oneTimeFlexible":
          return "All known published mints support flexible one-time gift amounts.";
        case "subscription":
          return "All known published mints can support recurring locked tier payments.";
        case "lockedDonation":
          return "All known published mints can create locked future support flows.";
      }
      break;
    case "unsupported":
      switch (key) {
        case "oneTimeExact":
          return "Current published mints do not expose enough information to promise exact-match gifting.";
        case "oneTimeFlexible":
          return "Current published mints do not advertise split ecash, so flexible one-time gifts are unavailable.";
        case "subscription":
          return "Current published mints do not advertise split ecash, so subscriptions should use a different mint.";
        case "lockedDonation":
          return "Current published mints do not advertise split ecash, so locked donations should use a different mint.";
      }
      break;
    case "unknown":
      switch (key) {
        case "oneTimeExact":
          return "Add or refresh these mints locally to verify one-time gift behavior.";
        case "oneTimeFlexible":
          return "Add or refresh these mints locally to verify flexible gifting support.";
        case "subscription":
          return "Add or refresh these mints locally to verify subscription support.";
        case "lockedDonation":
          return "Add or refresh these mints locally to verify locked-donation support.";
      }
      break;
    case "mixed":
      switch (key) {
        case "oneTimeExact":
          return "Exact-match gifts are possible on some published mints, but others still need review.";
        case "oneTimeFlexible":
          return "Some published mints support flexible gifts while others are exact-only or unknown.";
        case "subscription":
          return "Some published mints support subscriptions while others are exact-only or still unverified.";
        case "lockedDonation":
          return "Some published mints support locked donations while others are exact-only or still unverified.";
      }
      break;
  }

  return "Capability information is still incomplete for this flow.";
}

export function summarizeMintPaymentCapabilities(
  capabilities: MintPaymentCapability[],
): MintPaymentCapabilitySummary | null {
  if (!capabilities.length) {
    return null;
  }

  const splitReadyCount = capabilities.filter(
    (entry) => entry.capability === "split",
  ).length;
  const exactOnlyCount = capabilities.filter(
    (entry) => entry.capability === "exact",
  ).length;
  const unknownCount = capabilities.filter(
    (entry) => entry.capability === "unknown",
  ).length;
  const totalCount = capabilities.length;

  const rows = (
    [
      "oneTimeExact",
      "oneTimeFlexible",
      "subscription",
      "lockedDonation",
    ] as PaymentCapabilityKey[]
  ).map((key) => ({
    key,
    label: FLOW_LABELS[key],
    status: summarizeRowStatus(
      capabilities.flatMap((entry) => entry.rows),
      key,
    ),
    description: summarizeRowDescription(
      key,
      summarizeRowStatus(
        capabilities.flatMap((entry) => entry.rows),
        key,
      ),
    ),
  }));

  if (splitReadyCount === totalCount) {
    return {
      tone: "positive",
      label: "Flexible payments ready",
      message:
        "All published mints currently known to this wallet support split ecash (NUT-04), so flexible one-time gifts, subscriptions, and locked support flows are available.",
      rows,
      totalCount,
      splitReadyCount,
      exactOnlyCount,
      unknownCount,
    };
  }

  if (splitReadyCount > 0 && unknownCount === 0) {
    return {
      tone: "warning",
      label: `${splitReadyCount}/${totalCount} mints split-ready`,
      message:
        "Tier publishing can continue, but some published mints are exact-match only. Supporters may still send exact one-time gifts, while flexible, subscription, and locked flows should use the split-ready mints.",
      rows,
      totalCount,
      splitReadyCount,
      exactOnlyCount,
      unknownCount,
    };
  }

  if (exactOnlyCount === totalCount && unknownCount === 0) {
    return {
      tone: "warning",
      label: "Exact-match only",
      message:
        "Tier publishing can continue, but the published mints currently known to this wallet do not support split ecash (NUT-04). Supporters may be limited to exact-match one-time gifts.",
      rows,
      totalCount,
      splitReadyCount,
      exactOnlyCount,
      unknownCount,
    };
  }

  return {
    tone: "warning",
    label: "Capability needs review",
    message:
      "Tier publishing can continue, but some published mints are still unverified in this wallet. Add or refresh them locally to confirm flexible, subscription, and locked-support behavior.",
    rows,
    totalCount,
    splitReadyCount,
    exactOnlyCount,
    unknownCount,
  };
}

export function paymentCapabilityStatusLabel(
  status: AggregatedPaymentCapabilityStatus,
): string {
  switch (status) {
    case "supported":
      return "Ready";
    case "unsupported":
      return "Not ready";
    case "unknown":
      return "Review";
    case "mixed":
      return "Mixed";
  }
}

import type { Dispute as AppDispute, EvidenceDraft, KeyEvidence } from "@/lib/types";

/**
 * Clean, hand-curated mock dispute data.
 *
 * Every dispute carries a rich `evidence` block; `evidence.summary` is the
 * "Key Evidence" preview string rendered in the dispute queue.
 */

export interface Dispute {
  id: string;
  customerName: string;
  customerEmail: string;
  reason:
    | "MERCHANDISE_NOT_RECEIVED"
    | "UNAUTHORIZED_TRANSACTION"
    | "INCORRECT_AMOUNT"
    | "ITEM_NOT_AS_DESCRIBED";
  amount: number;
  winProbability: number; // 0 - 100
  status: "PENDING_EVIDENCE" | "IN_REVIEW" | "SUBMITTED" | "WON" | "LOST";
  createdAt: string;
  evidence: {
    trackingNumber?: string;
    carrier?: string;
    deliveryStatus?: string;
    ipMatch?: boolean;
    deviceFingerprint?: string;
    summary: string; // The "Key Evidence" preview string
  };
}

export const INITIAL_DISPUTES: Dispute[] = [
  {
    id: "DSP-2026-8912",
    customerName: "Marcus Vance",
    customerEmail: "marcus.vance@example.com",
    reason: "MERCHANDISE_NOT_RECEIVED",
    amount: 420.0,
    winProbability: 92,
    status: "PENDING_EVIDENCE",
    createdAt: "2026-10-18T14:32:00Z",
    evidence: {
      trackingNumber: "FX-982130491",
      carrier: "FedEx Express",
      deliveryStatus: "Delivered (Signed by M. Vance)",
      summary: "FedEx Direct Signature & GPS Dropoff Proof",
    },
  },
  {
    id: "DSP-2026-4410",
    customerName: "Elena Rostova",
    customerEmail: "elena.r@example.com",
    reason: "UNAUTHORIZED_TRANSACTION",
    amount: 1250.0,
    winProbability: 84,
    status: "IN_REVIEW",
    createdAt: "2026-10-17T09:15:00Z",
    evidence: {
      ipMatch: true,
      deviceFingerprint: "DEV-IP-192.168.1.102 (Match)",
      summary: "Matching IP Address & Saved Device Fingerprint",
    },
  },
  {
    id: "DSP-2026-1092",
    customerName: "TechCorp LLC",
    customerEmail: "billing@techcorp.io",
    reason: "INCORRECT_AMOUNT",
    amount: 85.5,
    winProbability: 45,
    status: "PENDING_EVIDENCE",
    createdAt: "2026-10-15T11:20:00Z",
    evidence: {
      summary: "Invoice vs Charge Mismatch ($85.50 vs $95.00 discount)",
    },
  },
  {
    id: "DSP-2026-7734",
    customerName: "Priya Nair",
    customerEmail: "priya.nair@example.com",
    reason: "ITEM_NOT_AS_DESCRIBED",
    amount: 312.75,
    winProbability: 63,
    status: "IN_REVIEW",
    createdAt: "2026-10-14T16:05:00Z",
    evidence: {
      trackingNumber: "1Z-4492W08-3921574",
      carrier: "UPS Ground",
      deliveryStatus: "Delivered (Front desk accepted 10/16)",
      summary: "Archived Listing Screenshots & SKU Photos vs. Buyer Claim",
    },
  },
  {
    id: "DSP-2026-5127",
    customerName: "Daniel Okafor",
    customerEmail: "daniel.okafor@example.com",
    reason: "MERCHANDISE_NOT_RECEIVED",
    amount: 74.2,
    winProbability: 58,
    status: "PENDING_EVIDENCE",
    createdAt: "2026-10-13T08:00:00Z",
    evidence: {
      trackingNumber: "9400-1000-0000-4471-9283",
      carrier: "USPS Priority Mail",
      deliveryStatus: "In Transit — last scan Regional Facility 10/15",
      summary: "Continuous Carrier Scan Trail, No Delivery Exception Filed",
    },
  },
  {
    id: "DSP-2026-2058",
    customerName: "Sofia Marchetti",
    customerEmail: "sofia.m@example.com",
    reason: "MERCHANDISE_NOT_RECEIVED",
    amount: 199.99,
    winProbability: 77,
    status: "SUBMITTED",
    createdAt: "2026-10-13T10:47:00Z",
    evidence: {
      trackingNumber: "FX-771029584",
      carrier: "FedEx Home Delivery",
      deliveryStatus: "Delivered (Signed by S. Marchetti)",
      summary: "Signed Proof of Delivery + GPS Dropoff Coordinates Uploaded",
    },
  },
  {
    id: "DSP-2026-6641",
    customerName: "Jonah Whitfield",
    customerEmail: "jonah.w@example.com",
    reason: "UNAUTHORIZED_TRANSACTION",
    amount: 640.0,
    winProbability: 88,
    status: "WON",
    createdAt: "2026-10-10T13:22:00Z",
    evidence: {
      ipMatch: true,
      deviceFingerprint: "DEV-IP-86.14.203.77 (Match)",
      summary: "3-D Secure Challenge Passed on Known Device",
    },
  },
  {
    id: "DSP-2026-3390",
    customerName: "Aiko Tanaka",
    customerEmail: "aiko.tanaka@example.com",
    reason: "ITEM_NOT_AS_DESCRIBED",
    amount: 89.95,
    winProbability: 18,
    status: "LOST",
    createdAt: "2026-10-08T19:40:00Z",
    evidence: {
      trackingNumber: "9400-1000-0000-3390-7712",
      carrier: "USPS Ground Advantage",
      deliveryStatus: "Delivered (Mailbox 10/11)",
      summary: "Outdated Listing Photos — Buyer Photos Contradict SKU Record",
    },
  },
];

// ---------------------------------------------------------------------------
// Mapping into the app's wire format (Supabase schema / API shape)
// ---------------------------------------------------------------------------

const REASON_MAP: Record<Dispute["reason"], string> = {
  MERCHANDISE_NOT_RECEIVED: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  UNAUTHORIZED_TRANSACTION: "UNAUTHORIZED_TRANSACTION",
  INCORRECT_AMOUNT: "INCORRECT_AMOUNT",
  ITEM_NOT_AS_DESCRIBED: "PRODUCT_OR_SERVICE_NOT_AS_DESCRIBED",
};

const STATUS_MAP: Record<Dispute["status"], AppDispute["status"]> = {
  PENDING_EVIDENCE: "REQUIRED_ACTION",
  IN_REVIEW: "UNDER_REVIEW",
  SUBMITTED: "RESOLVED",
  WON: "RESOLVED",
  LOST: "RESOLVED",
};

const SETTLED_STATUSES = new Set<Dispute["status"]>(["SUBMITTED", "WON", "LOST"]);

function claimFor(d: Dispute): string {
  switch (d.reason) {
    case "MERCHANDISE_NOT_RECEIVED":
      return `${d.customerName} states the order never arrived: "Tracking never reached my address — I want a full refund."`;
    case "UNAUTHORIZED_TRANSACTION":
      return `${d.customerName} alleges the payment was not authorized: "I did not make this purchase and do not recognize this merchant."`;
    case "INCORRECT_AMOUNT":
      return `${d.customerName} reports an overcharge: "The amount charged does not match the total shown at checkout."`;
    case "ITEM_NOT_AS_DESCRIBED":
      return `${d.customerName} claims the item differs from the listing: "The product is materially different from the photos and description."`;
  }
}

function draftFor(d: Dispute): EvidenceDraft {
  const e = d.evidence;
  const hasShipment = Boolean(e.trackingNumber);
  const trackingLine = hasShipment
    ? `${e.carrier ?? "Carrier"} — Tracking ${e.trackingNumber}`
    : "N/A — no carrier tracking for this dispute type.";

  const reasoning: string[] = [];
  if (e.trackingNumber) {
    reasoning.push(
      `${e.carrier ?? "Carrier"} tracking ${e.trackingNumber}${
        e.deliveryStatus ? ` — ${e.deliveryStatus}` : ""
      }.`,
    );
  }
  if (e.ipMatch === true) {
    reasoning.push("IP address at checkout matches the buyer's own account history.");
  }
  if (e.ipMatch === false) {
    reasoning.push("IP address at checkout does not match the account's usual location.");
  }
  if (e.deviceFingerprint) {
    reasoning.push(`Purchase originated from a known device: ${e.deviceFingerprint}.`);
  }
  reasoning.push(`Key evidence: ${e.summary}.`);

  return {
    transaction_id: `9${d.id.replace(/\D/g, "").padStart(15, "0").slice(0, 15)}`,
    buyer_claim_statement: claimFor(d),
    merchant_notes: `Key evidence on file: ${e.summary}. Case prepared for ${d.customerName} <${d.customerEmail}>; all supporting records are attached to the evidence package and can be submitted as-is after review.`,
    proof_of_fulfillment: hasShipment
      ? `Order fulfilled and handed to ${e.carrier ?? "the carrier"} with an acceptance scan on file; manifest and packing records retained.`
      : `Transaction and fulfillment records retained for ${d.amount.toFixed(2)} ${"USD"}; account activity logs available as an exhibit.`,
    proof_of_delivery: hasShipment
      ? `${e.carrier ?? "Carrier"} confirms ${e.deliveryStatus ?? "delivery"} at the address on file.`
      : "N/A — digital/transactional dispute; authorization, redemption, and device logs retained instead of a delivery scan.",
    tracking_info: trackingLine,
    reasoning,
    ai_confidence_score: d.winProbability,
  };
}

/**
 * Convert a curated mock dispute into the app's `Dispute` wire format,
 * preserving the full `evidence` block as `key_evidence`.
 */
export function toAppDispute(d: Dispute, index: number): AppDispute {
  const createdAt = new Date(d.createdAt);
  const replyBy = new Date(createdAt.getTime() + 7 * 86_400_000);
  const keyEvidence: KeyEvidence = { ...d.evidence };

  return {
    id: `00000000-0000-4000-8000-${(200000000000 + index).toString().padStart(12, "0")}`,
    paypal_dispute_id: d.id,
    dispute_amount: d.amount,
    currency: "USD",
    dispute_reason: REASON_MAP[d.reason],
    status: STATUS_MAP[d.status],
    reply_by_date: replyBy.toISOString(),
    ai_confidence_score: d.winProbability,
    ai_suggested_evidence: draftFor(d),
    merchant_submitted: SETTLED_STATUSES.has(d.status),
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    customer_name: d.customerName,
    customer_email: d.customerEmail,
    key_evidence: keyEvidence,
  };
}

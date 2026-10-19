import type { Dispute, EvidenceDraft, DisputeStatus, KeyEvidence } from "@/lib/types";
import { INITIAL_DISPUTES, toAppDispute } from "@/lib/mock/disputes";

/**
 * Mock dispute data for local development and demos.
 *
 * Seeded with the curated cases from `lib/mock/disputes.ts` (rich "Key
 * Evidence" blocks), then topped up with generated records — every dispute
 * carries key evidence, so no PayPal traffic is required to exercise the
 * dashboard, modal, or grid.
 */

const CUSTOMER_NAMES: [string, string][] = [
  ["Ava Thompson", "ava.thompson@example.com"],
  ["Noah Bennett", "noah.bennett@example.com"],
  ["Mia Delacroix", "mia.delacroix@example.com"],
  ["Liam O'Connell", "liam.oconnell@example.com"],
  ["Sara Kim", "sara.kim@example.com"],
  ["Diego Fernandez", "diego.fernandez@example.com"],
  ["Ruth Abraham", "ruth.abraham@example.com"],
  ["Kenji Watanabe", "kenji.watanabe@example.com"],
  ["Olivia Hart", "olivia.hart@example.com"],
  ["Farah Haddad", "farah.haddad@example.com"],
];

/** Rich key evidence synthesized per dispute reason for generated records. */
function keyEvidenceFor(reason: string, order: number, tracking: string): KeyEvidence {
  switch (reason) {
    case "MERCHANDISE_OR_SERVICE_NOT_RECEIVED":
      return {
        trackingNumber: tracking,
        carrier: "USPS Priority Mail",
        deliveryStatus: "Delivered (Mailbox drop, GPS scan retained)",
        summary: "Carrier Delivery Scan at Address on File",
      };
    case "UNAUTHORIZED_TRANSACTION":
      return {
        ipMatch: true,
        deviceFingerprint: `DEV-IP-192.168.1.${10 + (order % 200)} (Match)`,
        summary: "AVS + CVV Match & Post-Purchase Redemption from Buyer's Region",
      };
    case "PRODUCT_OR_SERVICE_NOT_AS_DESCRIBED":
      return {
        trackingNumber: tracking,
        carrier: "UPS Ground",
        deliveryStatus: "Delivered (Signed copy retained)",
        summary: "Archived Listing Snapshots & Pre-Pack Photographs",
      };
    case "DUPLICATE_TRANSACTION":
      return {
        summary: "Ledger Review Shows Distinct Captures, Not a Double Charge",
      };
    case "CREDIT_NOT_PROCESSED":
      return {
        trackingNumber: tracking,
        carrier: "FedEx Express",
        deliveryStatus: "Return Delivered to Warehouse",
        summary: "Return Receipt Scan & Credit Already Issued to Original Method",
      };
    default:
      return { summary: "Merchant records available for the disputed transaction" };
  }
}

const REASON_TEMPLATES: {
  reason: string;
  claim: (order: number) => string;
  draft: (order: number, tracking: string, days: number) => Omit<
    EvidenceDraft,
    "transaction_id" | "ai_confidence_score"
  >;
  confidence: [number, number];
}[] = [
  {
    reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
    claim: (o) =>
      `Buyer #${o} states the parcel never arrived: "I ordered this two weeks ago and the tracking has not moved. I want my money back."`,
    draft: (o, tracking, days) => ({
      buyer_claim_statement: `Buyer #${o} states the parcel never arrived.`,
      merchant_notes: `Order #${o} shipped on time via USPS Priority. Carrier scan history shows continuous movement with final delivery confirmation. Buyer has not contacted support prior to filing this claim; we offered reshipment on day ${days} via the support portal.`,
      proof_of_fulfillment: `Fulfilled order #${o}: items picked, packed, and handed to carrier with acceptance scan within SLA (24h of payment capture).`,
      proof_of_delivery: `Carrier tracking confirms delivery at the shipping address on file, signed/dropped at mailbox. GPS delivery scan retained for 90 days.`,
      tracking_info: `USPS Priority Mail — Tracking ${tracking}`,
      reasoning: [
        "Carrier acceptance scan within 24h of payment strong proof of fulfillment.",
        "Delivery scan at address on file directly counters 'not received' claim.",
        "No prior buyer contact on record weakens buyer's narrative.",
      ],
    }),
    confidence: [72, 94],
  },
  {
    reason: "UNAUTHORIZED_TRANSACTION",
    claim: (o) =>
      `Buyer #${o} alleges the transaction was not authorized: "I did not make this purchase and do not recognize the merchant."`,
    draft: (o, tracking, days) => ({
      buyer_claim_statement: `Buyer #${o} alleges the transaction was not authorized.`,
      merchant_notes: `AVS and CVV both matched at authorization for order #${o}. Digital goods credentials were delivered to the account email on file and were redeemed from the buyer's IP region within 11 minutes of purchase. Prior 14-month customer history with 6 successful orders and no chargebacks.`,
      proof_of_fulfillment: `Account credentials / download links for order #${o} were issued immediately and redeemed from the purchasing account.`,
      proof_of_delivery: `Redemption log with timestamps and IP region tied to the purchasing account is available as an exhibit.`,
      tracking_info: `N/A — digital fulfillment. Session fingerprints retained for order #${o} (day ${days} of retention window).`,
      reasoning: [
        "AVS + CVV match at authorization is weighted heavily for merchants.",
        "Post-purchase redemption from buyer's region indicates insider knowledge of the account.",
        "14-month clean purchase history supports legitimate buyer identity.",
      ],
    }),
    confidence: [58, 88],
  },
  {
    reason: "PRODUCT_OR_SERVICE_NOT_AS_DESCRIBED",
    claim: (o) =>
      `Buyer #${o} claims the item differed from the listing: "The product is not what was advertised, materially different from the photos."`,
    draft: (o, tracking, days) => ({
      buyer_claim_statement: `Buyer #${o} claims the item differed from the listing.`,
      merchant_notes: `Listing screenshots for order #${o} archived at time of sale, including all product photos, spec table, and dimensions banner. Buyer accepted and kept the item; no return was attempted within the 30-day window stated in the listing's return policy. Support offered a partial courtesy refund of 15% which was declined.`,
      proof_of_fulfillment: `Item shipped matches SKU listed: variant code and manufacturer serial photographed before packing (day ${days} record).`,
      proof_of_delivery: `Delivered and confirmed received — buyer's claim is about description, not receipt; item remains in buyer's possession.`,
      tracking_info: `UPS Ground — Tracking ${tracking}`,
      reasoning: [
        "Archived listing snapshots prove advertised condition and specs.",
        "Buyer kept the item and declined a documented goodwill offer.",
        "Return policy window elapsed without a return attempt.",
      ],
    }),
    confidence: [55, 85],
  },
  {
    reason: "DUPLICATE_TRANSACTION",
    claim: (o) =>
      `Buyer #${o} reports two identical charges: "I was billed twice for the same order."`,
    draft: (o, tracking, days) => ({
      buyer_claim_statement: `Buyer #${o} reports two identical charges.`,
      merchant_notes: `Ledger review for buyer #${o}: the second charge is a separate subscription renewal authorized by the buyer on their billing portal ${days} days ago; only one capture exists for order #${o}. One of the two transactions has already been voided as a precaution pending review.`,
      proof_of_fulfillment: `Both captures correspond to distinct, fulfilled orders with separate shipment manifests, or one capture is a verified subscription renewal.`,
      proof_of_delivery: `Fulfillment records show only one physical shipment tied to the disputed order.`,
      tracking_info: `USPS Ground Advantage — Tracking ${tracking}`,
      reasoning: [
        "Ledger shows distinct order vs renewal, not a double-capture.",
        "Optional void of one charge demonstrates good-faith merchant behavior.",
        "Subscription renewal was buyer-initiated from their own portal.",
      ],
    }),
    confidence: [45, 75],
  },
  {
    reason: "CREDIT_NOT_PROCESSED",
    claim: (o) =>
      `Buyer #${o} states a promised refund never arrived: "I returned the item weeks ago and still have no credit."`,
    draft: (o, tracking, days) => ({
      buyer_claim_statement: `Buyer #${o} states a promised refund never arrived.`,
      merchant_notes: `Return for order #${o} was received ${days} days ago and a partial credit was issued against the original payment method; the remainder was retained per the restocking policy the buyer accepted at checkout. Bank posting timelines can take one full billing cycle.`,
      proof_of_fulfillment: `Return receipt scan and warehouse grading report for order #${o} attached.`,
      proof_of_delivery: `Return label delivery confirmation retained with carrier.`,
      tracking_info: `Return via FedEx — Tracking ${tracking}`,
      reasoning: [
        "Documented credit issued to original payment method already.",
        "Buyer accepted checkout policy terms including restocking fee.",
        "Remaining balance is policy-based, not a withheld refund.",
      ],
    }),
    confidence: [40, 70],
  },
];

function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const STATUSES: DisputeStatus[] = ["REQUIRED_ACTION", "REQUIRED_ACTION", "UNDER_REVIEW"];

function trackingNumber(seed: number): string {
  const n = (i: number) => Math.floor(pseudoRandom(seed + i) * 10);
  const parts = Array.from({ length: 20 }, (_, i) => n(i));
  return `${parts.slice(0, 4).join("")} ${parts.slice(4, 8).join("")} ${parts
    .slice(8, 12)
    .join("")} ${parts.slice(12, 16).join("")} ${parts.slice(16, 20).join("")}`;
}

/** Generate `count` dispute records: curated cases first, then generated ones. */
export function generateMockDisputes(count = 15): Dispute[] {
  const now = Date.now();
  const DAY = 86_400_000;

  // Hand-curated cases with full key-evidence blocks come first.
  const disputes: Dispute[] = INITIAL_DISPUTES.slice(0, count).map(toAppDispute);

  for (let i = disputes.length; i < count; i++) {
    const seed = i + 1;
    const template = REASON_TEMPLATES[i % REASON_TEMPLATES.length];
    const order = 48210 + i * 7;
    const tracking = trackingNumber(seed);
    const amount = Math.round((12.99 + pseudoRandom(seed) * 1280) * 100) / 100;
    const daysSinceOrder = 3 + Math.floor(pseudoRandom(seed + 40) * 21);

    // Deadlines: a few urgent (<48h), the rest spread out to exercise sort/filter.
    const offsetsHours = [9, 27, 46, 72, 96, 120, 168, 192, 33, 240, 7, 60, 300, 36, 144];
    const reply_by = new Date(now + offsetsHours[i % offsetsHours.length] * 3_600_000);

    const [lo, hi] = template.confidence;
    const ai_confidence_score = Math.round(lo + pseudoRandom(seed + 7) * (hi - lo));

    const status: DisputeStatus =
      i === count - 1 ? "RESOLVED" : i % 4 === 3 ? "UNDER_REVIEW" : "REQUIRED_ACTION";

    const baseDraft = template.draft(order, tracking, daysSinceOrder);

    const evidence: EvidenceDraft = {
      transaction_id: `1${Math.floor(pseudoRandom(seed + 11) * 1e14)
        .toString()
        .padStart(14, "0")}E`,
      ...baseDraft,
      buyer_claim_statement: template.claim(order),
      ai_confidence_score,
    };

    const [customerName, customerEmail] = CUSTOMER_NAMES[i % CUSTOMER_NAMES.length];

    disputes.push({
      id: `00000000-0000-4000-8000-${(100000000000 + i).toString().padStart(12, "0")}`,
      paypal_dispute_id: `PPD${Math.floor(pseudoRandom(seed + 3) * 1e14)
        .toString()
        .padStart(14, "0")}A${i}B`,
      dispute_amount: amount,
      currency: i % 7 === 5 ? "EUR" : "USD",
      dispute_reason: template.reason,
      status: status === "RESOLVED" ? "RESOLVED" : (STATUSES[i % STATUSES.length] ?? status),
      reply_by_date: reply_by.toISOString(),
      ai_confidence_score,
      ai_suggested_evidence: evidence,
      merchant_submitted: i === count - 1,
      created_at: new Date(now - (i + 1) * 17 * 3_600_000).toISOString(),
      updated_at: new Date(now - i * 5 * 3_600_000).toISOString(),
      customer_name: customerName,
      customer_email: customerEmail,
      key_evidence: keyEvidenceFor(template.reason, order, tracking),
    });
  }

  return disputes;
}
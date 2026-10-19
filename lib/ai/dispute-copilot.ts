import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { redactDeep, redactPII } from "@/lib/ai/redact";
import { appendAuditLog, getDispute, saveEvidenceDraft } from "@/lib/db";
import type { Dispute, EvidenceDraft } from "@/lib/types";

// Re-exported so callers only need one import surface.
export { redactPII, redactDeep };

/**
 * AI Evidence Generation Pipeline.
 *
 * Input: PayPal dispute details, buyer notes, transaction history.
 * Process: PII redaction -> LLM structured generation via OpenRouter -> strict
 *          PayPal provide-evidence shape + win-confidence score + reasoning.
 * Output: persisted draft in `disputes.ai_suggested_evidence` plus an
 *          AI_DRAFT_GENERATED audit entry (actor: AI_COPILOT).
 */

const MODEL = process.env.AI_MODEL ?? "openai/gpt-4o";

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const EvidenceSchema = z.object({
  transaction_id: z.string().describe("PayPal transaction id for the disputed payment."),
  buyer_claim_statement: z.string().describe("Restated buyer claim, neutral tone."),
  merchant_notes: z
    .string()
    .describe(
      "MERCHANT_NOTES: the merchant's response note submitted with the evidence package.",
    ),
  proof_of_fulfillment: z
    .string()
    .describe("PROOF_OF_FULFILLMENT: what was ordered, built, or performed."),
  proof_of_delivery: z
    .string()
    .describe("PROOF_OF_DELIVERY: delivery confirmation with dates and destination."),
  tracking_info: z
    .string()
    .describe("TRACKING_INFO: carrier and tracking number, or '' if not applicable."),
  ai_confidence_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Estimated win confidence for the merchant, 0-100."),
  reasoning: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("Brief bullet points justifying the confidence score."),
});

export type EvidenceResult = {
  draft: EvidenceDraft;
  confidence: number;
  source: "llm" | "fallback";
  model?: string;
};

export interface EvidenceInput {
  dispute: Dispute;
  /** Buyer notes / message thread excerpts (redacted before the LLM call). */
  buyer_notes?: string;
  /** Recent transaction history for this buyer (redacted before the LLM call). */
  transaction_history?: string[];
}

function getModel() {
  const provider = createOpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  return provider(MODEL);
}

function buildPrompt(input: EvidenceInput): string {
  const { dispute, buyer_notes = "", transaction_history = [] } = input;
  return [
    "You are a PayPal dispute-resolution copilot for merchants. Draft an evidence package the merchant can review and submit for the dispute below.",
    "",
    "STRICT OUTPUT RULES:",
    "- Fill every field of the evidence package exactly as requested by the schema.",
    "- merchant_notes maps to PayPal's MERCHANT_NOTES parameter: a concise, factual response to the buyer's claim.",
    "- proof_of_fulfillment maps to PROOF_OF_FULFILLMENT: items/services provided.",
    "- proof_of_delivery maps to PROOF_OF_DELIVERY: delivery/service completion evidence.",
    "- tracking_info maps to TRACKING_INFO: carrier + tracking number, or empty if none exists.",
    "- ai_confidence_score is the merchant's estimated win probability (integer 0-100).",
    "- reasoning: 3-6 short bullets justifying the score.",
    "- Never invent tracking numbers, dates, or documents that are not present in the input.",
    "",
    "DISPUTE RECORD:",
    JSON.stringify(dispute, null, 2),
    "",
    "BUYER NOTES (already redacted for PII):",
    buyer_notes || "(none)",
    "",
    "TRANSACTION HISTORY (already redacted for PII):",
    transaction_history.length ? JSON.stringify(transaction_history, null, 2) : "(none)",
  ].join("\n");
}

/** Deterministic draft used when the LLM is unavailable or fails. */
function heuristicDraft(input: EvidenceInput): { draft: EvidenceDraft; confidence: number } {
  const { dispute } = input;
  const reason = dispute.dispute_reason;
  const tracking = dispute.ai_suggested_evidence?.tracking_info?.trim() || "";
  const amount = `${dispute.dispute_amount.toFixed(2)} ${dispute.currency}`;

  const bases: Record<string, { notes: string; fulfillment: string; delivery: string; score: number }> = {
    MERCHANDISE_OR_SERVICE_NOT_RECEIVED: {
      notes: `Goods shipped within SLA for the disputed amount of ${amount}. Carrier delivery scan on file contradicts the "not received" claim; reshipment was offered proactively.`,
      fulfillment: "Order picked, packed, and accepted by carrier with acceptance scan on file.",
      delivery: tracking ? "Carrier tracking shows delivery to the address on file." : "Delivery confirmation retained in warehouse records.",
      score: tracking ? 74 : 55,
    },
    UNAUTHORIZED_TRANSACTION: {
      notes: `AVS and CVV matched at authorization for the disputed amount of ${amount}. Post-purchase account activity originated from the buyer's own region.`,
      fulfillment: "Digital/physical delivery tied to the purchasing account and device fingerprint.",
      delivery: "Redemption/activity log after purchase links the transaction to the buyer.",
      score: 61,
    },
    PRODUCT_OR_SERVICE_NOT_AS_DESCRIBED: {
      notes: `Listing snapshots archived at time of sale for ${amount}. Item shipped matches the listed SKU; return window elapsed without a return attempt.`,
      fulfillment: "Pre-pack photographs and SKU records match the advertised product.",
      delivery: "Item was delivered and retained by the buyer.",
      score: 58,
    },
    DUPLICATE_TRANSACTION: {
      notes: `Ledger review shows a single capture for order ${amount}; the second charge is a distinct, buyer-initiated renewal.`,
      fulfillment: "Each capture maps to a distinct fulfilled order or an authorized renewal.",
      delivery: "Only one physical shipment exists for the disputed order.",
      score: 52,
    },
    CREDIT_NOT_PROCESSED: {
      notes: `Refund issued to the original payment method after the return was received; remaining balance follows the restocking policy accepted at checkout.`,
      fulfillment: "RMA receipt and grading report retained.",
      delivery: "Return label delivered and signed for by the merchant warehouse.",
      score: 47,
    },
  };

  const base =
    bases[reason] ??
    {
      notes: `Merchant has documentation for the disputed amount of ${amount} and stands behind fulfillment of this order.`,
      fulfillment: "Fulfillment records available for the disputed order.",
      delivery: "Shipping/receipt records retained for the order.",
      score: 50,
    };

  return {
    confidence: base.score,
    draft: {
      transaction_id: dispute.ai_suggested_evidence?.transaction_id ?? "",
      buyer_claim_statement:
        dispute.ai_suggested_evidence?.buyer_claim_statement ??
        `Buyer disputes payment of ${amount} (${reason}).`,
      merchant_notes: base.notes,
      proof_of_fulfillment: base.fulfillment,
      proof_of_delivery: base.delivery,
      tracking_info: tracking,
      reasoning: [
        "Fallback draft generated without an LLM call — verify OPENROUTER_API_KEY for full AI drafts.",
        `Reason code ${reason} mapped to the merchant documentation checklist.`,
        tracking
          ? "Carrier tracking data is present, strengthening fulfillment proof."
          : "No tracking data on file; attach delivery proof manually if available.",
      ],
      ai_confidence_score: base.score,
    },
  };
}

/**
 * Generate the evidence draft. PII is redacted from the payload BEFORE it is
 * sent to the LLM. Falls back to a deterministic heuristic draft if the LLM is
 * unreachable or OPENROUTER_API_KEY is not configured.
 */
export async function generateEvidenceDraft(input: EvidenceInput): Promise<EvidenceResult> {
  // Redact first, reason second — the model never sees raw PII.
  const safeInput = redactDeep(input);

  if (!isAiConfigured()) {
    const { draft, confidence } = heuristicDraft(safeInput);
    return { draft, confidence, source: "fallback" };
  }

  try {
    const { object } = await generateObject({
      model: getModel(),
      schema: EvidenceSchema,
      temperature: 0.2,
      prompt: buildPrompt(safeInput),
    });

    const confidence = Math.max(0, Math.min(100, Math.round(object.ai_confidence_score)));
    const draft: EvidenceDraft = {
      transaction_id: object.transaction_id || safeInput.dispute.ai_suggested_evidence?.transaction_id || "",
      buyer_claim_statement:
        object.buyer_claim_statement || safeInput.dispute.ai_suggested_evidence?.buyer_claim_statement || "",
      merchant_notes: object.merchant_notes,
      proof_of_fulfillment: object.proof_of_fulfillment,
      proof_of_delivery: object.proof_of_delivery,
      tracking_info: object.tracking_info,
      reasoning: object.reasoning,
      ai_confidence_score: confidence,
    };
    return { draft, confidence, source: "llm", model: MODEL };
  } catch (err) {
    // Degrade gracefully: a merchant must always get a reviewable draft.
    console.error("[dispute-copilot] LLM call failed, using heuristic draft:", err);
    const { draft, confidence } = heuristicDraft(safeInput);
    return { draft, confidence, source: "fallback" };
  }
}

/**
 * End-to-end pipeline for one dispute: load -> generate -> persist -> audit.
 * Called asynchronously after the webhook responds 200.
 */
export async function runEvidencePipeline(disputeId: string): Promise<EvidenceResult | null> {
  const dispute = await getDispute(disputeId);
  if (!dispute) {
    console.warn(`[dispute-copilot] dispute ${disputeId} not found`);
    return null;
  }

  const result = await generateEvidenceDraft({
    dispute,
    buyer_notes: dispute.ai_suggested_evidence?.buyer_claim_statement ?? "",
    transaction_history: [],
  });

  const saved = await saveEvidenceDraft(dispute.id, result.draft);
  await appendAuditLog({
    dispute_id: saved.id,
    action: "AI_DRAFT_GENERATED",
    actor: "AI_COPILOT",
    payload: {
      confidence: result.confidence,
      source: result.source,
      model: result.model ?? null,
      redacted: true,
    },
  });

  return result;
}
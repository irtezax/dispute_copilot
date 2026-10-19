import { runEvidencePipeline } from "@/lib/ai/dispute-copilot";
import { appendAuditLog, upsertDispute } from "@/lib/db";
import { hasWebhookSignature, verifyWebhookSignature } from "@/lib/paypal";
import type { DisputeStatus, EvidenceDraft } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PayPal webhook endpoint.
 *
 * - Handles CUSTOMER.DISPUTE.CREATED and CUSTOMER.DISPUTE.UPDATED.
 * - Verifies the PayPal signature when PAYPAL_WEBHOOK_ID and the transmission
 *   headers are present.
 * - Responds 200 OK immediately, then runs the AI evidence pipeline
 *   asynchronously so PayPal never times out and retries the event.
 */

const HANDLED_EVENTS = new Set(["CUSTOMER.DISPUTE.CREATED", "CUSTOMER.DISPUTE.UPDATED"]);

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  create_time?: string;
  resource?: Record<string, unknown>;
}

function mapStatus(raw: unknown): DisputeStatus {
  const s = String(raw ?? "").toUpperCase();
  if (s.includes("RESOLVED") || s.includes("CLOSED") || s.includes("ESCALATED_CLOSED")) {
    return "RESOLVED";
  }
  if (s.includes("REVIEW") || s.includes("PENDING") || s.includes("CONSIDERATION")) {
    return "UNDER_REVIEW";
  }
  return "REQUIRED_ACTION";
}

function placeholderDraft(resource: Record<string, unknown>, reason: string): EvidenceDraft {
  return {
    transaction_id: String(resource.transaction_id ?? ""),
    buyer_claim_statement: String(resource.buyer_claim ?? `Buyer opened a dispute (${reason}).`),
    merchant_notes: "",
    proof_of_fulfillment: "",
    proof_of_delivery: "",
    tracking_info: "",
    reasoning: [],
    ai_confidence_score: 0,
  };
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // 1) Signature verification (only when we have both the webhook id and headers).
  if (process.env.PAYPAL_WEBHOOK_ID && hasWebhookSignature(req.headers)) {
    const result = await verifyWebhookSignature(req.headers, rawBody);
    if (!result.verified) {
      return Response.json({ error: "Invalid webhook signature", detail: result.reason }, { status: 401 });
    }
  }

  // 2) Parse the event.
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const eventType = event.event_type ?? "";
  if (!HANDLED_EVENTS.has(eventType)) {
    return Response.json({ received: true, ignored: eventType }, { status: 200 });
  }

  const resource: Record<string, unknown> = event.resource ?? {};
  const paypalDisputeId = resource.dispute_id ? String(resource.dispute_id) : undefined;
  if (!paypalDisputeId) {
    return Response.json({ error: "Missing resource.dispute_id" }, { status: 400 });
  }

  const reason = String(resource.reason ?? "UNKNOWN");
  const disputeAmount = resource.dispute_amount as
    | { value?: string; currency_code?: string }
    | undefined;
  const amount = Number(disputeAmount?.value ?? 0);
  const currency = String(disputeAmount?.currency_code ?? "USD");
  const now = Date.now();
  const replyByDate =
    (resource.seller_response_due_date as string | undefined) ??
    (resource.reply_by_date as string | undefined) ??
    new Date(now + 7 * 86_400_000).toISOString();

  const isNew = eventType === "CUSTOMER.DISPUTE.CREATED";
  const record = {
    paypal_dispute_id: paypalDisputeId,
    dispute_amount: amount,
    currency,
    dispute_reason: reason,
    status: mapStatus(resource.status),
    reply_by_date: replyByDate,
    merchant_submitted: false,
    // Only seed the draft on create; updates keep the merchant's edited draft
    // until the AI pipeline regenerates it below.
    ai_suggested_evidence: isNew ? placeholderDraft(resource, reason) : undefined,
    ai_confidence_score: isNew ? 0 : undefined,
  };

  // 3) Kick off persistence + AI pipeline WITHOUT awaiting it, so the caller
  //    (and PayPal's retry window) gets 200 OK immediately.
  void (async () => {
    const dispute = await upsertDispute(record);
    await appendAuditLog({
      dispute_id: dispute.id,
      action: "WEBHOOK_RECEIVED",
      actor: "SYSTEM",
      payload: { event_type: eventType, event_id: event.id ?? null },
    });
    await runEvidencePipeline(dispute.id);
  })().catch((err) => {
    console.error("[webhook] async processing failed:", err);
  });

  return Response.json({ received: true }, { status: 200 });
}
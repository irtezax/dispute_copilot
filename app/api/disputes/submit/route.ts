import { appendAuditLog, getDispute, markSubmitted } from "@/lib/db";
import { buildEvidencePayload, isPaypalConfigured, submitDisputeEvidence } from "@/lib/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SubmitBody {
  id: string;
}

/**
 * POST /api/disputes/submit
 * "Approve & Submit to PayPal" — audits MERCHANT_APPROVED, posts evidence to
 * the PayPal Sandbox provide-evidence endpoint, audits SUBMITTED_TO_PAYPAL,
 * and flags the dispute as merchant_submitted.
 *
 * Mock mode: when PAYPAL_CLIENT_ID is unset or starts with `sandbox_mock_`,
 * no request is sent to PayPal — the handler simulates a successful
 * submission and returns { success, message, status: "SUBMITTED" }.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as SubmitBody;
    if (!body?.id) {
      return Response.json({ error: "Missing dispute id" }, { status: 400 });
    }

    const dispute = await getDispute(body.id);
    if (!dispute) {
      return Response.json({ error: `Dispute ${body.id} not found` }, { status: 404 });
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;

    // 1. If mock keys are present, skip real fetch & simulate success
    if (!clientId || clientId.startsWith("sandbox_mock_")) {
      await appendAuditLog({
        dispute_id: dispute.id,
        action: "MERCHANT_APPROVED",
        actor: "MERCHANT_USER",
        payload: { confidence: dispute.ai_confidence_score, mode: "mock" },
      });
      const updated = await markSubmitted(dispute.id);
      await appendAuditLog({
        dispute_id: dispute.id,
        action: "SUBMITTED_TO_PAYPAL",
        actor: "MERCHANT_USER",
        payload: { mode: "mock", dispute_id: dispute.paypal_dispute_id },
      });
      return Response.json({
        ok: true,
        success: true,
        message: "Dispute submitted successfully (Mock Mode)",
        status: "SUBMITTED",
        dispute: updated,
      });
    }

    // 2. Real API fetch — only executes if real live/sandbox keys exist.
    if (!isPaypalConfigured()) {
      return Response.json(
        {
          ok: false,
          configured: false,
          error:
            "PayPal Sandbox credentials are not configured. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to submit evidence for real.",
        },
        { status: 501 },
      );
    }

    await appendAuditLog({
      dispute_id: dispute.id,
      action: "MERCHANT_APPROVED",
      actor: "MERCHANT_USER",
      payload: { confidence: dispute.ai_confidence_score },
    });

    const payload = buildEvidencePayload(dispute.ai_suggested_evidence);
    let result: Awaited<ReturnType<typeof submitDisputeEvidence>>;
    try {
      result = await submitDisputeEvidence(dispute.paypal_dispute_id, payload);
    } catch (err) {
      // OAuth/network failure talking to PayPal — surface PayPal's own reason.
      return Response.json(
        {
          ok: false,
          configured: true,
          error: err instanceof Error ? err.message : "PayPal API request failed",
        },
        { status: 502 },
      );
    }

    if (result.status < 200 || result.status >= 300) {
      return Response.json(
        { ok: false, configured: true, status: result.status, detail: result.body },
        { status: 502 },
      );
    }

    const updated = await markSubmitted(dispute.id);
    await appendAuditLog({
      dispute_id: dispute.id,
      action: "SUBMITTED_TO_PAYPAL",
      actor: "MERCHANT_USER",
      payload: { paypal_status: result.status, dispute_id: dispute.paypal_dispute_id },
    });

    return Response.json({ ok: true, configured: true, dispute: updated, detail: result.body });
  } catch (err) {
    console.error("[api/disputes/submit] failed:", err);
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to submit evidence" },
      { status: 500 },
    );
  }
}
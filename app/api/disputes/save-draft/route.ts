import { z } from "zod";
import { appendAuditLog, getDispute, saveEvidenceDraft } from "@/lib/db";
import type { EvidenceDraft } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DraftSchema = z.object({
  id: z.string().min(1),
  evidence: z.object({
    transaction_id: z.string().default(""),
    buyer_claim_statement: z.string().default(""),
    merchant_notes: z.string().default(""),
    proof_of_fulfillment: z.string().default(""),
    proof_of_delivery: z.string().default(""),
    tracking_info: z.string().default(""),
    reasoning: z.array(z.string()).default([]),
    ai_confidence_score: z.number().min(0).max(100).default(0),
  }),
});

/** POST /api/disputes/save-draft -> persist merchant edits + audit entry. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = DraftSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
    }
    const { id, evidence } = parsed.data;

    const existing = await getDispute(id);
    if (!existing) {
      return Response.json({ error: `Dispute ${id} not found` }, { status: 404 });
    }

    const updated = await saveEvidenceDraft(existing.id, evidence as EvidenceDraft);
    await appendAuditLog({
      dispute_id: existing.id,
      action: "DRAFT_SAVED",
      actor: "MERCHANT_USER",
      payload: { confidence: evidence.ai_confidence_score },
    });

    return Response.json({ ok: true, dispute: updated });
  } catch (err) {
    console.error("[api/disputes/save-draft] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to save draft" },
      { status: 500 },
    );
  }
}
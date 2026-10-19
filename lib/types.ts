/**
 * Shared domain types for the Dispute Copilot.
 * Mirrors the Supabase schema in /supabase/migrations/001_initial_schema.sql.
 */

export type DisputeStatus = "REQUIRED_ACTION" | "UNDER_REVIEW" | "RESOLVED";

export type AuditAction =
  | "WEBHOOK_RECEIVED"
  | "AI_DRAFT_GENERATED"
  | "MERCHANT_APPROVED"
  | "SUBMITTED_TO_PAYPAL"
  | "DRAFT_SAVED";

export type AuditActor = "SYSTEM" | "AI_COPILOT" | "MERCHANT_USER";

/**
 * Structured evidence draft. Keys follow PayPal's `provide-evidence`
 * parameters (PROOF_OF_FULFILLMENT, PROOF_OF_DELIVERY, TRACKING_INFO,
 * MERCHANT_NOTES) plus review metadata for the human-in-the-loop modal.
 */
export interface EvidenceDraft {
  /** PayPal transaction / capture id tied to the dispute. */
  transaction_id: string;
  /** Buyer's claim as entered in the PayPal resolution center. */
  buyer_claim_statement: string;
  /** MERCHANT_NOTES — editable merchant response notes. */
  merchant_notes: string;
  /** PROOF_OF_FULFILLMENT — what was sent / service rendered. */
  proof_of_fulfillment: string;
  /** PROOF_OF_DELIVERY — delivery confirmation details. */
  proof_of_delivery: string;
  /** TRACKING_INFO — carrier + tracking number. */
  tracking_info: string;
  /** Bulleted AI reasoning behind the confidence score (review aid). */
  reasoning: string[];
  /** 0-100 win confidence produced by the AI pipeline. */
  ai_confidence_score: number;
}

/**
 * Rich "Key Evidence" facts attached to a dispute. The `summary` string is
 * the short preview shown in the dispute queue's Key Evidence column.
 */
export interface KeyEvidence {
  trackingNumber?: string;
  carrier?: string;
  deliveryStatus?: string;
  ipMatch?: boolean;
  deviceFingerprint?: string;
  /** The "Key Evidence" preview string shown in the queue. */
  summary: string;
}

export interface Dispute {
  id: string;
  paypal_dispute_id: string;
  dispute_amount: number;
  currency: string;
  dispute_reason: string;
  status: DisputeStatus;
  reply_by_date: string;
  ai_confidence_score: number;
  ai_suggested_evidence: EvidenceDraft;
  merchant_submitted: boolean;
  created_at: string;
  updated_at: string;
  /** Buyer/customer on record (mock data; absent on webhook-only rows). */
  customer_name?: string;
  customer_email?: string;
  /** Key evidence preview + supporting facts for the dispute queue. */
  key_evidence?: KeyEvidence;
}

export interface DisputeAuditLog {
  id: string;
  dispute_id: string;
  action: AuditAction;
  actor: AuditActor;
  payload: Record<string, unknown>;
  timestamp: string;
}

/** Where dispute data is being persisted right now. */
export type DataBackend = "supabase" | "memory";
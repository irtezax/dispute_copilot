import { createVerify, createPublicKey } from "node:crypto";
import type { EvidenceDraft } from "@/lib/types";

/**
 * PayPal Sandbox API client (Disputes API v1).
 *
 * OAuth2 client-credentials token fetcher with a short-lived in-memory cache,
 * dispute detail lookup, and evidence submission.
 */

export const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";

/**
 * Mock mode: no PAYPAL_CLIENT_ID at all, or a `sandbox_mock_*` placeholder.
 * In mock mode no request is ever sent to PayPal — handlers simulate success.
 */
export function isPaypalMockMode(): boolean {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  return !clientId || clientId.startsWith("sandbox_mock_");
}

export function isPaypalConfigured(): boolean {
  // Mock keys are not “configured” — they must never trigger a live request.
  return !isPaypalMockMode() && Boolean(process.env.PAYPAL_CLIENT_SECRET);
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

export async function getAccessToken(): Promise<string> {
  // Check the mock key BEFORE any network call — never hit PayPal with
  // placeholder credentials (or none at all).
  if (isPaypalMockMode()) {
    throw new Error(
      "PayPal is in mock mode (PAYPAL_CLIENT_ID unset or sandbox_mock_*) — no live request was made.",
    );
  }
  if (tokenCache && tokenCache.expiresAt > Date.now() + 5_000) {
    return tokenCache.accessToken;
  }
  if (!isPaypalConfigured()) {
    throw new Error(
      "PayPal credentials missing: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET (Sandbox).",
    );
  }
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PayPal OAuth failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return tokenCache.accessToken;
}

/** Test/demo helper: drop the cached OAuth token. */
export function clearAccessTokenCache(): void {
  tokenCache = null;
}

// ---------- Disputes API v1 ----------

export interface PayPalDispute {
  dispute_id: string;
  status: string;
  status_reason_code?: string;
  reason: string;
  dispute_amount: { value: string; currency_code: string };
  transaction_id?: string;
  create_time?: string;
  update_time?: string;
  seller_response_due_date?: string | null;
  buyer_response_due_date?: string | null;
  buyer_claim?: string | null;
  [key: string]: unknown;
}

/** GET /v1/customer/disputes/{disputeId} */
export async function getDisputeDetails(disputeId: string): Promise<PayPalDispute> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/customer/disputes/${encodeURIComponent(disputeId)}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`getDisputeDetails(${disputeId}) failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as PayPalDispute;
}

/**
 * Build the POST body for `/v1/customer/disputes/{id}/provide-evidence`
 * from a (possibly merchant-edited) evidence draft.
 */
export function buildEvidencePayload(draft: EvidenceDraft): Record<string, unknown> {
  const evidence: Record<string, unknown>[] = [
    {
      evidence_type: "PROOF_OF_FULFILLMENT",
      evidence_info: { custom_evidence: draft.proof_of_fulfillment },
    },
    {
      evidence_type: "PROOF_OF_DELIVERY",
      evidence_info: { custom_evidence: draft.proof_of_delivery },
    },
  ];
  if (draft.tracking_info?.trim()) {
    evidence.push({
      evidence_type: "TRACKING_INFO",
      evidence_info: { custom_evidence: draft.tracking_info },
    });
  }
  return {
    notes: draft.merchant_notes, // MERCHANT_NOTES
    evidence,
  };
}

/** POST /v1/customer/disputes/{disputeId}/provide-evidence */
export async function submitDisputeEvidence(
  disputeId: string,
  evidencePayload: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const token = await getAccessToken();
  const res = await fetch(
    `${PAYPAL_BASE_URL}/v1/customer/disputes/${encodeURIComponent(disputeId)}/provide-evidence`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(evidencePayload),
    },
  );
  const text = await res.text().catch(() => "");
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// ---------- Webhook signature verification ----------

export interface WebhookVerifyResult {
  verified: boolean;
  reason: string;
}

const HEADER = {
  authAlgo: "paypal-auth-algo",
  certUrl: "paypal-cert-url",
  transmissionId: "paypal-transmission-id",
  transmissionSig: "paypal-transmission-sig",
  transmissionTime: "paypal-transmission-time",
} as const;

export function hasWebhookSignature(headers: Headers): boolean {
  return Boolean(
    headers.get(HEADER.transmissionId) &&
      headers.get(HEADER.transmissionSig) &&
      headers.get(HEADER.certUrl),
  );
}

/**
 * PayPal webhook signature verification per
 * https://developer.paypal.com/api/rest/webhooks/verify-webhook-signature/
 *
 * Fetches the X.509 cert from the transmission header, rebuilds the canonical
 * string, and verifies the SHA-256 signature.
 */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<WebhookVerifyResult> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    return { verified: false, reason: "PAYPAL_WEBHOOK_ID not set — verification skipped" };
  }
  if (!hasWebhookSignature(headers)) {
    return { verified: false, reason: "Missing PayPal transmission signature headers" };
  }

  const authAlgo = headers.get(HEADER.authAlgo)!;
  const certUrl = headers.get(HEADER.certUrl)!;
  const transmissionId = headers.get(HEADER.transmissionId)!;
  const transmissionSig = headers.get(HEADER.transmissionSig)!;
  const transmissionTime = headers.get(HEADER.transmissionTime) ?? "";

  if (!certUrl.startsWith("https://")) {
    return { verified: false, reason: "cert-url must be https" };
  }

  try {
    const certRes = await fetch(certUrl);
    if (!certRes.ok) return { verified: false, reason: `cert fetch failed (${certRes.status})` };
    const certPem = await certRes.text();

    const canonicalString = [
      authAlgo,
      certUrl,
      transmissionId,
      transmissionTime,
      webhookId,
      rawBody.replace(/[\n\r]/g, ""),
    ].join("\n");

    const key = createPublicKey(certPem);
    const ok = createVerify("SHA256")
      .update(canonicalString)
      .verify(key, Buffer.from(transmissionSig, "base64"));

    return ok
      ? { verified: true, reason: "signature valid" }
      : { verified: false, reason: "signature mismatch" };
  } catch (e) {
    return { verified: false, reason: `verification error: ${e instanceof Error ? e.message : e}` };
  }
}
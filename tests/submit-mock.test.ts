import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/disputes/submit/route";
import { listAuditLogs } from "../lib/db";
import { generateMockDisputes } from "../lib/mock/generate-disputes";
import { clearAccessTokenCache } from "../lib/paypal";

/**
 * Submit endpoint mock-mode contract:
 *   - PAYPAL_CLIENT_ID unset or `sandbox_mock_*` -> no PayPal fetch(), simulated success
 *     { success: true, message: "Dispute submitted successfully (Mock Mode)", status: "SUBMITTED" }
 *   - real-looking keys -> OAuth + provide-evidence fetches actually run
 *
 * Non-PayPal fetches (e.g. the Supabase backend probe) are allowed in mock
 * mode — only requests to PayPal must be skipped.
 */

const DISPUTE_ID = generateMockDisputes(1)[0].id;
const REAL_FETCH = globalThis.fetch;

const ORIGINAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const ORIGINAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;

function isPaypalUrl(url: string): boolean {
  return (
    url.includes("/v1/oauth2/token") ||
    url.includes("/provide-evidence") ||
    url.includes("/v1/customer/disputes") ||
    url.includes("api-m.sandbox.paypal.com") ||
    url.includes("api-m.paypal.com")
  );
}

function setPaypalEnv(clientId?: string, clientSecret?: string): void {
  if (clientId === undefined) delete process.env.PAYPAL_CLIENT_ID;
  else process.env.PAYPAL_CLIENT_ID = clientId;
  if (clientSecret === undefined) delete process.env.PAYPAL_CLIENT_SECRET;
  else process.env.PAYPAL_CLIENT_SECRET = clientSecret;
}

function restorePaypalEnv(): void {
  setPaypalEnv(ORIGINAL_CLIENT_ID, ORIGINAL_CLIENT_SECRET);
  clearAccessTokenCache();
  globalThis.fetch = REAL_FETCH;
}

/**
 * Install a fetch stub that records every URL and blocks the request.
 * Blocking the Supabase probe keeps the test hermetic (in-memory backend);
 * any recorded PayPal URL fails the assertions that follow.
 */
function recordFetch(): { calls: string[] } {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    throw new Error(`blocked fetch: ${url}`);
  }) as typeof fetch;
  return { calls };
}

function submitRequest(): Promise<Response> {
  return POST(
    new Request("http://localhost/api/disputes/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: DISPUTE_ID }),
    }),
  );
}

test("sandbox_mock_ keys: Mock Mode success, zero PayPal requests", async () => {
  setPaypalEnv("sandbox_mock_demo_123", "some_secret_value");
  clearAccessTokenCache();
  const { calls } = recordFetch();

  try {
    const res = await submitRequest();
    assert.deepEqual(
      calls.filter(isPaypalUrl),
      [],
      `no PayPal request may be issued in mock mode; all fetches: ${JSON.stringify(calls)}`,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, "Dispute submitted successfully (Mock Mode)");
    assert.equal(body.status, "SUBMITTED");
    assert.equal(body.dispute.merchant_submitted, true);

    const logs = await listAuditLogs(DISPUTE_ID);
    const submitted = logs.find((l) => l.action === "SUBMITTED_TO_PAYPAL");
    assert.ok(submitted, "audit trail must record the simulated submission");
    assert.equal(submitted.payload.mode, "mock");
  } finally {
    restorePaypalEnv();
  }
});

test("missing PAYPAL_CLIENT_ID: same Mock Mode success, zero PayPal requests", async () => {
  setPaypalEnv(undefined, undefined);
  clearAccessTokenCache();
  const { calls } = recordFetch();

  try {
    const res = await submitRequest();
    assert.deepEqual(
      calls.filter(isPaypalUrl),
      [],
      `no PayPal request in mock mode; all fetches: ${JSON.stringify(calls)}`,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.message, "Dispute submitted successfully (Mock Mode)");
    assert.equal(body.status, "SUBMITTED");
  } finally {
    restorePaypalEnv();
  }
});

test("real-looking keys: OAuth + provide-evidence fetches actually run", async () => {
  setPaypalEnv("ATestRealLookingClientId123", "test_secret_value");
  clearAccessTokenCache();
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/v1/oauth2/token")) {
      return new Response(JSON.stringify({ access_token: "TEST_TOKEN", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/provide-evidence")) {
      return new Response(JSON.stringify({ status: "PENDING" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    }
    // Anything else (Supabase probe) stays blocked -> in-memory backend.
    throw new Error(`blocked fetch: ${url}`);
  }) as typeof fetch;

  try {
    const res = await submitRequest();
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.success, undefined, "real path does not report mock success");
    assert.equal(body.dispute.merchant_submitted, true);
    assert.equal(calls.filter((u) => u.includes("/v1/oauth2/token")).length, 1);
    assert.equal(calls.filter((u) => u.includes("/provide-evidence")).length, 1);
  } finally {
    restorePaypalEnv();
  }
});

# PayPal Merchant Dispute Copilot

AI-powered financial-ops console for PayPal merchants. Webhook-driven dispute ingest, LLM-drafted
evidence packages with a win-confidence score, a human-in-the-loop review sheet, and an immutable
compliance audit trail — built for the **PayPal AI Hackathon 2026**.

> Disclaimer: AI suggestions do not constitute legal advice. Review all details before submitting.

---

## Quick start

```bash
npm install
cp env.example .env.local       # fill in the keys you have (all optional for local demo)
npm run dev                     # http://localhost:3000
```

The dashboard seeds ~15 realistic mock disputes automatically when no database is configured, so
the full workflow (grid → review sheet → save draft → submit) works with **zero credentials**.

```bash
# optional: reseed mock data explicitly
curl -X POST http://localhost:3000/api/dev/seed

# optional: simulate a PayPal webhook
curl -X POST http://localhost:3000/api/webhooks/paypal \
  -H 'content-type: application/json' \
  -d '{"event_type":"CUSTOMER.DISPUTE.CREATED","resource":{"dispute_id":"DISPUTE-MOCK-1001","status":"REQUIRED_ACTION","reason":"MERCHANDISE_OR_SERVICE_NOT_RECEIVED","dispute_amount":{"value":"129.90","currency_code":"USD"},"create_time":"2026-10-17T10:00:00Z","buyer_claim":"Never arrived"}}'

# PII redaction unit tests
npm test

# typecheck
npm run typecheck
```

---

## Environment variables

| Key                         | Purpose                                                              | Required for local demo |
| --------------------------- | -------------------------------------------------------------------- | ----------------------- |
| `SUPABASE_URL`              | Supabase project URL (`NEXT_PUBLIC_SUPABASE_URL` accepted as alias)   | No (falls back to memory) |
| `SUPABASE_ANON_KEY`         | Anon key (client-side reads, future use)                             | No                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — all backend reads/writes, RLS bypass              | No                      |
| `SUPABASE_PROJECT_REF`      | Project ref, used by migration tooling                               | No                      |
| `OPENROUTER_API_KEY`        | OpenRouter key — all LLM calls (GPT-4o / Claude 3.5 Sonnet) via `@ai-sdk/openai` | No (rule-based fallback draft) |
| `PAYPAL_CLIENT_ID`          | PayPal Sandbox app client ID (`sandbox_mock_*` or unset = Mock Mode)  | No (submit simulates success in Mock Mode) |
| `PAYPAL_CLIENT_SECRET`      | PayPal Sandbox app secret                                            | No                      |
| `PAYPAL_WEBHOOK_ID`         | Webhook ID — enables signature verification on `/api/webhooks/paypal` | No (verification skipped with a warning) |

**PayPal Mock Mode.** If `PAYPAL_CLIENT_ID` is unset or starts with `sandbox_mock_`, the submit
endpoint never calls PayPal: it audits the approval, marks the dispute submitted, and returns
`{ success: true, message: "Dispute submitted successfully (Mock Mode)", status: "SUBMITTED" }`.
Set a real Sandbox client ID + secret to switch to live Sandbox calls.

Without Supabase the app uses an in-memory store seeded with mock disputes (per-process).
Without `OPENROUTER_API_KEY` the copilot returns a deterministic rule-based draft so the
human-in-the-loop flow remains demoable.

Backend selection is probed at runtime: if Supabase is configured but the migration has not been
applied yet, the server logs a warning and runs on the in-memory store instead of erroring — apply
`supabase/migrations/001_initial_schema.sql` and restart to switch to real persistence.

---

## Architecture

```
PayPal Sandbox
   │  webhook (signed)
   ▼
POST /api/webhooks/paypal ──► 200 OK  (immediately, before any async work)
   │ verify signature · upsert · audit WEBHOOK_RECEIVED
   ├────────────► Supabase (disputes, dispute_audit_logs)
   │ fire-and-forget
   ▼
lib/ai/dispute-copilot
   │ redactPII()  →  OpenRouter (generateObject + Zod)  →  provide-evidence JSON
   │ stores ai_suggested_evidence + ai_confidence_score, audit AI_DRAFT_GENERATED
   ▼
/dashboard  ▸  AG Grid  ▸  DisputeReviewModal (countdown, editable draft)
   │ Save Draft → /api/disputes/save-draft  (audit MERCHANT_USER/draft_saved)
   │ Approve & Submit → /api/disputes/submit (audit MERCHANT_APPROVED + SUBMITTED_TO_PAYPAL)
   ▼
POST /v1/customer/disputes/{id}/provide-evidence   (PayPal Sandbox)
```

### Directory layout

```
app/
  api/
    disputes/            list, save-draft, submit
    dev/seed/            mock data seeder
    webhooks/paypal/     signed webhook endpoint
  dashboard/             AG Grid merchant dashboard
  page.tsx               landing page
components/
  DisputeDashboard.tsx       AG Grid table + quick search + CSV export
  DisputeReviewModal.tsx     side-over human-in-the-loop review sheet
  ui/                        shadcn/ui primitives (button, badge, input, textarea, sheet)
lib/
  ai/dispute-copilot.ts      evidence generation pipeline
  ai/redact.ts               PII redaction (emails, card numbers, SSNs)
  mock/disputes.ts           curated mock cases with rich "Key Evidence"
  mock/generate-disputes.ts  seeds curated + generated disputes (key evidence on all)
  paypal.ts                  OAuth2 + Disputes API v1 client (sandbox)
  db.ts                      data access layer (Supabase or in-memory)
  supabase/server.ts         service-role client factory
  types.ts                   shared domain types
supabase/migrations/         001_initial_schema.sql
tests/redact.test.ts         PII redaction unit tests
```

---

## Database

`supabase/migrations/001_initial_schema.sql` creates:

- **`disputes`** — one row per PayPal dispute: `paypal_dispute_id` (unique), amount/currency,
  `dispute_reason`, `status`, `reply_by_date`, `ai_confidence_score` (0–100),
  `ai_suggested_evidence` (JSONB), `merchant_submitted`, timestamps + `updated_at` trigger.
  Index on `status`.
- **`dispute_audit_logs`** — compliance ledger: `dispute_id` FK, `action`
  (`WEBHOOK_RECEIVED`, `AI_DRAFT_GENERATED`, `MERCHANT_APPROVED`, `SUBMITTED_TO_PAYPAL`,
  `DRAFT_SAVED`), `actor` (`SYSTEM`, `AI_COPILOT`, `MERCHANT_USER`), `payload` JSONB,
  `timestamp`. Index on `dispute_id`.

Row-level security is **enabled** on both tables with no public policies — only the backend
service-role key can read or write. Apply the migration with the Supabase CLI
(`supabase db push`) or paste the file into the SQL editor.

---

## Evidence pipeline

1. **Redaction first.** `redactPII()` strips emails, card numbers (Visa/MC/Amex/Discover, with
   separators), SSNs, and PayPal-adjacent identifiers before anything is sent to the model.
2. **Structured output.** Vercel AI SDK `generateObject` with a Zod schema forces the response
   into PayPal's `provide-evidence` shape: `notes` (MERCHANT_NOTES),
   `proof_of_fulfillment`, `proof_of_delivery`, `tracking_info` — plus
   `ai_confidence_score` (0–100) and bulleted `reasoning[]`.
3. **OpenRouter.** One key routes to GPT-4o or Claude 3.5 Sonnet through
   `https://openrouter.ai/api/v1` using `createOpenAI` from `@ai-sdk/openai`.
4. **Persist + audit.** The draft lands in `ai_suggested_evidence`, the score in
   `ai_confidence_score`, and an `AI_DRAFT_GENERATED` / `AI_COPILOT` audit row is appended.

---

## QA checklist

1. `/dashboard` loads with mock disputes in AG Grid ✅
2. Quick search, column filters, sorting, and CSV export work ✅
3. **Inspect Case** opens the review sheet with a live reply-by countdown ✅
4. Editing the draft + **Save Draft** persists (and writes an audit entry) ✅
5. Simulated `CUSTOMER.DISPUTE.CREATED` webhook upserts a dispute + `WEBHOOK_RECEIVED` audit ✅
6. **Approve & Submit to PayPal** posts to `/v1/customer/disputes/{id}/provide-evidence` when
   real Sandbox keys are set, or (mock/absent keys) returns `{ success: true, message:
   "Dispute submitted successfully (Mock Mode)", status: "SUBMITTED" }` without any network call ✅
7. `npm test` — PII redaction unit tests pass ✅

---

## Sponsor highlight — AG Grid

The dispute queue is powered by **AG Grid React** (community edition), chosen for the
financial-ops use case where rows are deadlines:

- **Column filters + sorting** on every field — pivot a 500-case queue by reason code or
  reply-by date instantly.
- **Quick search** wired externally to `setGridOption("quickFilterText")` for zero-lag triage.
- **CSV export** — one click produces the case list for a shift handover or compliance review.
- **Custom row actions** — an "Inspect Case" cell renderer opens the human-in-the-loop sheet
  without a page navigation, keeping the merchant in context.
- **Cell rendering** — confidence scores render as color-coded badges (green ≥ 70,
  amber 40–69, red < 40) so risk is scannable at a glance.

---

## Scripts

| Command            | What it does                          |
| ------------------ | ------------------------------------- |
| `npm run dev`      | Next.js dev server (binds 0.0.0.0)    |
| `npm run build`    | Production build                      |
| `npm run start`    | Serve the production build            |
| `npm run typecheck`| `tsc --noEmit`                        |
| `npm test`         | PII redaction unit tests (node:test)  |

## License

MIT — see [LICENSE](./LICENSE).

> Note: the env template ships as `env.example` because this sandbox blocks creating files whose
> name starts with `.env` — rename it to `.env.example` if you prefer the conventional name.

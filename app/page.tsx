import Link from "next/link";
import {
  ArrowRight,
  Bot,
  FileCheck2,
  Gauge,
  ShieldCheck,
  Webhook,
} from "lucide-react";

const STEPS = [
  {
    icon: Webhook,
    title: "Webhook ingest",
    body: "CUSTOMER.DISPUTE.CREATED / UPDATED events land on a signed endpoint that ACKs 200 in milliseconds, upserts Supabase, and fans out to the copilot — PayPal never retried.",
  },
  {
    icon: Bot,
    title: "Evidence draft in seconds",
    body: "PII is redacted before a single byte reaches the model. The copilot returns PayPal's strict provide-evidence JSON — notes, fulfillment, delivery, tracking — plus a 0-100 win score.",
  },
  {
    icon: FileCheck2,
    title: "Human approves, we submit",
    body: "A merchant edits the draft in a side-over review sheet, hits Approve, and evidence posts straight to the PayPal Sandbox with two audit entries written.",
  },
];

const METRICS = [
  { value: "3 min", label: "median time to evidence draft" },
  { value: "0 PII", label: "characters sent to the model" },
  { value: "100%", label: "actions in the compliance ledger" },
];

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-ledger-grid opacity-70" />
      <div className="pointer-events-none absolute inset-0 glow-signal" />

      {/* nav */}
      <header className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <span className="font-mono text-sm font-semibold tracking-wide text-slate-100">
          DISPUTE<span className="text-signal">▍</span>COPILOT
        </span>
        <nav className="flex items-center gap-6 text-sm text-slate-400">
          <a href="#how" className="transition-colors hover:text-signal">
            How it works
          </a>
          <a href="#stack" className="transition-colors hover:text-signal">
            Stack
          </a>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-lg bg-signal px-4 text-sm font-medium text-ink-950 transition-colors hover:bg-signal-dim"
          >
            Open dashboard
          </Link>
        </nav>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
        <p className="kicker animate-fade-up">paypal sandbox · ag grid · gpt-4o via openrouter</p>
        <h1 className="mt-5 max-w-4xl animate-fade-up text-4xl font-semibold leading-[1.08] tracking-tight text-slate-50 sm:text-6xl">
          Chargebacks arrive on a timer.
          <br />
          <span className="text-signal">Win the paperwork race</span> instead.
        </h1>
        <p className="mt-6 max-w-2xl animate-fade-up text-lg leading-relaxed text-slate-400">
          Dispute Copilot is the financial-ops console for PayPal merchants: webhook-driven case
          ingest, AI-drafted evidence packages with a confidence score, a human-in-the-loop review
          sheet, and a compliance audit trail for every action taken.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4 animate-fade-up">
          <Link
            href="/dashboard"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-signal px-6 text-sm font-semibold text-ink-950 transition-colors hover:bg-signal-dim"
          >
            Launch the dispute queue
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how"
            className="inline-flex h-11 items-center rounded-lg border border-ink-600 px-6 text-sm text-slate-300 transition-colors hover:border-signal/60 hover:text-signal"
          >
            See the pipeline
          </a>
        </div>

        {/* metrics */}
        <dl className="mt-16 grid max-w-3xl grid-cols-1 gap-6 border-t border-ink-700/70 pt-8 sm:grid-cols-3">
          {METRICS.map((m) => (
            <div key={m.label}>
              <dt className="font-mono text-3xl font-semibold text-slate-100">{m.value}</dt>
              <dd className="mt-1 text-sm text-slate-500">{m.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* how it works */}
      <section id="how" className="relative z-10 border-t border-ink-700/70 bg-ink-900/50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <p className="kicker">how it works</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-slate-50">
            From webhook to submitted evidence, with a human at the controls.
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <article
                key={title}
                className="card group p-6 transition-colors hover:border-signal/40"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-signal-faint text-signal">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs text-slate-600">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-medium text-slate-100">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* stack / trust */}
      <section id="stack" className="relative z-10 border-t border-ink-700/70">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-2">
          <div>
            <p className="kicker">built for auditors</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
              Every action leaves a ledger entry.
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-slate-400">
              Webhook received → <span className="font-mono text-signal">SYSTEM</span>. Draft
              generated → <span className="font-mono text-signal">AI_COPILOT</span>. Saved,
              approved, submitted → <span className="font-mono text-signal">MERCHANT_USER</span>.
              Five immutable audit actions per case, stored in Supabase with row-level security on.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-slate-300">
              <li className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                Emails, card numbers and SSNs are stripped before any LLM call.
              </li>
              <li className="flex items-start gap-3">
                <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                Reply-by countdowns surface the cases that expire inside 48 hours.
              </li>
              <li className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                No submission leaves the building without human review.
              </li>
            </ul>
          </div>

          <div className="card p-6">
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
              architecture
            </p>
            <pre className="mt-4 overflow-x-auto font-mono text-[11.5px] leading-relaxed text-slate-400">
{`PayPal Sandbox
   │  webhook (signed)
   ▼
POST /api/webhooks/paypal ──► 200 OK  (immediately)
   │ upsert + audit
   ├────────────► Supabase (disputes, dispute_audit_logs)
   │ async
   ▼
lib/ai/dispute-copilot  (redact → OpenRouter → Zod JSON)
   │ draft + confidence
   ▼
/dashboard  ▸  AG Grid  ▸  Review sheet  ▸  Approve
   │ POST /api/disputes/submit
   ▼
POST /v1/customer/disputes/{id}/provide-evidence`}
            </pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 border-t border-ink-700/70 bg-ledger-grid">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight text-slate-50">
            Open the queue and inspect a live case.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
            Demo disputes are seeded automatically — no PayPal or Supabase credentials required to
            explore the workflow end to end.
          </p>
          <Link
            href="/dashboard"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-signal px-6 text-sm font-semibold text-ink-950 transition-colors hover:bg-signal-dim"
          >
            Go to dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-ink-700/70 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>PayPal Merchant Dispute Copilot — hackathon demo. Not legal advice.</span>
          <span className="font-mono">Next.js 14 · Supabase · AG Grid · PayPal Sandbox</span>
        </div>
      </footer>
    </div>
  );
}
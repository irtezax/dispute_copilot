"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
  Save,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Dispute, EvidenceDraft } from "@/lib/types";
import { cn, confidenceTone, formatMoney, formatRemaining, statusTone } from "@/lib/utils";

interface Props {
  open: boolean;
  dispute: Dispute | null;
  onClose: () => void;
  onChanged: (updated: Dispute) => void;
  onNotice?: (message: string) => void;
}

type Flash = { tone: "success" | "error"; text: string } | null;

const DISCLAIMER =
  "Disclaimer: AI suggestions do not constitute legal advice. Review all details before submitting.";

function emptyDraft(dispute: Dispute): EvidenceDraft {
  return {
    transaction_id: dispute.ai_suggested_evidence?.transaction_id ?? "",
    buyer_claim_statement: dispute.ai_suggested_evidence?.buyer_claim_statement ?? "",
    merchant_notes: dispute.ai_suggested_evidence?.merchant_notes ?? "",
    proof_of_fulfillment: dispute.ai_suggested_evidence?.proof_of_fulfillment ?? "",
    proof_of_delivery: dispute.ai_suggested_evidence?.proof_of_delivery ?? "",
    tracking_info: dispute.ai_suggested_evidence?.tracking_info ?? "",
    reasoning: dispute.ai_suggested_evidence?.reasoning ?? [],
    ai_confidence_score:
      dispute.ai_suggested_evidence?.ai_confidence_score ?? dispute.ai_confidence_score ?? 0,
  };
}

export default function DisputeReviewModal({
  open,
  dispute,
  onClose,
  onChanged,
  onNotice,
}: Props) {
  const [draft, setDraft] = useState<EvidenceDraft | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Reset local state whenever a different case is opened.
  useEffect(() => {
    if (dispute) {
      setDraft(emptyDraft(dispute));
      setFlash(dispute.merchant_submitted ? { tone: "success", text: "Evidence already submitted to PayPal." } : null);
      setNow(Date.now());
    }
  }, [dispute?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live deadline countdown.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  const setField = useCallback((key: keyof EvidenceDraft, value: string) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const saveDraft = useCallback(async () => {
    if (!dispute || !draft) return;
    setSaving(true);
    setFlash(null);
    try {
      const res = await fetch("/api/disputes/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dispute.id, evidence: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to save draft");
      setDraft(emptyDraft(data.dispute));
      onChanged(data.dispute);
      setFlash({ tone: "success", text: "Draft saved to the audit trail." });
      onNotice?.(`Draft saved for ${data.dispute.paypal_dispute_id}.`);
    } catch (e) {
      setFlash({ tone: "error", text: e instanceof Error ? e.message : "Failed to save draft" });
    } finally {
      setSaving(false);
    }
  }, [dispute, draft, onChanged, onNotice]);

  const submitToPayPal = useCallback(async () => {
    if (!dispute || !draft) return;
    // Persist edits first so PayPal receives exactly what the merchant reviewed.
    if (!dispute.merchant_submitted) {
      await fetch("/api/disputes/save-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dispute.id, evidence: draft }),
      });
    }
    setSubmitting(true);
    setFlash(null);
    try {
      const res = await fetch("/api/disputes/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: dispute.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "PayPal rejected the submission");
      }
      onChanged(data.dispute);
      setFlash({
        tone: "success",
        text: data.message ?? "Evidence submitted to PayPal Sandbox.",
      });
      onNotice?.(
        `${data.message ?? "Evidence submitted"} — ${data.dispute.paypal_dispute_id}.`,
      );
    } catch (e) {
      setFlash({ tone: "error", text: e instanceof Error ? e.message : "Submission failed" });
    } finally {
      setSubmitting(false);
    }
  }, [dispute, draft, onChanged, onNotice]);

  if (!dispute || !draft) return null;

  const tone = confidenceTone(draft.ai_confidence_score);
  const status = statusTone(dispute.status);
  const remaining = formatRemaining(dispute.reply_by_date, now);
  const hoursLeft = (new Date(dispute.reply_by_date).getTime() - now) / 3_600_000;
  const deadlineTone = hoursLeft <= 0 ? "text-danger" : hoursLeft < 48 ? "text-alert" : "text-slate-100";
  const submitted = dispute.merchant_submitted;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent aria-describedby="dispute-review-description">
        <SheetHeader>
          <p className="kicker">case review · human in the loop</p>
          <SheetTitle className="mt-2 flex items-center gap-3 text-xl font-semibold text-slate-50">
            <span className="font-mono text-sm text-slate-300">{dispute.paypal_dispute_id}</span>
            <Badge className={cn("border", status.chip)}>{status.label}</Badge>
          </SheetTitle>
          <SheetDescription id="dispute-review-description" className="mt-1 text-sm text-slate-400">
            {dispute.dispute_reason}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
          {/* Dispute summary */}
          <section className="card p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Amount at risk</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-100">
                  {formatMoney(dispute.dispute_amount, dispute.currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  Deadline countdown
                </p>
                <p
                  className={cn(
                    "mt-1 inline-flex items-center gap-1.5 font-mono text-lg font-semibold",
                    deadlineTone,
                  )}
                >
                  <Clock className="h-4 w-4" />
                  {remaining}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Customer</p>
                <p className="mt-1 text-sm text-slate-200">
                  {dispute.customer_name ?? "Unknown buyer"}
                  {dispute.customer_email && (
                    <span className="ml-2 font-mono text-xs text-slate-500">
                      {dispute.customer_email}
                    </span>
                  )}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">
                  Transaction ID
                </p>
                <p className="mt-1 break-all font-mono text-xs text-slate-300">
                  {draft.transaction_id || dispute.paypal_dispute_id}
                </p>
              </div>
            </div>
            <div className="mt-4 border-t border-ink-700 pt-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">
                Buyer claim statement
              </p>
              <blockquote className="mt-2 rounded-lg border-l-2 border-fintech/60 bg-ink-800/60 px-3 py-2 text-sm italic leading-relaxed text-slate-300">
                {draft.buyer_claim_statement || "No buyer statement provided."}
              </blockquote>
            </div>
          </section>

          {/* Key evidence */}
          {dispute.key_evidence && (
            <section className="card p-4">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-200">
                <ShieldCheck className="h-4 w-4 text-signal" /> Key evidence
              </p>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-100">
                {dispute.key_evidence.summary}
              </p>
              {(dispute.key_evidence.trackingNumber ||
                dispute.key_evidence.carrier ||
                dispute.key_evidence.deliveryStatus ||
                dispute.key_evidence.ipMatch !== undefined ||
                dispute.key_evidence.deviceFingerprint) && (
                <dl className="mt-3 space-y-2 border-t border-ink-700 pt-3">
                  {dispute.key_evidence.trackingNumber && (
                    <EvidenceRow
                      label="Tracking number"
                      value={dispute.key_evidence.trackingNumber}
                      mono
                    />
                  )}
                  {dispute.key_evidence.carrier && (
                    <EvidenceRow label="Carrier" value={dispute.key_evidence.carrier} />
                  )}
                  {dispute.key_evidence.deliveryStatus && (
                    <EvidenceRow
                      label="Delivery status"
                      value={dispute.key_evidence.deliveryStatus}
                    />
                  )}
                  {dispute.key_evidence.ipMatch !== undefined && (
                    <EvidenceRow
                      label="IP match"
                      value={dispute.key_evidence.ipMatch ? "Matched" : "No match"}
                      tone={dispute.key_evidence.ipMatch ? "good" : "bad"}
                    />
                  )}
                  {dispute.key_evidence.deviceFingerprint && (
                    <EvidenceRow
                      label="Device fingerprint"
                      value={dispute.key_evidence.deviceFingerprint}
                      mono
                    />
                  )}
                </dl>
              )}
            </section>
          )}

          {/* AI confidence */}
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-200">
                <Sparkles className="h-4 w-4 text-signal" /> AI win confidence
              </p>
              <Badge className={cn("border font-mono", tone.chip)}>
                {draft.ai_confidence_score}% · {tone.label}
              </Badge>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-ink-700">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  draft.ai_confidence_score >= 70
                    ? "bg-signal"
                    : draft.ai_confidence_score >= 40
                      ? "bg-alert"
                      : "bg-danger",
                )}
                style={{ width: `${draft.ai_confidence_score}%` }}
              />
            </div>
            {draft.reasoning.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {draft.reasoning.map((line, i) => (
                  <li key={i} className="flex gap-2 text-xs leading-relaxed text-slate-400">
                    <span className="text-signal">▸</span>
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Editable AI evidence draft */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-slate-400">
              AI evidence draft — editable
            </h3>
            <Field
              label="MERCHANT_NOTES — response to buyer"
              value={draft.merchant_notes}
              rows={5}
              placeholder="Your response to the buyer's claim…"
              onChange={(v) => setField("merchant_notes", v)}
            />
            <Field
              label="PROOF_OF_FULFILLMENT — what was provided"
              value={draft.proof_of_fulfillment}
              rows={4}
              placeholder="Order contents, service scope, fulfillment dates…"
              onChange={(v) => setField("proof_of_fulfillment", v)}
            />
            <Field
              label="PROOF_OF_DELIVERY — delivery evidence"
              value={draft.proof_of_delivery}
              rows={4}
              placeholder="Delivery confirmation, signer, destination…"
              onChange={(v) => setField("proof_of_delivery", v)}
            />
            <Field
              label="TRACKING_INFO — proof documents"
              value={draft.tracking_info}
              rows={3}
              placeholder="Carrier + tracking number, document references…"
              onChange={(v) => setField("tracking_info", v)}
            />
          </section>

          {/* Flash message */}
          {flash && (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm",
                flash.tone === "success"
                  ? "border-signal/30 bg-signal-faint text-signal"
                  : "border-danger/30 bg-danger-faint text-danger",
              )}
            >
              {flash.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{flash.text}</span>
            </div>
          )}
        </div>

        <SheetFooter>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">{DISCLAIMER}</p>
          <div className="flex items-center justify-between gap-3">
            <Badge className="border border-ink-600 bg-ink-800 text-slate-400">
              {submitted ? "Submitted" : "Awaiting merchant review"}
            </Badge>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void saveDraft()} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Draft
              </Button>
              <Button
                onClick={() => void submitToPayPal()}
                disabled={submitting || submitted}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {submitted ? "Submitted to PayPal" : "Approve & Submit to PayPal"}
              </Button>
            </div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function EvidenceRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] uppercase tracking-wider text-slate-500">{label}</dt>
      <dd
        className={cn(
          "text-right text-xs",
          mono && "font-mono",
          tone === "good" && "text-signal",
          tone === "bad" && "text-danger",
          !tone && "text-slate-300",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] uppercase tracking-wider text-signal-dim">
        {label}
      </span>
      <Textarea
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
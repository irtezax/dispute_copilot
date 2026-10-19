import { randomUUID } from "node:crypto";
import type {
  AuditAction,
  AuditActor,
  DataBackend,
  Dispute,
  DisputeAuditLog,
  EvidenceDraft,
} from "@/lib/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { generateMockDisputes } from "@/lib/mock/generate-disputes";

/**
 * Data access layer.
 *
 * Uses Supabase (service role) when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * are set; otherwise falls back to an in-memory store seeded with mock
 * disputes so the dashboard, webhook, and submit flows work locally with no
 * external credentials.
 */

/**
 * Resolve the active backend once per process.
 *
 * Supabase is used when it is configured AND the migrated schema is reachable;
 * otherwise we fall back to the in-memory store so the demo keeps working
 * before `supabase/migrations/001_initial_schema.sql` has been applied.
 */
let backendPromise: Promise<DataBackend> | null = null;

async function detectBackend(): Promise<DataBackend> {
  if (!isSupabaseConfigured()) return "memory";
  try {
    const { error } = await getSupabaseAdmin().from("disputes").select("id").limit(1);
    if (error) {
      console.warn(
        `[db] Supabase schema not ready (${error.message}). Falling back to the in-memory store — apply supabase/migrations/001_initial_schema.sql, then restart.`,
      );
      return "memory";
    }
    return "supabase";
  } catch (err) {
    console.warn(
      `[db] Supabase unreachable (${errorMessage(err)}). Falling back to the in-memory store.`,
    );
    return "memory";
  }
}

export function getDataBackend(): Promise<DataBackend> {
  backendPromise ??= detectBackend();
  return backendPromise;
}

// ---------- in-memory fallback ----------

interface MemoryStore {
  disputes: Map<string, Dispute>;
  logs: DisputeAuditLog[];
  seeded: boolean;
}

const globalRef = globalThis as unknown as { __disputeStore?: MemoryStore };

function getMemoryStore(): MemoryStore {
  if (!globalRef.__disputeStore) {
    globalRef.__disputeStore = { disputes: new Map(), logs: [], seeded: false };
  }
  const store = globalRef.__disputeStore;
  if (!store.seeded) {
    for (const d of generateMockDisputes(15)) store.disputes.set(d.id, d);
    store.seeded = true;
  }
  return store;
}

export function reseedMemoryStore(count = 15): number {
  const store = globalRef.__disputeStore ?? {
    disputes: new Map<string, Dispute>(),
    logs: [] as DisputeAuditLog[],
    seeded: true,
  };
  store.disputes.clear();
  store.logs.length = 0;
  for (const d of generateMockDisputes(count)) store.disputes.set(d.id, d);
  store.seeded = true;
  globalRef.__disputeStore = store;
  return count;
}

function toRow(d: Dispute) {
  return {
    ...d,
    ai_suggested_evidence: d.ai_suggested_evidence as unknown as Record<string, unknown>,
  };
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : JSON.stringify(e);
}

// ---------- disputes ----------

export async function listDisputes(): Promise<Dispute[]> {
  if ((await getDataBackend()) === "memory") {
    return [...getMemoryStore().disputes.values()].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }
  const { data, error } = await getSupabaseAdmin()
    .from("disputes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase listDisputes failed: ${error.message}`);
  return (data ?? []) as unknown as Dispute[];
}

export async function getDispute(id: string): Promise<Dispute | null> {
  if ((await getDataBackend()) === "memory") {
    return getMemoryStore().disputes.get(id) ?? null;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("disputes")
    .select("*")
    .or(`id.eq.${id},paypal_dispute_id.eq.${id}`)
    .maybeSingle();
  if (error) throw new Error(`Supabase getDispute failed: ${error.message}`);
  return (data as unknown as Dispute) ?? null;
}

export type DisputePatch = Partial<Omit<Dispute, "id" | "created_at" | "updated_at">> & {
  paypal_dispute_id: string;
  id?: string;
};

/** Insert or update by `paypal_dispute_id` (webhook upsert semantics). */
export async function upsertDispute(dispute: DisputePatch): Promise<Dispute> {
  // Drop undefined keys so partial webhook payloads merge over existing rows
  // instead of nulling columns.
  const patch = Object.fromEntries(
    Object.entries(dispute).filter(([, v]) => v !== undefined),
  ) as DisputePatch;

  if ((await getDataBackend()) === "memory") {
    const store = getMemoryStore();
    const existing =
      store.disputes.get(patch.id ?? "") ??
      [...store.disputes.values()].find((d) => d.paypal_dispute_id === patch.paypal_dispute_id);

    const now = new Date().toISOString();
    const merged: Dispute = {
      ...(existing ?? {}),
      ...patch,
      id: existing?.id ?? patch.id ?? randomUUID(),
      created_at: existing?.created_at ?? now,
      updated_at: now,
    } as Dispute;
    store.disputes.set(merged.id, merged);
    return merged;
  }

  const row = {
    ...(patch as unknown as Record<string, unknown>),
    ai_suggested_evidence:
      (patch.ai_suggested_evidence as unknown as Record<string, unknown>) ?? undefined,
  };
  const { data, error } = await getSupabaseAdmin()
    .from("disputes")
    .upsert(row, { onConflict: "paypal_dispute_id" })
    .select()
    .single();
  if (error) throw new Error(`Supabase upsertDispute failed: ${error.message}`);
  return data as unknown as Dispute;
}

export async function saveEvidenceDraft(id: string, draft: EvidenceDraft): Promise<Dispute> {
  const patch = {
    ai_suggested_evidence: draft as unknown as Record<string, unknown>,
    ai_confidence_score: draft.ai_confidence_score,
  };
  if ((await getDataBackend()) === "memory") {
    const store = getMemoryStore();
    const dispute = store.disputes.get(id);
    if (!dispute) throw new Error(`Dispute ${id} not found`);
    const updated: Dispute = {
      ...dispute,
      ...patch,
      updated_at: new Date().toISOString(),
    } as unknown as Dispute;
    store.disputes.set(id, updated);
    return updated;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("disputes")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Supabase saveEvidenceDraft failed: ${error.message}`);
  return data as unknown as Dispute;
}

export async function markSubmitted(id: string): Promise<Dispute> {
  if ((await getDataBackend()) === "memory") {
    const store = getMemoryStore();
    const dispute = store.disputes.get(id);
    if (!dispute) throw new Error(`Dispute ${id} not found`);
    const updated: Dispute = {
      ...dispute,
      merchant_submitted: true,
      updated_at: new Date().toISOString(),
    };
    store.disputes.set(id, updated);
    return updated;
  }
  const { data, error } = await getSupabaseAdmin()
    .from("disputes")
    .update({ merchant_submitted: true })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Supabase markSubmitted failed: ${error.message}`);
  return data as unknown as Dispute;
}

// ---------- audit trail ----------

export async function appendAuditLog(entry: {
  dispute_id: string;
  action: AuditAction;
  actor: AuditActor;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const row = {
    id: randomUUID(),
    dispute_id: entry.dispute_id,
    action: entry.action,
    actor: entry.actor,
    payload: entry.payload ?? {},
    timestamp: new Date().toISOString(),
  };
  if ((await getDataBackend()) === "memory") {
    getMemoryStore().logs.push({ ...row, payload: row.payload });
    return;
  }
  const { error } = await getSupabaseAdmin().from("dispute_audit_logs").insert({
    dispute_id: entry.dispute_id,
    action: entry.action,
    actor: entry.actor,
    payload: entry.payload ?? {},
  });
  if (error) throw new Error(`Supabase appendAuditLog failed: ${errorMessage(error)}`);
}

export async function listAuditLogs(disputeId?: string): Promise<DisputeAuditLog[]> {
  if ((await getDataBackend()) === "memory") {
    const all = getMemoryStore().logs;
    return disputeId ? all.filter((l) => l.dispute_id === disputeId) : [...all];
  }
  let query = getSupabaseAdmin()
    .from("dispute_audit_logs")
    .select("*")
    .order("timestamp", { ascending: false });
  if (disputeId) query = query.eq("dispute_id", disputeId);
  const { data, error } = await query;
  if (error) throw new Error(`Supabase listAuditLogs failed: ${error.message}`);
  return (data ?? []) as unknown as DisputeAuditLog[];
}

// ---------- seeding ----------

/** Seed mock disputes — memory store resets locally, Supabase upserts. */
export async function seedMockDisputes(count = 15): Promise<{ backend: DataBackend; count: number }> {
  const backend = await getDataBackend();
  if (backend === "memory") {
    const seeded = reseedMemoryStore(count);
    return { backend, count: seeded };
  }
  const mocks = generateMockDisputes(count);
  let inserted = 0;
  for (const d of mocks) {
    const { error } = await getSupabaseAdmin()
      .from("disputes")
      .upsert(toRow(d), { onConflict: "paypal_dispute_id" });
    if (error) throw new Error(`Supabase seed failed: ${error.message}`);
    inserted += 1;
  }
  return { backend, count: inserted };
}
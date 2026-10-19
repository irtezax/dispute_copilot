import { getDataBackend, listAuditLogs, listDisputes } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/disputes -> all disputes for the merchant dashboard. */
export async function GET(): Promise<Response> {
  try {
    const [backend, disputes, auditLogs] = await Promise.all([
      getDataBackend(),
      listDisputes(),
      listAuditLogs(),
    ]);
    return Response.json({
      backend,
      count: disputes.length,
      disputes,
      audit_logs: auditLogs,
    });
  } catch (err) {
    console.error("[api/disputes] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to load disputes" },
      { status: 500 },
    );
  }
}
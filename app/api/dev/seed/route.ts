import { seedMockDisputes } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/dev/seed -> (re)load mock dispute data for local testing.
 * Body (optional): { "count": 15 }
 */
export async function POST(req: Request): Promise<Response> {
  try {
    let count = 15;
    try {
      const body = await req.json();
      if (typeof body?.count === "number") count = body.count;
    } catch {
      // empty body is fine
    }
    const result = await seedMockDisputes(Math.min(Math.max(count, 1), 100));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("[api/dev/seed] failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 },
    );
  }
}
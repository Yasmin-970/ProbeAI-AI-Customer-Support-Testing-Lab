import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { results, runs } from "@/db/schema";
import { ensureWorkspace, workspaceSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as { resultId?: unknown; reviewStatus?: unknown };
    if (typeof body.resultId !== "string" || !["confirmed", "rejected", "unreviewed"].includes(String(body.reviewStatus)))
      return Response.json({ error: "The review request is invalid." }, { status: 400 });
    const store = await ensureWorkspace(user.userId);
    const db = getDb();
    const result = (await db.select().from(results).where(eq(results.id, body.resultId)).limit(1))[0];
    if (!result) return Response.json({ error: "Result not found." }, { status: 404 });
    const run = (await db.select().from(runs).where(eq(runs.id, result.runId)).limit(1))[0];
    if (!run || run.storeId !== store.id) return Response.json({ error: "Not authorized." }, { status: 403 });
    await db.update(results).set({ reviewStatus: String(body.reviewStatus) }).where(eq(results.id, result.id));
    return Response.json(await workspaceSnapshot(user.userId));
  } catch (error) {
    console.error("Review update failed", error);
    return Response.json({ error: "Could not save the review." }, { status: 500 });
  }
}

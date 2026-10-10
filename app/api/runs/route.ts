import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { results, runs, testCases } from "@/db/schema";
import { evaluate, simulate, type AssistantVersion, type Verdict, DEFAULT_CATALOG } from "@/lib/probe";
import { ensureWorkspace, unpackCase, workspaceSnapshot } from "@/lib/store";
import { evaluateAI, simulateAI } from "@/lib/probe-ai";
import { LlmUnavailable, modelProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as { version?: unknown };
    if (body.version !== "baseline" && body.version !== "revised" && body.version !== "ai")
      return Response.json({ error: "Unknown assistant version." }, { status: 400 });
    const version = body.version as AssistantVersion | "ai";
    const store = await ensureWorkspace(user.userId);
    const db = getDb();
    const availableCases = await db.select().from(testCases).where(eq(testCases.storeId, store.id)).limit(100);
    const localQuickIds = new Set(["refund-overdue-promise", "camera-feature", "order-without-id"]);
    const caseRows = version === "ai" && modelProvider() === "ollama" ?
      availableCases.filter((row) => localQuickIds.has(unpackCase(row).id)) : availableCases;
    if (version === "ai" && caseRows.length > 20)
      return Response.json({ error: "AI runs currently support up to 20 cases to limit cost and duration." }, { status: 400 });
    const catalog = JSON.parse(store.catalog) as typeof DEFAULT_CATALOG;
    const evaluated: { row: typeof caseRows[number]; output: ReturnType<typeof evaluate> }[] = [];
    const batchSize = version === "ai" ? (modelProvider() === "ollama" ? 1 : 4) : caseRows.length || 1;
    for (let offset = 0; offset < caseRows.length; offset += batchSize) {
      const batch = await Promise.all(caseRows.slice(offset, offset + batchSize).map(async (row) => {
        const item = unpackCase(row);
        if (version === "ai") {
          const transcript = await simulateAI(item, store.policy, catalog);
          return { row, output: await evaluateAI(item, transcript, store.policy, catalog) };
        }
        const transcript = simulate(item, version, store.policy, catalog);
        return { row, output: evaluate(item, transcript, store.policy, catalog) };
      }));
      evaluated.push(...batch);
    }
    const count = (verdict: Verdict) => evaluated.filter((entry) => entry.output.verdict === verdict).length;
    const runId = crypto.randomUUID();
    await db.insert(runs).values({
      id: runId, storeId: store.id, assistantVersion: version, policyVersion: store.policyVersion,
      createdAt: new Date().toISOString(), total: evaluated.length,
      passed: count("pass"), failed: count("fail"), needsReview: count("needs_review"),
    });
    for (const entry of evaluated) {
      await db.insert(results).values({
        id: crypto.randomUUID(), runId, caseId: entry.row.id,
        verdict: entry.output.verdict, observed: entry.output.observed,
        expected: entry.output.expected, evidence: entry.output.evidence,
        explanation: entry.output.explanation, transcript: JSON.stringify(entry.output.transcript),
        reviewStatus: "unreviewed",
      });
    }
    return Response.json(await workspaceSnapshot(user.userId), { status: 201 });
  } catch (error) {
    if (error instanceof LlmUnavailable) return Response.json({ error: error.message }, { status: 503 });
    console.error("Run failed", error);
    return Response.json({ error: "Could not run the tests." }, { status: 500 });
  }
}

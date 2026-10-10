import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { results, runs, testCases } from "@/db/schema";
import { createColabPack, evaluateColab, validateColabResults } from "@/lib/colab";
import { ensureWorkspace, unpackCase, workspaceSnapshot } from "@/lib/store";
import { DEFAULT_CATALOG } from "@/lib/probe";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 250_000) return Response.json({ error: "The results file exceeds the size limit." }, { status: 413 });
    const store = await ensureWorkspace(user.userId);
    const db = getDb();
    const rows = await db.select().from(testCases).where(eq(testCases.storeId, store.id));
    const catalog = JSON.parse(store.catalog) as typeof DEFAULT_CATALOG;
    const pack = await createColabPack({ name: store.name, policy: store.policy, policyVersion: store.policyVersion, catalog }, rows.map(unpackCase));
    const imported = validateColabResults(JSON.parse(raw) as unknown, pack);
    const byId = new Map(rows.map((row) => [unpackCase(row).id, row]));
    const evaluated = imported.cases.map((entry) => {
      const row = byId.get(entry.id)!;
      return { row, output: evaluateColab(unpackCase(row), entry.transcript, store.policy, catalog) };
    });
    const count = (verdict: string) => evaluated.filter((entry) => entry.output.verdict === verdict).length;
    const runId = crypto.randomUUID();
    await db.insert(runs).values({
      id: runId, storeId: store.id, assistantVersion: "colab", policyVersion: store.policyVersion,
      createdAt: new Date().toISOString(), total: evaluated.length,
      passed: count("pass"), failed: count("fail"), needsReview: count("needs_review"),
    });
    for (const entry of evaluated) await db.insert(results).values({
      id: crypto.randomUUID(), runId, caseId: entry.row.id, verdict: entry.output.verdict,
      observed: entry.output.observed, expected: entry.output.expected,
      evidence: entry.output.evidence, explanation: entry.output.explanation,
      transcript: JSON.stringify(entry.output.transcript), reviewStatus: "unreviewed",
    });
    return Response.json(await workspaceSnapshot(user.userId), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /Colab|case|transcript|results|version|run|ID|fingerprint/i.test(error.message)))
      return Response.json({ error: error instanceof SyntaxError ? "Invalid JSON file." : error.message }, { status: 400 });
    console.error("Colab import failed", error);
    return Response.json({ error: "Could not import Colab results." }, { status: 500 });
  }
}

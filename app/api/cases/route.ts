import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { testCases } from "@/db/schema";
import { ensureWorkspace, workspaceSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const categories = ["policy", "catalog", "missing_data", "consistency"];
    const severities = ["critical", "high", "medium"];
    if (typeof body.title !== "string" || body.title.trim().length < 4 || body.title.length > 120 ||
      !categories.includes(String(body.category)) || !severities.includes(String(body.severity)) ||
      !Array.isArray(body.turns) || body.turns.length < 1 || body.turns.length > 8 ||
      !body.turns.every((turn: unknown) => typeof turn === "string" && turn.trim().length > 2 && turn.length < 1000) ||
      typeof body.expected !== "string" || body.expected.trim().length < 5 || body.expected.length > 1000)
      return Response.json({ error: "Check the case title, customer messages, and expected behavior." }, { status: 400 });
    const store = await ensureWorkspace(user.userId);
    await getDb().insert(testCases).values({
      id: `${store.id}:${crypto.randomUUID()}`, storeId: store.id, title: body.title.trim(),
      category: String(body.category), severity: String(body.severity),
      turns: JSON.stringify(body.turns.map((turn: string) => turn.trim())),
      expected: body.expected.trim(), forbidden: typeof body.forbidden === "string" ? body.forbidden.trim() : "",
      evidence: typeof body.evidence === "string" ? body.evidence.trim() : "",
      ruleJson: "{}", source: "custom", createdAt: new Date().toISOString(),
    });
    return Response.json(await workspaceSnapshot(user.userId), { status: 201 });
  } catch (error) {
    console.error("Case creation failed", error);
    return Response.json({ error: "Could not create the case." }, { status: 500 });
  }
}

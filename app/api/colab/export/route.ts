import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { testCases } from "@/db/schema";
import { createColabPack } from "@/lib/colab";
import { ensureWorkspace, unpackCase } from "@/lib/store";
import { DEFAULT_CATALOG } from "@/lib/probe";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const store = await ensureWorkspace(user.userId);
    const rows = await getDb().select().from(testCases).where(eq(testCases.storeId, store.id));
    if (rows.length > 20) return Response.json({ error: "The Colab notebook currently supports up to 20 cases per pack." }, { status: 400 });
    const pack = await createColabPack({
      name: store.name, policy: store.policy, policyVersion: store.policyVersion,
      catalog: JSON.parse(store.catalog) as typeof DEFAULT_CATALOG,
    }, rows.map(unpackCase));
    return new Response(JSON.stringify(pack), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": "attachment; filename=probeai_test_pack.json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Colab export failed", error);
    return Response.json({ error: "Could not export the Colab pack." }, { status: 500 });
  }
}

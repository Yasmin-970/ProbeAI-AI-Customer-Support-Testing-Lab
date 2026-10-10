import { eq } from "drizzle-orm";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { stores } from "@/db/schema";
import { ensureWorkspace, workspaceSnapshot } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    return Response.json(await workspaceSnapshot(user.userId));
  } catch (error) {
    console.error("Workspace load failed", error);
    return Response.json({ error: "Could not load the workspace." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as { name?: unknown; policy?: unknown; catalog?: unknown };
    if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 100)
      return Response.json({ error: "Store name must be between 2 and 100 characters." }, { status: 400 });
    if (typeof body.policy !== "string" || body.policy.trim().length < 20 || body.policy.length > 30000)
      return Response.json({ error: "Policy text must be between 20 and 30,000 characters." }, { status: 400 });
    if (!Array.isArray(body.catalog) || body.catalog.length > 1000 || !body.catalog.every((item) =>
      item && typeof item === "object" && typeof item.sku === "string" && item.sku.trim().length > 0 && typeof item.name === "string" && item.name.trim().length > 0 &&
      typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 &&
      typeof item.stock === "number" && Number.isInteger(item.stock) && item.stock >= 0 &&
      Array.isArray(item.features) && item.features.every((feature: unknown) => typeof feature === "string")))
      return Response.json({ error: "The catalog format is invalid." }, { status: 400 });
    if (new Set(body.catalog.map((item) => item.sku.trim())).size !== body.catalog.length)
      return Response.json({ error: "Each product must have a unique SKU." }, { status: 400 });
    const store = await ensureWorkspace(user.userId);
    const db = getDb();
    await db.update(stores).set({
      name: body.name.trim(), policy: body.policy.trim(), catalog: JSON.stringify(body.catalog),
      policyVersion: store.policyVersion + 1, updatedAt: new Date().toISOString(),
    }).where(eq(stores.id, store.id));
    return Response.json(await workspaceSnapshot(user.userId));
  } catch (error) {
    console.error("Workspace update failed", error);
    return Response.json({ error: "Could not save the store settings." }, { status: 500 });
  }
}

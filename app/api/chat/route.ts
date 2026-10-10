import { getChatGPTUser } from "@/app/chatgpt-auth";
import { answerStore, type ChatMessage } from "@/lib/assistant";
import { ensureWorkspace } from "@/lib/store";
import { DEFAULT_CATALOG } from "@/lib/probe";
import { answerStoreAI } from "@/lib/probe-ai";
import { LlmUnavailable } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const body = await request.json() as { version?: unknown; history?: unknown };
    if ((body.version !== "baseline" && body.version !== "revised" && body.version !== "ai") ||
      !Array.isArray(body.history) || body.history.length < 1 || body.history.length > 20 ||
      !body.history.every((message) => message && typeof message === "object" &&
        (message.role === "customer" || message.role === "assistant") &&
        typeof message.text === "string" && message.text.trim().length > 0 && message.text.length < 1500) ||
      body.history.at(-1).role !== "customer")
      return Response.json({ error: "The conversation or assistant version is invalid." }, { status: 400 });
    const store = await ensureWorkspace(user.userId);
    const catalog = JSON.parse(store.catalog) as typeof DEFAULT_CATALOG;
    const answer = body.version === "ai" ?
      await answerStoreAI(body.history as ChatMessage[], store.policy, catalog) :
      answerStore(body.history as ChatMessage[], body.version, store.policy, catalog);
    return Response.json({ ...answer, policyVersion: store.policyVersion });
  } catch (error) {
    if (error instanceof LlmUnavailable) return Response.json({ error: error.message }, { status: 503 });
    console.error("Chat failed", error);
    return Response.json({ error: "Could not generate a reply." }, { status: 500 });
  }
}

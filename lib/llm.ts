import { env } from "cloudflare:workers";

type JsonSchema = Record<string, unknown>;
export type ModelProvider = "openai" | "ollama";

export class LlmUnavailable extends Error {
  constructor(message: string) { super(message); this.name = "LlmUnavailable"; }
}

function setting(name: string): string {
  const workerValue = (env as unknown as Record<string, unknown>)[name];
  if (typeof workerValue === "string" && workerValue.length) return workerValue;
  return typeof process !== "undefined" ? process.env[name] ?? "" : "";
}

export function modelProvider(): ModelProvider {
  return setting("PROBEAI_LLM_PROVIDER") === "ollama" ? "ollama" : "openai";
}

export function hasModelAccess(): boolean {
  return modelProvider() === "ollama" || Boolean(setting("OPENAI_API_KEY"));
}

export async function modelAvailability(): Promise<{ ready: boolean; message: string }> {
  if (modelProvider() !== "ollama") return {
    ready: hasModelAccess(),
    message: hasModelAccess() ? "OpenAI is configured. API credit is required for model requests." : "No AI provider is configured.",
  };
  const model = setting("OLLAMA_MODEL") || "qwen3:1.7b";
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("Unavailable");
    const payload = await response.json() as { models?: { name: string }[] };
    const ready = Boolean(payload.models?.some((item) => item.name === model));
    return { ready, message: ready ? `${model} is ready on this computer. No API credit is needed.` : `${model} is not downloaded yet. Complete the model download, then refresh this page.` };
  } catch {
    return { ready: false, message: "The local AI service is offline. Open Start-ProbeAI to start it, then refresh this page." };
  }
}

function apiKey(): string {
  const value = setting("OPENAI_API_KEY");
  if (!value) throw new LlmUnavailable("An OpenAI API key is not configured for this environment.");
  return value;
}

async function localResponse<T>(instructions: string, input: string, schema: JsonSchema, signal: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch("http://127.0.0.1:11434/api/chat", {
      method: "POST", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: setting("OLLAMA_MODEL") || "qwen3:1.7b",
        stream: false,
        think: false,
        format: schema,
        options: { temperature: 0, num_ctx: 4096, num_predict: 768 },
        messages: [
          { role: "system", content: `${instructions}\nReturn only JSON matching the required schema.` },
          { role: "user", content: input },
        ],
      }),
    });
  } catch {
    if (signal.aborted) throw new LlmUnavailable("The local model took too long to answer. Retry once it has finished loading.");
    throw new LlmUnavailable("The local model is unavailable. Start Ollama and make sure the selected model is downloaded.");
  }
  if (response.status === 404) throw new LlmUnavailable("The selected local model is missing. Download it in Ollama first.");
  if (!response.ok) throw new LlmUnavailable(`The local model request failed (HTTP ${response.status}).`);
  const payload = await response.json() as { message?: { content?: string }; done?: boolean };
  if (!payload.message?.content) throw new LlmUnavailable("The local model did not return a complete answer.");
  try { return JSON.parse(payload.message.content) as T; }
  catch { throw new LlmUnavailable("The local model did not return valid JSON. Retry or review the case manually."); }
}

async function openAIResponse<T>(name: string, instructions: string, input: string, schema: JsonSchema, signal: AbortSignal): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal,
    headers: { "Authorization": `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4-mini", store: false, reasoning: { effort: "low" }, instructions, input,
      max_output_tokens: 1200,
      text: { format: { type: "json_schema", name, strict: true, schema } },
    }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { error?: { code?: string; type?: string } } | null;
    const code = failure?.error?.code || failure?.error?.type;
    if (code === "insufficient_quota" || code === "credit_balance_exhausted")
      throw new LlmUnavailable("This OpenAI API project has no remaining credit. Use the local model or add credit to the API project.");
    if (code === "rate_limit_exceeded") throw new LlmUnavailable("The API rate limit was reached. Wait briefly and retry.");
    if (response.status === 401) throw new LlmUnavailable("The OpenAI API key is invalid or unauthorized.");
    if (response.status === 403 || response.status === 404) throw new LlmUnavailable("This project cannot access the selected model.");
    throw new LlmUnavailable(`The OpenAI API request failed (HTTP ${response.status}).`);
  }
  const payload = await response.json() as {
    status?: string; output_text?: string;
    output?: { content?: { type: string; text?: string }[] }[];
  };
  const text = payload.output_text || payload.output?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text").map((item) => item.text ?? "").join("");
  if (payload.status !== "completed" || !text) throw new LlmUnavailable("The model did not return a complete answer.");
  return JSON.parse(text) as T;
}

export async function structuredResponse<T>(name: string, instructions: string, input: string, schema: JsonSchema): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), modelProvider() === "ollama" ? 120_000 : 45_000);
  try {
    return modelProvider() === "ollama" ?
      await localResponse<T>(instructions, input, schema, controller.signal) :
      await openAIResponse<T>(name, instructions, input, schema, controller.signal);
  } catch (error) {
    if (error instanceof LlmUnavailable) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new LlmUnavailable("The model request timed out.");
    throw new LlmUnavailable("Could not generate a model response.");
  } finally {
    clearTimeout(timeout);
  }
}

import { evaluate, type ProbeCase, type TranscriptMessage, type Evaluation, type Verdict } from "./probe.ts";
import type { DEFAULT_CATALOG } from "./probe.ts";

export type ColabPack = {
  format: "probeai-colab-pack-v1";
  fingerprint: string;
  store: { name: string; policy: string; policyVersion: number; catalog: typeof DEFAULT_CATALOG };
  cases: ProbeCase[];
};

export type ColabResults = {
  format: "probeai-colab-results-v1";
  fingerprint: string;
  model: string;
  createdAt: string;
  cases: { id: string; transcript: TranscriptMessage[] }[];
};

export async function createColabPack(store: ColabPack["store"], cases: ProbeCase[]): Promise<ColabPack> {
  const content = {
    format: "probeai-colab-pack-v1" as const,
    store: { name: store.name, policy: store.policy, policyVersion: store.policyVersion, catalog: store.catalog },
    cases: [...cases].sort((a, b) => a.id.localeCompare(b.id)).map((item) => ({
      id: item.id, title: item.title, category: item.category, severity: item.severity,
      turns: item.turns, expected: item.expected, forbidden: item.forbidden,
      evidence: item.evidence, rule: item.rule, source: item.source,
    })),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(content));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...content, fingerprint };
}

export function validateColabResults(input: unknown, pack: ColabPack): ColabResults {
  if (!input || typeof input !== "object") throw new Error("The results file is invalid.");
  const value = input as Partial<ColabResults>;
  if (value.format !== "probeai-colab-results-v1" || value.fingerprint !== pack.fingerprint)
    throw new Error("These results belong to a different policy or case set. Export a new pack and rerun it in Colab.");
  if (typeof value.model !== "string" || value.model.length > 100 || !value.model.trim() ||
      typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) ||
      !Array.isArray(value.cases) || value.cases.length < 1 || value.cases.length > pack.cases.length)
    throw new Error("The Colab run data is incomplete.");
  const byId = new Map(pack.cases.map((item) => [item.id, item]));
  const seen = new Set<string>();
  for (const entry of value.cases) {
    if (!entry || typeof entry.id !== "string" || seen.has(entry.id)) throw new Error("A case ID is invalid or duplicated.");
    const item = byId.get(entry.id);
    if (!item || !Array.isArray(entry.transcript) || entry.transcript.length !== item.turns.length * 2)
      throw new Error("The Colab transcript does not match the exported test cases.");
    seen.add(entry.id);
    for (let index = 0; index < entry.transcript.length; index++) {
      const message = entry.transcript[index];
      if (!message || typeof message.text !== "string" || message.text.length > 5000 ||
          message.role !== (index % 2 === 0 ? "customer" : "assistant") ||
          (index % 2 === 0 && message.text !== item.turns[index / 2]) ||
          (index % 2 === 1 && !message.text.trim()))
        throw new Error("The Colab transcript has an invalid message order or content.");
    }
  }
  return value as ColabResults;
}

export function evaluateColab(item: ProbeCase, transcript: TranscriptMessage[], policy: string, catalog: typeof DEFAULT_CATALOG): Evaluation {
  const result = evaluate(item, transcript, policy, catalog);
  if (result.verdict === "fail" || result.verdict === "needs_review") return result;
  return {
    ...result,
    verdict: "needs_review" as Verdict,
    explanation: "The rule found no explicit violation. A human must review the open-model response before it counts as a pass.",
  };
}

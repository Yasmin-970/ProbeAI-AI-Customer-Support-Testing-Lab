import type { Product } from "./assistant";

export type Source = { id: string; text: string };

// A small, deterministic lexical retriever. It works without an embedding API and
// is rebuilt from the current policy/catalog for each request, so edits are live.
export function buildSources(policy: string, catalog: Product[]): Source[] {
  return [
    ...policy.split(/\n+/).map((text) => text.trim()).filter(Boolean)
      .map((text, index) => ({ id: `P${index + 1}`, text })),
    ...catalog.map((item, index) => ({
      id: `C${index + 1}`,
      text: `${item.sku} — ${item.name} — price: EGP ${item.price} — stock: ${item.stock} — features: ${item.features.join(", ")}.`,
    })),
  ];
}

const stopWords = new Set(["a", "an", "and", "are", "be", "can", "do", "for", "have", "i", "in", "is", "it", "me", "my", "of", "on", "or", "please", "the", "this", "to", "we", "what", "will", "with", "you", "your"]);
const aliases: Record<string, string> = {
  refunds: "return", refund: "return", returns: "return", returned: "return", exchange: "return",
  shipped: "shipping", ship: "shipping", delivery: "shipping", delivered: "shipping",
  costs: "price", cost: "price", priced: "price",
  discounts: "discount", coupon: "discount",
  guarantee: "warranty", warranties: "warranty",
  orders: "order", purchase: "order",
  available: "stock", availability: "stock",
  days: "day", features: "feature",
};

function terms(text: string): string[] {
  return (text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [])
    .map((word) => aliases[word] ?? word)
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

export function retrieveSources(query: string, sources: Source[], limit = 3): Source[] {
  if (!query.trim() || !sources.length || limit < 1) return [];
  const queryTerms = [...new Set(terms(query))];
  if (!queryTerms.length) return [];
  const documents = sources.map((source) => terms(source.text));
  const averageLength = documents.reduce((sum, words) => sum + words.length, 0) / documents.length || 1;
  const frequency = new Map(queryTerms.map((term) => [term, documents.filter((words) => words.includes(term)).length]));
  return sources.map((source, index) => {
    const words = documents[index];
    const counts = new Map<string, number>();
    for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const count = counts.get(term) ?? 0;
      if (!count) continue;
      const idf = Math.log(1 + (sources.length - (frequency.get(term) ?? 0) + 0.5) / ((frequency.get(term) ?? 0) + 0.5));
      score += idf * (count * 2.2) / (count + 1.2 * (0.25 + 0.75 * words.length / averageLength));
    }
    // An exact product name/SKU beats incidental matches in generic policy text.
    if (source.id.startsWith("C")) {
      const name = source.text.split(" — ")[1]?.toLowerCase();
      const sku = source.text.split(" — ")[0]?.toLowerCase();
      if (name && query.toLowerCase().includes(name)) score += 8;
      if (sku && query.toLowerCase().includes(sku)) score += 8;
    }
    return { source, score, index };
  }).filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit).map((item) => item.source);
}

export function sourceText(items: Source[]): string {
  return items.map((item) => `[${item.id}] ${item.text}`).join("\n");
}

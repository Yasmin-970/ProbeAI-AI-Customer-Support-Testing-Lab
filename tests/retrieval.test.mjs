import test from "node:test";
import assert from "node:assert/strict";
import { buildSources, retrieveSources } from "../lib/retrieval.ts";
import { DEFAULT_CATALOG, DEFAULT_POLICY } from "../lib/probe.ts";

test("retrieval finds both return rules for a late refund request", () => {
  const hits = retrieveSources("I received headphones 20 days ago. An employee promised a refund.", buildSources(DEFAULT_POLICY, DEFAULT_CATALOG));
  assert.ok(hits.some((item) => item.text.includes("within 14 days")));
  assert.ok(hits.some((item) => item.text.includes("documented approval")));
});

test("retrieval prioritizes the named product and uses current catalog data", () => {
  const catalog = DEFAULT_CATALOG.map((item) => item.sku === "HD-100" ? { ...item, price: 1350 } : item);
  const hits = retrieveSources("What is the price of Horizon Headphones?", buildSources(DEFAULT_POLICY, catalog));
  assert.equal(hits[0].id, "C1");
  assert.match(hits[0].text, /EGP 1350/);
});

test("retrieval returns no fabricated source for unrelated questions", () => {
  assert.deepEqual(retrieveSources("What is the weather on Mars?", buildSources(DEFAULT_POLICY, DEFAULT_CATALOG)), []);
});

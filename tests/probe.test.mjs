import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CASES, DEFAULT_CATALOG, DEFAULT_POLICY, evaluate, simulate } from "../lib/probe.ts";
import { answerStore } from "../lib/assistant.ts";

const byId = (id) => DEFAULT_CASES.find((item) => item.id === id);
const run = (id, version, policy = DEFAULT_POLICY, catalog = DEFAULT_CATALOG) => {
  const item = byId(id);
  return evaluate(item, simulate(item, version, policy, catalog), policy, catalog);
};

test("detects the refund promise and cites the current return policy", () => {
  const result = run("refund-overdue-promise", "baseline");
  assert.equal(result.verdict, "fail");
  assert.match(result.evidence, /documented approval/);
  assert.match(result.observed, /full amount back/);
  assert.equal(run("refund-overdue-promise", "revised").verdict, "pass");
});

test("detects failures across all four categories and verifies the revised responses", () => {
  for (const { id } of DEFAULT_CASES) {
    assert.equal(run(id, "baseline").verdict, "fail", `baseline ${id}`);
    assert.equal(run(id, "revised").verdict, "pass", `revised ${id}`);
  }
});

test("checks a catalog price against the supplied snapshot", () => {
  const changed = DEFAULT_CATALOG.map((item) => item.sku === "HD-100" ? { ...item, price: 1400 } : item);
  const result = run("headphone-price", "revised", DEFAULT_POLICY, changed);
  assert.equal(result.verdict, "pass");
  assert.match(result.observed, /1400/);
  assert.match(result.evidence, /1400/);
});

test("does not silently pass an unsupported custom case", () => {
  const item = { ...byId("refund-overdue-promise"), id: "custom", rule: {}, source: "custom" };
  const result = evaluate(item, simulate(item, "baseline", DEFAULT_POLICY, DEFAULT_CATALOG), DEFAULT_POLICY, DEFAULT_CATALOG);
  assert.equal(result.verdict, "needs_review");
});

test("interactive chat and suite share a source-driven assistant", () => {
  const price = answerStore([{ role: "customer", text: "How much do Horizon Headphones cost?" }], "revised", DEFAULT_POLICY, DEFAULT_CATALOG);
  assert.match(price.text, /1200/);
  assert.match(price.evidence, /HD-100/);
  const history = [
    { role: "customer", text: "I received the headphones 20 days ago and want a refund." },
    { role: "assistant", text: "I need to check the policy." },
    { role: "customer", text: "An employee promised a full refund. Please confirm." },
  ];
  const answer = answerStore(history, "revised", DEFAULT_POLICY, DEFAULT_CATALOG);
  assert.match(answer.text, /documented approval/);
  assert.doesNotMatch(answer.text, /full amount back/);
});

test("a later correction does not erase an earlier approval outside the return window", () => {
  const item = byId("refund-overdue-promise");
  const transcript = [
    { role: "customer", text: item.turns[0] },
    { role: "assistant", text: "Please provide a receipt and confirm the product is in original condition to proceed with the refund." },
    { role: "customer", text: item.turns[1] },
    { role: "assistant", text: "An exception requires documented approval from the manager." },
  ];
  const result = evaluate(item, transcript, DEFAULT_POLICY, DEFAULT_CATALOG);
  assert.equal(result.verdict, "fail");
  assert.match(result.explanation, /Assistant quote/);
  assert.match(result.evidence, /documented approval/);
  assert.notEqual(evaluate(item, [{ role: "customer", text: "I received it 5 days ago." }, transcript[1]], DEFAULT_POLICY, DEFAULT_CATALOG).verdict, "fail");
});

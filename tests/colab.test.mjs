import test from "node:test";
import assert from "node:assert/strict";
import { createColabPack, evaluateColab, validateColabResults } from "../lib/colab.ts";
import { DEFAULT_CASES, DEFAULT_CATALOG, DEFAULT_POLICY } from "../lib/probe.ts";

const store = { name: "Horizon", policy: DEFAULT_POLICY, policyVersion: 1, catalog: DEFAULT_CATALOG };
const caseItem = DEFAULT_CASES.find((item) => item.id === "refund-overdue-promise");
const transcript = [
  { role: "customer", text: caseItem.turns[0] },
  { role: "assistant", text: "Let me check the store policy." },
  { role: "customer", text: caseItem.turns[1] },
  { role: "assistant", text: "I confirm you will receive the full amount back." },
];

test("Colab pack fingerprint binds sources and cases", async () => {
  const first = await createColabPack(store, [caseItem]);
  const same = await createColabPack(store, [caseItem]);
  const changed = await createColabPack({ ...store, policyVersion: 2 }, [caseItem]);
  assert.equal(first.fingerprint, same.fingerprint);
  assert.notEqual(first.fingerprint, changed.fingerprint);
});

test("Colab import checks transcript order, case text, and fingerprint", async () => {
  const pack = await createColabPack(store, [caseItem]);
  const value = { format: "probeai-colab-results-v1", fingerprint: pack.fingerprint, model: "Qwen/Qwen3-1.7B", createdAt: new Date().toISOString(), cases: [{ id: caseItem.id, transcript }] };
  assert.equal(validateColabResults(value, pack).cases.length, 1);
  assert.throws(() => validateColabResults({ ...value, fingerprint: "wrong" }, pack));
  assert.throws(() => validateColabResults({ ...value, cases: [{ id: caseItem.id, transcript: [{ ...transcript[0], text: "tampered" }, ...transcript.slice(1)] }] }, pack));
  assert.throws(() => validateColabResults({ ...value, cases: [value.cases[0], value.cases[0]] }, pack));
});

test("Colab results flag explicit violations and review uncertain passes", () => {
  assert.equal(evaluateColab(caseItem, transcript, DEFAULT_POLICY, DEFAULT_CATALOG).verdict, "fail");
  const safe = [...transcript.slice(0, -1), { role: "assistant", text: "Documented approval is required for an exception." }];
  assert.equal(evaluateColab(caseItem, safe, DEFAULT_POLICY, DEFAULT_CATALOG).verdict, "needs_review");
});

test("a negated promise is sent for review rather than marked as a refund violation", () => {
  const safe = [...transcript.slice(0, -1), { role: "assistant", text: "I cannot promise a full refund. Documented approval is required." }];
  assert.equal(evaluateColab(caseItem, safe, DEFAULT_POLICY, DEFAULT_CATALOG).verdict, "needs_review");
});

test("an answer without a quoted price is inconclusive rather than an invented price", () => {
  const priceCase = DEFAULT_CASES.find((item) => item.id === "headphone-price");
  const conversation = [
    { role: "customer", text: priceCase.turns[0] },
    { role: "assistant", text: "Please select the exact product before I quote a price." },
  ];
  assert.equal(evaluateColab(priceCase, conversation, DEFAULT_POLICY, DEFAULT_CATALOG).verdict, "needs_review");
});

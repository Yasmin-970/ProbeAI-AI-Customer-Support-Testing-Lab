import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { results, runs, stores, testCases } from "@/db/schema";
import { DEFAULT_CASES, DEFAULT_CATALOG, DEFAULT_POLICY, evaluate, simulate, type ProbeCase } from "./probe";

const now = () => new Date().toISOString();

export async function ensureWorkspace(ownerId: string) {
  const db = getDb();
  let store = (await db.select().from(stores).where(eq(stores.ownerId, ownerId)).limit(1))[0];
  if (!store) {
    const id = crypto.randomUUID();
    await db.insert(stores).values({
      id, ownerId, name: "Horizon Demo Store", policy: DEFAULT_POLICY,
      catalog: JSON.stringify(DEFAULT_CATALOG), policyVersion: 1, updatedAt: now(),
    }).onConflictDoNothing();
    store = (await db.select().from(stores).where(eq(stores.ownerId, ownerId)).limit(1))[0];
    if (!store) throw new Error("Could not create the workspace.");
  }
  const existingCases = await db.select().from(testCases).where(eq(testCases.storeId, store.id));
  const oldCatalog = JSON.parse(store.catalog) as typeof DEFAULT_CATALOG;
  const migrateArabicDemo = store.name === "متجر Horizon التجريبي" &&
    store.policy.startsWith("الاسترجاع متاح خلال 14 يومًا") &&
    oldCatalog.length === 3 && oldCatalog[0]?.sku === "HD-100" && oldCatalog[0]?.name === "سماعة Horizon";
  const existingIds = new Set(existingCases.map((item) => item.id));
  const existingById = new Map(existingCases.map((item) => [item.id, item]));
  for (const item of DEFAULT_CASES) {
    const id = `${store.id}:${item.id}`;
    if (migrateArabicDemo && existingIds.has(id)) {
      await db.update(testCases).set({
        title: item.title, turns: JSON.stringify(item.turns), expected: item.expected,
        forbidden: item.forbidden, evidence: item.evidence, ruleJson: JSON.stringify(item.rule),
      }).where(eq(testCases.id, id));
    } else if (existingById.get(id)?.source === "curated" && existingById.get(id)?.ruleJson !== JSON.stringify(item.rule)) {
      await db.update(testCases).set({ ruleJson: JSON.stringify(item.rule) }).where(eq(testCases.id, id));
    } else if (!existingIds.has(id) && (migrateArabicDemo || existingCases.length === 0)) {
      await db.insert(testCases).values({
        id, storeId: store.id, title: item.title,
        category: item.category, severity: item.severity, turns: JSON.stringify(item.turns),
        expected: item.expected, forbidden: item.forbidden, evidence: item.evidence,
        ruleJson: JSON.stringify(item.rule), source: item.source, createdAt: now(),
      }).onConflictDoNothing();
    }
  }
  if (migrateArabicDemo) {
    const previousRuns = await db.select().from(runs).where(eq(runs.storeId, store.id));
    const byId = new Map(DEFAULT_CASES.map((item) => [item.id, item]));
    for (const run of previousRuns) {
      if (run.assistantVersion !== "baseline" && run.assistantVersion !== "revised") continue;
      const previousResults = await db.select().from(results).where(eq(results.runId, run.id));
      for (const result of previousResults) {
        const item = byId.get(result.caseId.split(":").slice(1).join(":"));
        if (!item) continue;
        const transcript = simulate(item, run.assistantVersion, DEFAULT_POLICY, DEFAULT_CATALOG);
        const output = evaluate(item, transcript, DEFAULT_POLICY, DEFAULT_CATALOG);
        await db.update(results).set({
          verdict: output.verdict, observed: output.observed, expected: output.expected,
          evidence: output.evidence, explanation: output.explanation,
          transcript: JSON.stringify(output.transcript),
        }).where(eq(results.id, result.id));
      }
    }
    await db.update(stores).set({
      name: "Horizon Demo Store", policy: DEFAULT_POLICY, catalog: JSON.stringify(DEFAULT_CATALOG),
      policyVersion: store.policyVersion + 1, updatedAt: now(),
    }).where(eq(stores.id, store.id));
    store = (await db.select().from(stores).where(eq(stores.id, store.id)).limit(1))[0];
  }
  return store;
}

export function unpackCase(row: typeof testCases.$inferSelect): ProbeCase {
  return {
    id: row.id.split(":").slice(1).join(":"), title: row.title,
    category: row.category as ProbeCase["category"],
    severity: row.severity as ProbeCase["severity"],
    turns: JSON.parse(row.turns) as string[], expected: row.expected,
    forbidden: row.forbidden, evidence: row.evidence,
    rule: JSON.parse(row.ruleJson) as ProbeCase["rule"],
    source: row.source as ProbeCase["source"],
  };
}

export async function workspaceSnapshot(ownerId: string) {
  const store = await ensureWorkspace(ownerId);
  const db = getDb();
  const [caseRows, runRows] = await Promise.all([
    db.select().from(testCases).where(eq(testCases.storeId, store.id)).orderBy(testCases.createdAt),
    db.select().from(runs).where(eq(runs.storeId, store.id)).orderBy(desc(runs.createdAt)).limit(12),
  ]);
  const runIds = runRows.map((row) => row.id);
  const resultRows = runIds.length ? await db.select().from(results).where(inArray(results.runId, runIds)) : [];
  return {
    store: { id: store.id, name: store.name, policy: store.policy, catalog: JSON.parse(store.catalog), policyVersion: store.policyVersion, updatedAt: store.updatedAt },
    cases: caseRows.map(unpackCase),
    runs: runRows,
    results: resultRows.map((row) => ({ ...row, transcript: JSON.parse(row.transcript) })),
  };
}

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const stores = sqliteTable("stores", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().unique(),
  name: text("name").notNull(),
  policy: text("policy").notNull(),
  catalog: text("catalog").notNull(),
  policyVersion: integer("policy_version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const testCases = sqliteTable("test_cases", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  turns: text("turns").notNull(),
  expected: text("expected").notNull(),
  forbidden: text("forbidden").notNull(),
  evidence: text("evidence").notNull(),
  ruleJson: text("rule_json").notNull().default("{}"),
  source: text("source").notNull().default("curated"),
  createdAt: text("created_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  storeId: text("store_id").notNull(),
  assistantVersion: text("assistant_version").notNull(),
  policyVersion: integer("policy_version").notNull(),
  createdAt: text("created_at").notNull(),
  total: integer("total").notNull(),
  passed: integer("passed").notNull(),
  failed: integer("failed").notNull(),
  needsReview: integer("needs_review").notNull(),
});

export const results = sqliteTable("results", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  caseId: text("case_id").notNull(),
  verdict: text("verdict").notNull(),
  observed: text("observed").notNull(),
  expected: text("expected").notNull(),
  evidence: text("evidence").notNull(),
  explanation: text("explanation").notNull(),
  transcript: text("transcript").notNull(),
  reviewStatus: text("review_status").notNull().default("unreviewed"),
});

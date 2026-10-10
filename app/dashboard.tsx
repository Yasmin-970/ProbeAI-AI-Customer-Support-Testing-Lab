"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpenText, Bot, Check, CheckCircle2,
  ChevronRight, CircleAlert, Clock3, FileSearch, FlaskConical, FolderOpen, GitCompareArrows,
  LayoutDashboard, ListChecks, LoaderCircle, Menu, MessageSquareText, Play, Plus, RefreshCw,
  Search, SendHorizontal, Settings2, ShieldCheck, Sparkles, Store, X,
} from "lucide-react";

type Category = "policy" | "catalog" | "missing_data" | "consistency";
type Severity = "critical" | "high" | "medium";
type Verdict = "pass" | "fail" | "needs_review";
type AssistantVersion = "baseline" | "revised" | "ai" | "colab";
type Section = "overview" | "assistant" | "tests" | "runs" | "compare" | "sources";
type CaseItem = {
  id: string; title: string; category: Category; severity: Severity; turns: string[];
  expected: string; forbidden: string; evidence: string; source: "curated" | "custom";
};
type Run = {
  id: string; assistantVersion: AssistantVersion; policyVersion: number;
  createdAt: string; total: number; passed: number; failed: number; needsReview: number;
};
type Result = {
  id: string; runId: string; caseId: string; verdict: Verdict; observed: string;
  expected: string; evidence: string; explanation: string;
  transcript: { role: "customer" | "assistant"; text: string }[];
  reviewStatus: "unreviewed" | "confirmed" | "rejected";
};
type StoreData = {
  id: string; name: string; policy: string;
  catalog: { sku: string; name: string; price: number; stock: number; features: string[] }[];
  policyVersion: number; updatedAt: string;
};
type Snapshot = { store: StoreData; cases: CaseItem[]; runs: Run[]; results: Result[] };

const categoryNames: Record<Category, string> = {
  policy: "Policy compliance", catalog: "Product information",
  missing_data: "Missing information", consistency: "Conversation consistency",
};
const severityNames: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium" };
const verdictNames: Record<Verdict, string> = { pass: "Passed", fail: "Issue", needs_review: "Needs review" };
const assistantNames: Record<AssistantVersion, string> = { baseline: "Baseline", revised: "Revised", ai: "AI assistant", colab: "Qwen3 on Colab" };
const sectionNames: Record<Section, string> = {
  overview: "Start here", sources: "Store & policies", assistant: "Try the assistant",
  tests: "Test cases", runs: "Results", compare: "Before & after",
};

async function requestJson(url: string, init?: RequestInit): Promise<Snapshot> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json() as Snapshot & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "An unexpected error occurred.");
  return data;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function StatusPill({ verdict }: { verdict: Verdict }) {
  return <span className={`status-pill status-${verdict}`}>
    {verdict === "pass" ? <CheckCircle2 size={14} /> : verdict === "fail" ? <CircleAlert size={14} /> : <Clock3 size={14} />}
    {verdictNames[verdict]}
  </span>;
}

function SectionHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="section-header"><div><div className="section-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{children && <div className="section-actions">{children}</div>}</div>;
}

export default function Dashboard({ displayName, aiConfigured, aiProvider, aiStatus }: { displayName: string; aiConfigured: boolean; aiProvider: "openai" | "ollama"; aiStatus: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [runningVersion, setRunningVersion] = useState<AssistantVersion | null>(null);
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [showNewCase, setShowNewCase] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [policy, setPolicy] = useState("");
  const [catalog, setCatalog] = useState<StoreData["catalog"]>([]);
  const [newCase, setNewCase] = useState({ title: "", category: "policy" as Category, severity: "high" as Severity, turns: "", expected: "", forbidden: "", evidence: "" });
  const [chatVersion, setChatVersion] = useState<AssistantVersion>("baseline");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "customer" | "assistant"; text: string; evidence?: string }[]>([]);
  const [chatBusy, setChatBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await requestJson("/api/workspace");
      setData(snapshot);
      setStoreName(snapshot.store.name);
      setPolicy(snapshot.store.policy);
      setCatalog(snapshot.store.catalog);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load workspace data."); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [section]);
  useEffect(() => {
    if (data?.runs.length && !selectedRunId) setSelectedRunId(data.runs[0].id);
  }, [data, selectedRunId]);

  const activeRun = data?.runs.find((run) => run.id === selectedRunId) ?? data?.runs[0];
  const activeResults = useMemo(() => data?.results.filter((result) => result.runId === activeRun?.id) ?? [], [data, activeRun]);
  const selectedResult = data?.results.find((result) => result.id === selectedResultId) ?? null;
  const selectedCase = selectedResult ? data?.cases.find((item) => selectedResult.caseId.endsWith(`:${item.id}`)) : null;
  const latestRun = data?.runs[0];
  const latestFailures = latestRun ? data?.results.filter((result) => result.runId === latestRun.id && result.verdict === "fail") ?? [] : [];
  const filteredCases = useMemo(() => data?.cases.filter((item) =>
    (category === "all" || item.category === category) &&
    (!search || `${item.title} ${item.turns.join(" ")}`.toLowerCase().includes(search.toLowerCase()))) ?? [], [data, search, category]);
  const baselineRun = data?.runs.find((run) => run.assistantVersion === "baseline");
  const revisedRun = data?.runs.find((run) => run.assistantVersion === "revised" && run.policyVersion === baselineRun?.policyVersion);
  const baselineCaseIds = new Set(data?.results.filter((result) => result.runId === baselineRun?.id).map((result) => result.caseId) ?? []);
  const revisedCaseIds = new Set(data?.results.filter((result) => result.runId === revisedRun?.id).map((result) => result.caseId) ?? []);
  const sameCaseSet = baselineCaseIds.size === revisedCaseIds.size && [...baselineCaseIds].every((id) => revisedCaseIds.has(id));
  const comparisonCases = data?.cases.filter((item) => baselineCaseIds.has(`${data.store.id}:${item.id}`) || revisedCaseIds.has(`${data.store.id}:${item.id}`)) ?? [];

  async function mutate(url: string, body: unknown, method = "POST", success = "Saved.") {
    setBusy(true); setNotice("");
    try {
      const snapshot = await requestJson(url, { method, body: JSON.stringify(body) });
      setData(snapshot); setNotice(success);
      return snapshot;
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not complete the action."); return null; }
    finally { setBusy(false); }
  }

  async function run(version: AssistantVersion) {
    setRunningVersion(version);
    try {
      const snapshot = await mutate("/api/runs", { version }, "POST", `Completed the test for ${assistantNames[version]}.`);
      if (snapshot) { setSelectedRunId(snapshot.runs[0].id); setSection(version === "revised" && baselineRun ? "compare" : "runs"); }
    } finally { setRunningVersion(null); }
  }

  async function exportColabPack() {
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/colab/export");
      if (!response.ok) {
        const error = await response.json() as { error?: string };
        throw new Error(error.error ?? "Could not export the test pack.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = "probeai_test_pack.json";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Test pack downloaded. Upload it to the Colab notebook, then import the results file.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not export the test pack."); }
    finally { setBusy(false); }
  }

  async function importColabResults(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 250_000) { setNotice("The results file exceeds the size limit."); return; }
    try {
      const body = JSON.parse(await file.text()) as unknown;
      const snapshot = await mutate("/api/colab/import", body, "POST", "Colab conversations were imported into the run history.");
      if (snapshot) { setSelectedRunId(snapshot.runs[0].id); setSection("runs"); }
    } catch { setNotice("The file is not valid JSON."); }
  }

  async function saveStore() {
    const parsed = catalog.map((product) => ({ ...product, sku: product.sku.trim(), name: product.name.trim(), features: product.features.map((feature) => feature.trim()).filter(Boolean) }));
    const snapshot = await mutate("/api/workspace", { name: storeName, policy, catalog: parsed }, "PUT", "Store sources were saved as a new version.");
    if (snapshot) setCatalog(snapshot.store.catalog);
  }

  async function createCase() {
    const snapshot = await mutate("/api/cases", { ...newCase, turns: newCase.turns.split("\n").map((turn) => turn.trim()).filter(Boolean) }, "POST", "Test case added. AI can assess it, but any judgment without sufficient evidence needs human review.");
    if (snapshot) { setShowNewCase(false); setNewCase({ title: "", category: "policy", severity: "high", turns: "", expected: "", forbidden: "", evidence: "" }); }
  }

  async function sendChat() {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    const next = [...chatMessages, { role: "customer" as const, text: message }];
    setChatMessages(next); setChatInput(""); setChatBusy(true); setNotice("");
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: chatVersion, history: next.map(({ role, text }) => ({ role, text })) }) });
      const answer = await response.json() as { text?: string; evidence?: string; error?: string };
      if (!response.ok || !answer.text) throw new Error(answer.error ?? "Could not answer the message.");
      setChatMessages([...next, { role: "assistant", text: answer.text, evidence: answer.evidence }]);
    } catch (error) { setChatMessages(chatMessages); setChatInput(message); setNotice(error instanceof Error ? error.message : "Could not answer the message."); }
    finally { setChatBusy(false); }
  }

  function navigate(next: Section) { setSection(next); setSidebarOpen(false); setNotice(""); }
  const nav = [
    { key: "overview" as Section, icon: LayoutDashboard }, { key: "sources" as Section, icon: BookOpenText },
    { key: "assistant" as Section, icon: Bot }, { key: "tests" as Section, icon: FlaskConical },
    { key: "runs" as Section, icon: ListChecks }, { key: "compare" as Section, icon: GitCompareArrows },
  ];

  return <div className="app-shell" dir="ltr">
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-top"><div className="brand"><span className="brand-mark">P<span>✦</span></span><div><strong>ProbeAI</strong><small>Assistant quality lab</small></div></div><button className="icon-button sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X size={20} /></button></div>
      <div className="sidebar-label">Workspace</div>
      <nav className="nav-list" aria-label="Main navigation">{nav.map(({ key, icon: Icon }) => <button key={key} className={`nav-item ${section === key ? "active" : ""}`} onClick={() => navigate(key)}><Icon size={19} strokeWidth={1.8} /><span>{sectionNames[key]}</span>{section === key && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-insight"><div className="insight-icon"><ShieldCheck size={20} /></div><strong>Evidence-backed tests</strong><p>Every finding links to a store rule or product record and can be reviewed.</p></div><div className="sidebar-user"><span className="user-avatar">{displayName.slice(0, 1).toUpperCase()}</span><div><strong>{displayName.split("@")[0]}</strong><small>Private workspace</small></div></div></div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="topbar-start"><button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu size={22} /></button><span className="breadcrumb">Workspace</span><ChevronRight size={15} /><strong>{sectionNames[section]}</strong></div><div className="topbar-end"><span className="demo-tag"><span /> {aiConfigured ? aiProvider === "ollama" ? "Local AI ready" : "AI configured" : "Demo ready"}</span><button className="topbar-store" onClick={() => navigate("sources")}><Store size={17} />{data?.store.name ?? "Loading"}<ChevronRight size={14} /></button></div></header>
      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={16} /></button></div>}
      {runningVersion && <div className="notice running-notice" role="status"><LoaderCircle className="spin" size={17} /><span>Running {runningVersion === "ai" && aiProvider === "ollama" ? "Local AI · 3 cases" : assistantNames[runningVersion]} tests and evaluating the evidence. {runningVersion === "ai" ? "This may take a few minutes. You can browse the workspace while it runs." : "Results will appear when the run finishes."}</span></div>}
      <main className="content">
        {!data ? <div className="loading-state"><LoaderCircle className="spin" size={30} /><span>Preparing your workspace...</span></div> : <>
          {section === "overview" && <>
            <SectionHeader eyebrow="Start here" title="Test your store assistant step by step" description="Review the store sources, try a difficult request, inspect the evidence, and compare the fix." />
            <div className="intro-callout"><ShieldCheck size={20} /><p><strong>Ready-to-run demo:</strong> The baseline deliberately makes mistakes so you can see how ProbeAI finds them. These numbers demonstrate the workflow, not general AI accuracy.</p></div>
            <section className="guided-flow" aria-label="How to use ProbeAI"><div className="guided-head"><div><span className="section-eyebrow">Quick path</span><h2>From store policy to a verified fix</h2></div><span className="guided-count">4 steps</span></div><div className="guided-grid">
              <div className="guided-step"><span className="step-number">1</span><BookOpenText size={20} /><h3>Review sources</h3><p>The policy and catalog are the reference for each judgment.</p><button className="button button-outline" onClick={() => navigate("sources")}>Open store sources <ArrowRight size={15} /></button></div>
              <div className="guided-step"><span className="step-number">2</span><Bot size={20} /><h3>Try a difficult request</h3><p>See how the assistant handles a late return.</p><button className="button button-outline" disabled={chatBusy} onClick={() => { setChatVersion("baseline"); setChatMessages([]); setChatInput("I received the headphones 20 days ago. An employee promised a full refund. Please confirm it."); navigate("assistant"); }}>Open the chat <ArrowRight size={15} /></button></div>
              <div className="guided-step guided-step-primary"><span className="step-number">3</span><FlaskConical size={20} /><h3>Run the tests</h3><p>Read the failing conversation and its policy evidence.</p><button className="button button-primary" disabled={busy} onClick={() => void run("baseline")}>Test the baseline <Play size={15} /></button></div>
              <div className="guided-step"><span className="step-number">4</span><GitCompareArrows size={20} /><h3>Compare before and after</h3><p>Run the same cases on the revised assistant.</p><button className="button button-outline" disabled={busy || !baselineRun} onClick={() => revisedRun ? navigate("compare") : void run("revised")}>{revisedRun ? "View comparison" : "Test the revised version"} <ArrowRight size={15} /></button></div>
            </div></section>
            <div className="metric-grid">
              <div className="metric-card"><div className="metric-top"><span>Test cases</span><span className="metric-icon indigo"><FlaskConical size={19} /></span></div><strong>{data.cases.length}</strong><small>Across 4 core categories</small></div>
              <div className="metric-card"><div className="metric-top"><span>Latest run</span><span className="metric-icon cyan"><Activity size={19} /></span></div><strong>{latestRun ? `${latestRun.total} cases` : "—"}</strong><small>{latestRun ? shortDate(latestRun.createdAt) : "Not run yet"}</small></div>
              <div className="metric-card"><div className="metric-top"><span>Issues found</span><span className="metric-icon coral"><CircleAlert size={19} /></span></div><strong>{latestRun?.failed ?? "—"}</strong><small>{latestRun ? "In the latest run" : "Shown after the first test"}</small></div>
              <div className="metric-card"><div className="metric-top"><span>Policy version</span><span className="metric-icon mint"><BookOpenText size={19} /></span></div><strong>v{data.store.policyVersion}</strong><small>Current test reference</small></div>
            </div>
            <div className="overview-grid"><section className="panel explain-panel"><span className="section-eyebrow">Understand the results</span><h2>Every result has a conversation and evidence</h2><p>Open a case to see the assistant reply, expected behavior, and the policy or product record behind the judgment.</p><div className="explain-example"><span className="status-pill status-fail"><CircleAlert size={14} /> Issue</span><span>Refund promised after 20 days</span><ArrowRight size={16} /><span>Policy requires documented approval after 14 days</span></div><button className="text-action" onClick={() => navigate("runs")}>View saved results <ArrowRight size={15} /></button></section>
            <section className="panel risk-panel"><div className="panel-heading"><div><p className="section-eyebrow">Latest run</p><h2>Cases to review</h2></div><button className="text-action" onClick={() => navigate("runs")}>View all <ArrowRight size={15} /></button></div>{latestFailures.length ? <div className="risk-list">{latestFailures.slice(0, 4).map((result) => { const item = data.cases.find((c) => result.caseId.endsWith(`:${c.id}`)); return <button key={result.id} onClick={() => { setSelectedResultId(result.id); navigate("runs"); }}><span className="risk-bullet"><CircleAlert size={17} /></span><span><strong>{item?.title ?? "Test case"}</strong><small>{item ? categoryNames[item.category] : ""}</small></span><ChevronRight size={17} /></button>; })}</div> : <div className="empty-mini"><ShieldCheck size={28} /><strong>{latestRun?.needsReview ? `${latestRun.needsReview} cases need review` : latestRun ? "No issues in this run" : "Ready for the first test"}</strong><p>{latestRun?.needsReview ? "Open run history and inspect the responses before confirming a result." : latestRun ? "Review passed cases or compare versions." : "Run the baseline to see important cases here."}</p></div>}</section></div>
          </>}

          {section === "assistant" && <><SectionHeader eyebrow="Step 2 of 4" title="Try the store assistant" description="This is the same assistant used by the test lab, with the current store policy and catalog."><button className="button button-soft" disabled={chatBusy} onClick={() => setChatMessages([])}><RefreshCw size={16} /> New chat</button></SectionHeader>
            <div className="mode-banner"><span className="mode-icon"><Bot size={19} /></span><div><strong>{chatVersion === "ai" ? "Live AI assistant" : "Built-in demo assistant"}</strong><p>{chatVersion === "ai" ? aiStatus : "Start with the baseline, which has intentional mistakes. Switch to Revised to see how the answer changes. Both use the saved store sources."}</p></div></div>
            <div className="chat-layout"><section className="panel chat-panel"><div className="chat-panel-head"><div className="chat-agent-avatar"><Bot size={21} /></div><div><strong>Horizon Assistant</strong><small>Test environment · policy v{data.store.policyVersion}</small></div><div className="chat-version"><button className={chatVersion === "baseline" ? "chosen" : ""} disabled={chatBusy} onClick={() => { setChatVersion("baseline"); setChatMessages([]); }}>Baseline</button><button className={chatVersion === "revised" ? "chosen" : ""} disabled={chatBusy} onClick={() => { setChatVersion("revised"); setChatMessages([]); }}>Revised</button><button className={chatVersion === "ai" ? "chosen" : ""} disabled={!aiConfigured || chatBusy} onClick={() => { setChatVersion("ai"); setChatMessages([]); }}>{aiProvider === "ollama" ? "Local AI" : "AI assistant"}</button></div></div><div className="chat-stream">{chatMessages.length === 0 ? <div className="chat-welcome"><span><MessageSquareText size={28} /></span><h2>Start a test conversation</h2><p>Ask about a return, price, or order status, then switch versions to compare answers.</p><div>{["I received the headphones 20 days ago. Can I return them?", "How much do Horizon Headphones cost?", "Has my order shipped?"].map((example) => <button key={example} onClick={() => setChatInput(example)}>{example}</button>)}</div></div> : chatMessages.map((message, index) => <div className={`chat-bubble ${message.role}`} key={index}><small>{message.role === "customer" ? "Customer" : "Store assistant"}</small><p>{message.text}</p>{message.evidence && message.evidence !== "No specific source is available for this request yet." && <div className="chat-evidence"><BookOpenText size={13} />{message.evidence}</div>}</div>)}{chatBusy && <div className="chat-typing"><LoaderCircle className="spin" size={17} /> Checking the sources...</div>}</div><div className="chat-composer"><textarea value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder="Write a customer message..." rows={2} /><button className="button button-primary" disabled={chatBusy || !chatInput.trim()} onClick={() => void sendChat()}><SendHorizontal size={17} /> Send</button></div></section><aside className="chat-side"><section className="panel chat-side-card"><p className="section-eyebrow">Live AI</p><h3>{aiConfigured ? "Model ready" : "Model unavailable"}</h3><p>{aiStatus}</p>{aiConfigured && <button className="text-action" disabled={chatBusy} onClick={() => { setChatVersion("ai"); setChatMessages([]); }}>Try {aiProvider === "ollama" ? "Local AI" : "AI assistant"} <ArrowRight size={15} /></button>}</section><section className="panel chat-side-card"><p className="section-eyebrow">How to test it</p><h3>Try a difficult request</h3><p>Start with a normal question, then add a detail that changes the decision: an expired window, a verbal promise, or a new address.</p><div className="side-steps"><span>1</span> Ask about a policy or product</div><div className="side-steps"><span>2</span> Change a detail in the second message</div><div className="side-steps"><span>3</span> Compare the two answers</div></section><section className="panel chat-side-card"><p className="section-eyebrow">Sources used</p><h3>Policy v{data.store.policyVersion}</h3><p>{data.store.policy.split("\n").length} policy rules · {data.store.catalog.length} products</p><button className="text-action" onClick={() => navigate("sources")}>View source records <ArrowRight size={15} /></button></section></aside></div>
            <div className="page-next"><div><strong>Seen the assistant's response?</strong><p>Next, run the saved cases and inspect each issue with its evidence.</p></div><button className="button button-primary" onClick={() => navigate("tests")}>Open test cases <ArrowRight size={16} /></button></div>
          </>}

          {section === "tests" && <><SectionHeader eyebrow="Step 3 of 4" title="Test the assistant on difficult cases" description={"You have " + data.cases.length + " cases in four categories. Run a version, then open a result to review its evidence."}><button className="button button-soft" onClick={() => setShowNewCase(true)}><Plus size={17} /> Add a case</button><button className="button button-primary" disabled={busy} onClick={() => void run("baseline")}><Play size={17} /> Test Baseline</button></SectionHeader>
            <div className="test-guidance"><div><strong>Start with the baseline</strong><p>Its mistakes are intentional. After reviewing results, run Revised and compare the two rounds.</p></div><button className="button button-outline" disabled={busy || !baselineRun} onClick={() => void run("revised")}>Test Revised <ArrowRight size={15} /></button></div>
            <div className="toolbar"><div className="searchbox"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cases or messages..." /></div><div className="filter-pills"><button className={category === "all" ? "chosen" : ""} onClick={() => setCategory("all")}>All <span>{data.cases.length}</span></button>{(Object.keys(categoryNames) as Category[]).map((key) => <button key={key} className={category === key ? "chosen" : ""} onClick={() => setCategory(key)}>{categoryNames[key]}</button>)}</div></div>
            <div className="case-grid">{filteredCases.map((item, index) => <article key={item.id} className="case-card"><div className="case-top"><span className="case-number">#{String(index + 1).padStart(2, "0")}</span><span className={`severity severity-${item.severity}`}>{severityNames[item.severity]}</span></div><div className="case-icon"><MessageSquareText size={20} /></div><h3>{item.title}</h3><p>{item.turns.at(-1)}</p><div className="case-bottom"><span>{categoryNames[item.category]}</span><span>{item.turns.length} {item.turns.length === 1 ? "message" : "messages"} <ChevronRight size={15} /></span></div></article>)}</div>
            {filteredCases.length === 0 && <div className="empty-state">No cases match your search.</div>}
            <details className="advanced-tests"><summary>Advanced AI and Google Colab options</summary><div className="advanced-tests-body"><p>{aiStatus}</p>{aiProvider === "ollama" && <p>The local AI test runs three high-risk cases sequentially. Results may take a few minutes on this computer.</p>}<div className="colab-actions"><button className="button button-outline" disabled={busy || !aiConfigured} onClick={() => void run("ai")}>{aiProvider === "ollama" ? "Test Local AI · 3 cases" : "Test OpenAI"}</button><a className="button button-outline" href="/probeai_colab_runner.ipynb" download>Download Qwen3 notebook</a><button className="button button-outline" disabled={busy} onClick={() => void exportColabPack()}>Export cases for Colab</button><label className="button button-outline">Import Colab results<input type="file" accept=".json,application/json" hidden disabled={busy} onChange={(event) => void importColabResults(event)} /></label><a className="button button-outline" href="https://colab.research.google.com/" target="_blank" rel="noreferrer">Open Colab</a></div></div></details>
          </>}

          {section === "runs" && <><SectionHeader eyebrow="Test results" title="See where the assistant went wrong" description="Choose a run, then open a case to read the conversation and evidence. Run Revised when you are ready to compare."><button className="button button-primary" disabled={busy || !baselineRun} onClick={() => void run("revised")}><RefreshCw size={17} /> Test Revised and compare</button></SectionHeader>
            {data.runs.length === 0 ? <div className="large-empty"><span className="large-empty-icon"><Play size={26} /></span><h2>No runs yet</h2><p>Run the suite on Baseline, review the issues, then try Revised.</p><button className="button button-primary" disabled={busy} onClick={() => void run("baseline")}>Run the first test</button></div> : <div className="runs-layout"><div className="run-list panel"><div className="panel-heading"><h2>Runs</h2><span className="count-tag">{data.runs.length}</span></div>{data.runs.map((runItem) => <button key={runItem.id} className={`run-item ${activeRun?.id === runItem.id ? "selected" : ""}`} onClick={() => setSelectedRunId(runItem.id)}><span className={`run-mark ${runItem.assistantVersion}`}><Activity size={17} /></span><span><strong>{assistantNames[runItem.assistantVersion]}</strong><small>{shortDate(runItem.createdAt)} · Policy v{runItem.policyVersion}</small></span><span className="run-fails">{runItem.failed} {runItem.failed === 1 ? "issue" : "issues"} · {runItem.needsReview} {runItem.needsReview === 1 ? "review" : "reviews"}</span></button>)}</div><div className="run-detail"><div className="run-summary panel"><div><span>Run summary</span><h2>{activeRun ? assistantNames[activeRun.assistantVersion] : ""}</h2><p>{activeRun ? shortDate(activeRun.createdAt) : ""} · Policy v{activeRun?.policyVersion}</p></div><div className="run-stat"><strong>{activeRun?.passed}</strong><span>Passed</span></div><div className="run-stat danger"><strong>{activeRun?.failed}</strong><span>Issues</span></div><div className="run-stat"><strong>{activeRun?.needsReview}</strong><span>Needs review</span></div></div><div className="panel results-panel"><div className="panel-heading"><h2>Case results</h2><span className="count-tag">{activeResults.length}</span></div>{activeResults.map((result) => { const item = data.cases.find((c) => result.caseId.endsWith(`:${c.id}`)); return <button className="result-row" key={result.id} onClick={() => setSelectedResultId(result.id)}><div><strong>{item?.title ?? "Test case"}</strong><small>{item ? categoryNames[item.category] : ""}</small></div><StatusPill verdict={result.verdict} /><ChevronRight size={16} /></button>; })}</div></div></div>}
          </>}

          {section === "compare" && <><SectionHeader eyebrow="Step 4 of 4" title="Version comparison" description="The same cases and policy version make improvements and regressions easy to see."><button className="button button-soft" disabled={busy} onClick={() => void run("baseline")}>Test Baseline</button><button className="button button-primary" disabled={busy} onClick={() => void run("revised")}>Test Revised</button></SectionHeader>
            {baselineRun && revisedRun ? <><div className="compare-hero"><div className="compare-side"><span>Before</span><h2>Baseline</h2><strong>{baselineRun.failed}</strong><small>issues · policy v{baselineRun.policyVersion}</small></div><div className="compare-center"><GitCompareArrows size={25} /><span>{!sameCaseSet ? "Case sets differ" : baselineRun.failed > revisedRun.failed ? "Clear improvement" : baselineRun.failed === revisedRun.failed ? "No change in issues" : "Regression needs review"}</span></div><div className="compare-side after"><span>After</span><h2>Revised</h2><strong>{revisedRun.failed}</strong><small>issues · policy v{revisedRun.policyVersion}</small></div></div>{!sameCaseSet && <div className="source-note"><CircleAlert size={20} /><div><strong>Comparison is incomplete</strong><p>The case set changed between runs. Rerun both versions on the same set for a valid comparison.</p></div></div>}<div className="panel comparison-list"><div className="panel-heading"><h2>Change by case</h2><span className="count-tag">{comparisonCases.length} cases</span></div>{comparisonCases.map((item) => { const before = data.results.find((result) => result.runId === baselineRun.id && result.caseId.endsWith(`:${item.id}`)); const after = data.results.find((result) => result.runId === revisedRun.id && result.caseId.endsWith(`:${item.id}`)); const change = !before || !after ? "incomplete" : before.verdict === "fail" && after.verdict === "pass" ? "fixed" : before.verdict === "pass" && after.verdict === "fail" ? "regressed" : "unchanged"; return <div className="comparison-row" key={item.id}><div><strong>{item.title}</strong><small>{categoryNames[item.category]}</small></div><span className={`change-tag change-${change}`}>{change === "fixed" ? <><ArrowDownLeft size={15} /> Fixed</> : change === "regressed" ? <><ArrowUpRight size={15} /> Regressed</> : change === "incomplete" ? "Missing result in one or both runs" : "Unchanged"}</span><div className="comparison-verdicts">{before && <StatusPill verdict={before.verdict} />}<ArrowRight size={15} />{after && <StatusPill verdict={after.verdict} />}</div></div>; })}</div></> : <div className="large-empty"><span className="large-empty-icon"><GitCompareArrows size={27} /></span><h2>Run both versions to compare</h2><p>Comparison needs Baseline and Revised runs on the same policy version.</p><div className="empty-actions"><button className="button button-outline" disabled={busy} onClick={() => void run("baseline")}>Test Baseline</button><button className="button button-primary" disabled={busy} onClick={() => void run("revised")}>Test Revised</button></div></div>}
          </>}

          {section === "sources" && <>
            <SectionHeader eyebrow="Step 1 of 4" title="Review store information" description="ProbeAI compares assistant replies with these sources. Leave them as they are for the demo." />
            <div className="source-note"><ShieldCheck size={20} /><div><strong>Current policy version: v{data.store.policyVersion}</strong><p>If you edit the policy or products, save a new version before running tests.</p></div></div>
            <div className="source-grid"><section className="panel source-panel"><div className="panel-heading"><div><p className="section-eyebrow">Store policies</p><h2>Customer support rules</h2></div><Settings2 size={19} /></div><div className="policy-list">{policy.split("\n").map((rule) => rule.trim()).filter(Boolean).map((rule, index) => <div className="policy-item" key={index}><span>{index + 1}</span><p>{rule}</p></div>)}</div><details className="catalog-advanced"><summary>Edit store name and policy</summary><label>Store name<input value={storeName} onChange={(event) => setStoreName(event.target.value)} /></label><label>Policy text<textarea className="policy-input" value={policy} onChange={(event) => setPolicy(event.target.value)} /></label><p className="field-help">Put each rule on a separate line. Save after making changes.</p></details></section>
            <section className="panel source-panel"><div className="panel-heading"><div><p className="section-eyebrow">Product catalog</p><h2>Saved products</h2></div><Store size={19} /></div><div className="product-list">{data.store.catalog.map((product) => <div className="product-item" key={product.sku}><div><strong>{product.name}</strong><small>{product.sku} · {product.features.join(", ")}</small></div><div><b>EGP {product.price}</b><span>{product.stock > 0 ? product.stock + " in stock" : "Out of stock"}</span></div></div>)}</div><details className="catalog-advanced"><summary>Edit products</summary><p>Update the product fields below, then select Save changes.</p><div className="product-editor-list">{catalog.map((product, index) => <fieldset className="product-editor" key={index}><legend>Product {index + 1}</legend><div className="form-grid"><label>SKU<input value={product.sku} onChange={(event) => setCatalog(catalog.map((item, i) => i === index ? { ...item, sku: event.target.value } : item))} /></label><label>Product name<input value={product.name} onChange={(event) => setCatalog(catalog.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></label><label>Price (EGP)<input type="number" min="0" step="0.01" value={product.price} onChange={(event) => setCatalog(catalog.map((item, i) => i === index ? { ...item, price: Number(event.target.value) } : item))} /></label><label>Stock quantity<input type="number" min="0" step="1" value={product.stock} onChange={(event) => setCatalog(catalog.map((item, i) => i === index ? { ...item, stock: Number(event.target.value) } : item))} /></label><label className="full">Features — one per line<textarea rows={3} value={product.features.join("\n")} onChange={(event) => setCatalog(catalog.map((item, i) => i === index ? { ...item, features: event.target.value.split("\n") } : item))} /></label></div><button className="text-action" onClick={() => setCatalog(catalog.filter((_, i) => i !== index))}>Remove from draft</button></fieldset>)}</div><button className="button button-outline" onClick={() => setCatalog([...catalog, { sku: `P-${Date.now()}`, name: "", price: 0, stock: 0, features: [] }])}><Plus size={15} /> Add product</button></details></section></div>
            <div className="page-next"><div><strong>Finished reviewing the sources?</strong><p>Now try a difficult return request with the store assistant.</p></div><div><button className="button button-outline" disabled={busy} onClick={() => void saveStore()}><Check size={16} /> Save changes</button><button className="button button-primary" disabled={chatBusy} onClick={() => { setChatVersion("baseline"); setChatMessages([]); setChatInput("I received the headphones 20 days ago. An employee promised a full refund. Please confirm it."); navigate("assistant"); }}>Next: try the assistant <ArrowRight size={16} /></button></div></div>
          </>}
        </>}
      </main>
    </div>

    {selectedResult && <div className="drawer-backdrop" onClick={() => setSelectedResultId(null)}><aside className="detail-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><div><span className="section-eyebrow">Case evidence</span><h2>{selectedCase?.title ?? "Case details"}</h2></div><button className="icon-button" onClick={() => setSelectedResultId(null)} aria-label="Close details"><X size={21} /></button></div><div className="drawer-scroll"><div className="drawer-status"><StatusPill verdict={selectedResult.verdict} /><span>{selectedCase && severityNames[selectedCase.severity]}</span></div><h3>Conversation</h3><div className="transcript">{selectedResult.transcript.map((message, index) => <div key={index} className={`message ${message.role}`}><small>{message.role === "customer" ? "Customer" : "Store assistant"}</small><p>{message.text}</p></div>)}</div><div className="evidence-card"><span><BookOpenText size={16} /> Evidence from the source of truth</span><blockquote>{selectedResult.evidence}</blockquote></div><div className="judgment-grid"><div><span>Expected behavior</span><p>{selectedResult.expected}</p></div><div><span>Reason for judgment</span><p>{selectedResult.explanation}</p></div></div><div className="review-box"><strong>Review judgment</strong><p>Your decision is saved with this result and separates confirmed judgments from uncertain ones.</p><div><button className={`button ${selectedResult.reviewStatus === "confirmed" ? "button-primary" : "button-outline"}`} disabled={busy} onClick={() => void mutate("/api/review", { resultId: selectedResult.id, reviewStatus: "confirmed" }, "POST", "Judgment confirmed.")}>Confirm judgment</button><button className={`button ${selectedResult.reviewStatus === "rejected" ? "button-primary" : "button-outline"}`} disabled={busy} onClick={() => void mutate("/api/review", { resultId: selectedResult.id, reviewStatus: "rejected" }, "POST", "Judgment rejected.")}>Reject judgment</button></div></div></div></aside></div>}

    {showNewCase && <div className="modal-backdrop" onClick={() => setShowNewCase(false)}><div className="case-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><p className="section-eyebrow">NEW TEST CASE</p><h2>Add a test case</h2></div><button className="icon-button" onClick={() => setShowNewCase(false)} aria-label="Close"><X size={20} /></button></div><p className="modal-intro">Enter a short conversation and expected behavior. New cases remain Needs review until a reliable evaluation rule is added.</p><div className="form-grid"><label>Case title<input value={newCase.title} onChange={(event) => setNewCase({ ...newCase, title: event.target.value })} placeholder="Example: undocumented exception" /></label><label>Category<select value={newCase.category} onChange={(event) => setNewCase({ ...newCase, category: event.target.value as Category })}>{(Object.keys(categoryNames) as Category[]).map((key) => <option key={key} value={key}>{categoryNames[key]}</option>)}</select></label><label>Severity<select value={newCase.severity} onChange={(event) => setNewCase({ ...newCase, severity: event.target.value as Severity })}>{(Object.keys(severityNames) as Severity[]).map((key) => <option key={key} value={key}>{severityNames[key]}</option>)}</select></label><label className="full">Customer messages — one per line<textarea rows={4} value={newCase.turns} onChange={(event) => setNewCase({ ...newCase, turns: event.target.value })} /></label><label className="full">Expected behavior<textarea rows={2} value={newCase.expected} onChange={(event) => setNewCase({ ...newCase, expected: event.target.value })} /></label><label className="full">Forbidden behavior or evidence source — optional<input value={newCase.forbidden} onChange={(event) => setNewCase({ ...newCase, forbidden: event.target.value })} /></label></div><div className="modal-actions"><button className="button button-outline" onClick={() => setShowNewCase(false)}>Cancel</button><button className="button button-primary" disabled={busy} onClick={() => void createCase()}><Plus size={16} /> Add case</button></div></div></div>}
  </div>;
}

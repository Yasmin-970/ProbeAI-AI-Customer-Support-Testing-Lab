import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
import Dashboard from "./dashboard";
import { modelAvailability, modelProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return <main className="signin-screen" dir="ltr">
      <div className="signin-card">
        <div className="brand-mark">P<span>✦</span></div>
        <p className="eyebrow">Customer support assistant testing lab</p>
        <h1>Find the mistakes before your customers do.</h1>
        <p>Test realistic conversations, inspect the evidence behind every finding, and compare the impact of a fix before release.</p>
        <a className="button button-primary" href={chatGPTSignInPath("/")} target="_top">Sign in to get started →</a>
      </div>
    </main>;
  }
  const model = await modelAvailability();
  return <Dashboard displayName={user.displayName} aiConfigured={model.ready} aiProvider={modelProvider()} aiStatus={model.message} />;
}

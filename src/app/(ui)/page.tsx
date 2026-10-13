import { headers } from "next/headers";
import { listCatalog } from "@/agent/search";
import { LIVE_TERMS } from "@/agent/search/channel3";
import { Shell } from "@/components/Shell";
import { config } from "@/lib/config";
import "./styles.css";

export default async function Home() {
  // Reading the per-request nonce also makes the page render dynamically, which a nonce-based policy requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main id="home">
      <header>
        <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <path
            d="M8 12h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2zM8 12l11-3v3M20 17.5h1"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1>AgentPurse</h1>
        <nav aria-label="Sections">
          <a href="#home">Home</a>
          <a href="#store">Store</a>
          <a href="#passbook">Passbook</a>
          <a href="#audit">Audit log</a>
        </nav>
        <span className="badge">Sandbox, no real money</span>
      </header>
      <p className="tagline">
        AI proposes. Policy engine decides. You approve. PayPal settles.
      </p>
      <Shell
        nonce={nonce}
        products={listCatalog()}
        liveTerms={config.CHANNEL3_API_KEY ? LIVE_TERMS : undefined}
      />
    </main>
  );
}

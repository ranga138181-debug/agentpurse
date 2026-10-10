import { headers } from "next/headers";
import { AuditTable } from "@/components/AuditTable";
import { MandateApp } from "@/components/MandateApp";
import "./styles.css";

export default async function Home() {
  // Reading the per-request nonce also makes the page render dynamically, which a nonce-based policy requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <main>
      <h1>AgentPurse</h1>
      <p>AI proposes. Policy engine decides. You approve. PayPal settles.</p>
      <MandateApp nonce={nonce} />
      <AuditTable />
    </main>
  );
}

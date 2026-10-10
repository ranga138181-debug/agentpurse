import { AuditTable } from "@/components/AuditTable";
import { MandateApp } from "@/components/MandateApp";
import "./styles.css";

export default function Home() {
  return (
    <main>
      <h1>AgentPurse</h1>
      <p>AI proposes. Policy engine decides. You approve. PayPal settles.</p>
      <MandateApp />
      <AuditTable />
    </main>
  );
}

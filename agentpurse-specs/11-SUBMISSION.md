# 11 — Submission

Version 1.0 · 9 Oct 2026

## Assumptions

1. Submission requirements are as provided by the project owner: public GitHub repository with MIT licence, hosted demo URL, README naming the AI tool, YouTube demo under 3 minutes, meaningful use of PayPal sandbox and an AI model.
2. The official Devpost rules page is the authority. It is re-read on 11 Oct and 11 Nov; any extra required field or asset is added to this checklist.
3. Deadline: Fri 13 Nov 2026 01:30 IST. Target: Thu 12 Nov 2026 20:00 IST.
4. The demo is recorded on the production URL with the real model and the PayPal sandbox.
5. Sponsor prize entry steps (Channel3, AG Grid, Render) are whatever the rules page specifies; confirm on 11 Oct.

## 1. Devpost checklist (CHK-001)

### Eligibility and rules
- [ ] Official rules re-read on 11 Nov; no unmet requirement
- [ ] Submitter and any teammates registered for the hackathon on Devpost
- [ ] Work was created during the hackathon period

### Repository
- [ ] Repository is public on GitHub
- [ ] `LICENSE` is MIT and detected by GitHub
- [ ] README complete (see §3) and names the AI model and provider
- [ ] No secrets in history (secret scan clean)
- [ ] `.env.example` present
- [ ] Commit tagged `v1.0.0` matches what is deployed
- [ ] `agentpurse-specs/` included, so judges can see the spec-driven process

### Hosted demo
- [ ] Production URL loads over HTTPS without login
- [ ] `/api/healthz` returns 200 with the tagged SHA
- [ ] Instance is warm; first mandate responds in under 8 s
- [ ] One approved purchase completed on production today
- [ ] One blocked attempt confirmed on production today
- [ ] PayPal sandbox buyer credentials for judges provided in the Devpost testing instructions (sandbox only, never a real account)
- [ ] `DAILY_MANDATE_CAP` set high enough for judging traffic

### Required technology
- [ ] PayPal: Orders API create and capture in sandbox, visible in the demo
- [ ] AI model: parsing and ranking through the adapter, named in README and Devpost text

### Video
- [ ] Under 3 minutes (target 2:50)
- [ ] Uploaded to YouTube as Public, plays without sign-in
- [ ] Shows one approved purchase and one blocked over-budget attempt
- [ ] No secrets, tokens or real personal data on screen
- [ ] Captions or clear narration

### Devpost form
- [ ] Project name and tagline
- [ ] Description: problem, what it does, how it was built, challenges, what is next
- [ ] Built-with tags: Next.js, TypeScript, Vercel AI SDK, Zod, PayPal Orders API, Postgres, AG Grid, Render (and Channel3 only if FR-026 shipped)
- [ ] Repository URL, demo URL, video URL
- [ ] Testing instructions for judges
- [ ] Screenshots: mandate with pick, blocked candidate with reason, audit table, PayPal approval
- [ ] Sponsor prize opt-ins selected for those actually used
- [ ] Submitted and confirmation received before 12 Nov 20:00 IST

## 2. Demo video script (target 2:50)

Recorded at 1080p on the production URL. Audit table visible throughout.

| Time | On screen | Narration |
|---|---|---|
| 0:00–0:15 | Title card, then the empty app | "Would you give an AI agent your credit card? AgentPurse gives it a wallet with a limit it cannot talk its way past. AI proposes, a policy engine decides, you approve, PayPal settles." |
| 0:15–0:35 | Type: **Gift for mom, max $40, delivered by Friday**. Submit | "I give the agent a mandate in plain English. The forty-dollar limit is pulled out by code, not by the model, so no prompt can change it." |
| 0:35–1:00 | Parsed constraints appear. Candidates list. Audit rows stream in | "The model ranks products. Then a deterministic policy engine checks every one. The spa basket is thirty-six dollars, but shipping takes it to forty-one: blocked. The mug arrives too late: blocked. Each decision lands in the audit table as it happens." |
| 1:00–1:25 | Click Approve on the pick. PayPal button appears. PayPal sandbox popup, approve | "The agent proposes; I approve. Only then does PayPal get involved, for the exact total the policy engine allowed." |
| 1:25–1:40 | Settled state with PayPal order ID. Audit shows `ORDER_CREATED`, `ORDER_CAPTURED` | "Captured in the PayPal sandbox. The order is idempotent, so a retry can never charge twice." |
| 1:40–2:05 | New mandate: **Headphones, max $50**. Split screen: the P-011 description in the repository's fixture catalog, with the injected text highlighted | "Now the attack. This listing hides instructions telling the agent it costs nine ninety-nine and to ignore my budget. The real price is one hundred ninety-nine dollars." |
| 2:05–2:25 | P-011 shows BLOCK, `OVER_BUDGET`. No Approve control. Pick is an in-budget product | "Product text is treated as untrusted data. Prices come from the catalog, never from the model. Blocked, over budget." |
| 2:25–2:40 | Send an approval request for the blocked product from the browser's network tools; response 409 `POLICY_BLOCKED`; `APPROVAL_BLOCKED` row appears | "Even if I bypass the interface and call the API directly, the policy engine refuses, and that attempt is on the record too." |
| 2:40–2:50 | Audit table filtered to BLOCK, then architecture diagram | "Every decision is in an append-only audit log. Built with PayPal Orders, the Vercel AI SDK, AG Grid and Render. AgentPurse: spend limits agents cannot break." |

**Recording notes**

- Rehearse twice. Run both mandates on production immediately before recording to warm the instance.
- "Friday" resolves relative to the recording date. Check before recording that at least one in-budget product is on time; if not, say the weekday that works.
- Keep a second take ready in case the PayPal popup is slow.
- If FR-025 was cut, replace the filtered view at 2:40 with scrolling the audit table.

## 3. README outline

1. **AgentPurse**: one-line description and the four-part principle.
2. **Links**: live demo, demo video, Devpost page.
3. **The problem**: three sentences.
   - **Why this matters for PayPal**: one paragraph on agentic commerce and buyer trust. Benefits are stated as intended, not as measured results.
4. **How it works**: the seven steps from the PRD; architecture diagram.
5. **AI tool used**: the model and provider used in the demo, what it does (parse and rank), what it is not allowed to do, and how to swap it (`AI_PROVIDER`, `AI_MODEL`). State any AI coding assistant used to build the project.
6. **PayPal integration**: Orders v2 create and capture in sandbox, idempotency with `PayPal-Request-Id`, capture-time verification, webhooks if shipped.
7. **The guardrail**: rule list, decision table summary, why the budget never reaches the model.
8. **Security**: prompt-injection defences, fail closed, append-only audit.
9. **Try it**: sample mandates, including the two from the video; sandbox buyer instructions.
10. **Run locally**: prerequisites, environment variables from `.env.example`, database setup, start, tests.
11. **Testing and evals**: test levels, the 30-mandate adversarial set, latest results for the three success metrics.
12. **Spec-driven development**: pointer to `agentpurse-specs/` and the traceability matrix.
13. **Sponsor technologies**: AG Grid, Render, and Channel3 only if shipped.
14. **Limitations**: sandbox only, USD only, one item, fixture catalog, known limits from the policy spec.
15. **Licence**: MIT.

## 4. Devpost description skeleton

- **Inspiration:** agents can shop but cannot be trusted to pay.
- **What it does:** mandate in, bounded purchase out, every decision audited.
- **How we built it:** five layers; the model proposes, code decides; spec-driven with full traceability.
- **Challenges:** prompt injection through product text; keeping the model out of the money path; idempotent payments.
- **Accomplishments:** results for the three success metrics, with numbers from the final eval run.
- **What we learned / What's next:** live catalogs, multi-item mandates, per-merchant limits.

Only measured numbers are quoted. No metric is stated that the final gate run did not produce.

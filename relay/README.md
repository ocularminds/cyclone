# Cyclone relay (live mode)

Node/TypeScript relay between the policy gate (Decionis AgentSafe) and the headset (C35, AGENTS.md §8.1).
It holds every credential, runs `@decionis/verify` server-side, and is the only thing the headset's
`LiveAdapter` talks to. Demo mode never needs it. Every upstream call cites the section of
`docs/agentsafe.md` it implements; nothing undocumented is invented (see "Stubbed pending H1").

```bash
npm install
npm test                  # vitest: relay, verification, webhook, policy, agent, C49 pipeline (no network, no credentials)
npm run typecheck
npm start                 # tsx src/main.ts, port 8787
npm run check:fixtures    # C49: fails if any recorded dossier / fixture does not verify (passes trivially when none)
npm run record:export     # C49: verified recordings → app/src/scenario/fixtures.json
npm run keygen            # Ed25519 presence-attestation key (H1 registers its public JWK)
npm run register:key      # POST /v1/execution/provider-keys (dry run without credentials)
npm run policy:push       # POST /v1/protocol/policies/bundles with policy/cyclone.json (dry run without credentials)
```

## Environment

| Variable | Meaning |
| --- | --- |
| `PORT`, `HOST` | Listen address (8787, 0.0.0.0) |
| `RELAY_SESSIONS` | Headset sessions, `token:subject,token2:subject2` (static until real login). No sessions → every decision is 401 |
| `RELAY_AGENT_TOKEN` | Bearer token the scripted agent uses for `POST /held` (also accepted on the WebSocket) |
| `RELAY_ORIGINS` | CORS allow-list for the headset origin (default `*`; set it to the Pages origin) |
| `DECIONIS_API_KEY`, `DECIONIS_ORG_ID`, `DECIONIS_API_BASE` | Org API key, org uuid (= `tenant_id`), API base (`https://api.decionis.com`) — **H1** |
| `RELAY_ATTEST_KEY`, `RELAY_ATTEST_KID`, `RELAY_ATTEST_ISSUER` | Presence-attestation key (PEM text, PEM path or private JWK), its `kid` and `iss` — **H1** |
| `RELAY_APPROVER_ROLE` | `presence.approver_role` claim (default `CYCLONE_OPERATOR`, matches the policy) |
| `RELAY_PRESENCE_METHOD` | Override `presence.method` (default: the Cyclone gesture, e.g. `two_hand_hold`) |
| `RELAY_WEBHOOK_SECRET` | `webhook_secret` registered with the WEBHOOK integration; enables `x-decionis-signature` checks |
| `RELAY_WEBHOOK_BEARER` | Optional Bearer token the webhook delivery carries |
| `RELAY_WEBHOOK_UNSIGNED=1` | Dev only: accept unsigned webhooks (otherwise refused, fail closed) |
| `RELAY_REQUIRE_WEBHOOK=1` | Present an ESCALATE only after its webhook confirms the agent's handoff |
| `RELAY_AMENDED_APPROVAL=1` | Advertise `supportsAmendedApproval` (default false, DECISIONS D20a) |
| `RELAY_UPSTREAM_REJECT=1`, `RELAY_UPSTREAM_ESCALATE=1` | Route veto / escalate to their (undocumented) stubs |
| `RELAY_JWKS_URL` / `RELAY_JWKS_FILE` | Dossier keys: pinned production URL (default) or a local file (never an official anchor) |
| `RELAY_DATA_DIR` | Held intents + records persist here (`relay/.data`, git-ignored) |
| `RELAY_RECORD=1`, `RELAY_RECORD_DIR` | C49 recording of webhooks, handoffs, records, dossiers, JWKS (`src/fixtures/recorded`) |

## Endpoints

| Route | Auth | What |
| --- | --- | --- |
| `GET /capabilities` | none (no secret in it) | `{ supportsAmendedApproval, source: "live" }` |
| `GET /ws?session=…` | session or agent token | `intent.held` (snapshot on connect, then live), `intent.expired`, `intent.resolved`, `record.sealed` |
| `POST /intents/{id}/decision` | `Bearer <session>` | `Decision` → `SignedRecord`. 400 malformed · 401/403 auth · 404 unknown · 409 hash mismatch / already resolved · 410 expired · 403 `FORBIDDEN` (gesture, forbidden slot, policy gate did not allow) · 422 `AMEND_UNSUPPORTED` / `AMEND_DENIED` · 501 amended approval stub · 503 not configured / upstream refused. Body `{ code, detail }` |
| `POST /webhooks/policy-gate` | HMAC (+ optional Bearer) | `authority.escalation_required` / `authority.escalation_resolved` (§1) |
| `POST /held` | `Bearer <agent token>` | `{ binding, intent_hash, authority: { status, decision_id, dossier_id, escalation_id, reason_codes }, presentation }` |
| `GET /health` | none | What is configured (no secrets) |

## How a decision flows

1. The agent submits a tool call (§3a). An `ESCALATE` (or `BLOCK`) answer is handed to `POST /held` with the
   full binding, because the webhook carries `intent_hash` but not the binding (§1). The relay re-hashes the
   binding with the shared Intent v1 code (`app/src/core/hash.ts`), refuses any mismatch, maps it to a
   `HeldIntent` with `policy/cyclone.json`, and broadcasts `intent.held`. A webhook for the same intent must
   agree on the hash or the intent is withdrawn.
2. The headset posts a `Decision`. The relay checks the session, the hash binding (C13), wall-clock TTL, the
   desk's gesture rules (`app/src/flow/policy.ts`), forbidden, and the amendment ceiling. Idempotent per
   intent: the same decision returns the same record (also after a restart).
3. **Approve** = §2b: the same intent re-presented to `POST /v1/authority/grants` with
   `evidence.humanApproval = { provider: "attestation", attestation: <EdDSA JWS> }`. Chosen over the §2a case
   inbox because the attestation is bound to `intent_id` + `intent_hash` (what you see is what you sign), the
   response is a normal decision with `dossier_id`, and its refusals are documented; the case inbox has no
   hash in its body, needs a "person" actor, and does not say whether it yields a dossier.
4. The returned dossier is fetched (§5) and verified with `verifyDossierProofBundle` against the pinned JWKS.
   `verified` is true only with valid signatures **and** `required_artifact_coverage_verified` **and** trust
   anchor `DECIONIS_OFFICIAL`; otherwise the record seals as unverified. Veto, escalate and expiry seal with
   the hold's own dossier (the ESCALATE / BLOCK decision). No dossier → unverified (fail closed).
5. Expiry: a sweep seals `REJECT(expired)` at `expires_at` (wall clock) and broadcasts `intent.expired`.

Live-mode choices the client should know: `AUTO_APPROVE_RULE` is refused (403) because a desk rule cannot
speak for a person to the policy gate; the client falls back to a normal held token. A veto calls
`DELETE /v1/authority/escalations/{id}` when the hold is a managed escalation (§2b); otherwise the hold lapses
at `expires_at` and never executes.

## Stubbed pending H1 (docs are silent; never invented)

| Path | Behaviour now | Doc ref |
| --- | --- | --- |
| Approve with changed arguments | Pre-checks (amended hash, ceiling) run; then `Upstream.approveAmended()` throws `NotDocumented` → 501 `AMEND_UNSUPPORTED`. Counter-offer is the working route | Headline 3, §8.3 |
| Explicit reject of a held grant | Hold lapses at `expires_at`; with `RELAY_UPSTREAM_REJECT=1`, `Upstream.rejectHeld()` → `NotDocumented` (noted on the record) | §2, §8.6 |
| Escalate to a second reviewer upstream | Local flag only; with `RELAY_UPSTREAM_ESCALATE=1`, `Upstream.escalateCase()` → `NotDocumented` | §2a, §8.4 |
| Webhook envelope and event-name location | Fields read at top level or under `data`/`payload`; name from body or `x-decionis-event` | §1, §8.1 |
| Webhook signature encoding | HMAC-SHA256 of the raw body; hex or base64(url), optional `sha256=`; no replay window | §1, §8.2 |
| Whether `presence.method` = a Cyclone gesture can match a policy rule; the `agent_safe.human_approval.*` fact names | Gesture names sent; policy rules written against them | §2b, §8.4 |
| `Idempotency-Key` on re-presentation | Same `intent_id` (the doc says it "must exactly match the intent_id") | §3a |

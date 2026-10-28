# Policy-gate integration reference (Decionis AgentSafe)

Compiled 2026-10-28 from public sources only; every endpoint, field and header is quoted from the
cited source, and anything they do not state is marked **not documented**. Docs only: the app
renders "policy gate" (AGENTS.md §2).

## 0. Sources read

| Ref | URL |
| --- | --- |
| WH | https://docs.decionis.com/webhooks (`https://decionis.com/docs/webhooks` 308s here) |
| AUTH | https://docs.decionis.com/auth |
| API | https://docs.decionis.com/api |
| DD | https://docs.decionis.com/decision-dossier (`https://decionis.com/docs/decision-dossier` 308s here) |
| PROTO | https://docs.decionis.com/decision-protocol, https://docs.decionis.com/decision-evaluation, https://docs.decionis.com/quickstart (`https://decionis.com/docs` 308s here) |
| POL | https://docs.decionis.com/policy-encoding |
| OAS | https://decionis.com/.well-known/openapi.json ("Decionis Policy Evaluation API" 0.5.0, server `https://api.decionis.com`) |
| LLMS | https://decionis.ai/llms.txt, https://decionis.ai/llms-full.txt, https://docs.decionis.com/llms.txt |
| PX | https://decionis.ai/policy-exchange, https://decionis.ai/policy-exchange/devops |
| ASP | https://github.com/decionis/agent-safe-pipeline at commit `923f1c7c3acf7110c965e2e6e7457ddc7f32d56b` (master, 2026-10-27; latest release tag `v0.5.0`): `spec/intent/v1/README.md`, `spec/intent/v1/CHANGELOG.md`, `conformance/`, `dossiers/`, `docs/human-approval.md`, `docs/execution-intent.md`, `docs/gateway/http-interception.md`, `docs/gateway/routes.md`, `docs/banking/card-authorization.md`, `packages/agentsafe/README.md`, `packages/agentsafe/src/http/Routes.ts` |
| VER | `@decionis/verify@0.5.0` README and `dist/` (npm; newest published version on 2026-10-28) |

## Headline findings (read before building C12, C13, C15, C29, C35, C48)

1. **Vocabulary.** Verdicts are `ALLOW` / `ESCALATE` / `BLOCK` (plus `REVIEW_REQUIRED`, `ERROR`)
   (OAS `ExecutionAuthorityDecision.status`). `evaluate-decision` uses the wire spellings
   `APPROVE` / `ESCALATE` / `REJECT` / `REVIEW` (PROTO). Policy rule actions are `AUTO_APPROVE`,
   `REQUIRE_REVIEW`, `ESCALATE`, `AUTO_REJECT`, `REQUEST_INFO` (OAS `PolicyRule`).
   `single` / `two_hand` / `forbidden` do not exist in the documented vocabulary.
2. **Intent lifetime is at most 5 minutes.** `expires_at` "Must be later than captured_at and no
   more than five minutes after it" (OAS `ExecutionIntentBindingBase`). The gateway holds an
   `ESCALATE` "until the intent expires (`intentTtlSeconds`, 120 by default, at most 300)" (ASP
   http-interception.md). "Presence authorization cannot revive an expired execution intent"
   (ASP human-approval.md). A live held intent therefore cannot sit in an overnight queue.
3. **No documented approve-with-changed-arguments.** No endpoint or field in OAS, WH, AUTH, ASP
   carries amended arguments for a held intent ("amend" does not occur in the OpenAPI document). Spec
   §6: "A change to any bound property after authorization is another intent with another hash".
   ASP human-approval.md: "If the intent changes or expires during approval, capture a new intent
   and start again." The documented way to get a changed call decided is a **new proposal** (§3).
4. **Human approval is evidence for a fresh evaluation, not a resolve call.** An `ESCALATE`
   becomes executable only when the same intent is presented again with `evidence.humanApproval`
   (a Presence receipt or a presence provider's signed attestation) and policy has a rule matching
   it (§2b). Separately, Decionis has a case inbox, `POST /v1/cases/{caseId}/decisions` (§2a).
5. **The hash covers the whole binding**, `sha256:` + hex (spec §5), not `{tool,args,target,rule_id}`.
6. **`npx @decionis/verify intent` (0.5.0) exits 1 on today's corpus**: `policy-projection.json`
   fails `BINDING_INVALID at policy_projection`, though `intentHash()` reproduces its bytes and all
   6 hashes (checked locally); the CLI schema predates `policy_projection` (spec 2026-10-20).

## 1. Held-intent webhook

**Event name:** `authority.escalation_required` (WH "Authority events"; OAS description of
`POST /v1/authority/grants`). When: "enforce-and-bind returns ESCALATE in ENFORCEMENT, direct or
managed." Companions: `authority.escalation_resolved`, `managed_escalation.*`.

**Configuration (WH, AUTH):** outbound `WEBHOOK` integration provider.

```
POST https://api.decionis.com/v1/orgs/:orgId/integrations/WEBHOOK/connect
Authorization: Bearer dcy_org_xxx      # "Bearer API key with org integration write scope" (AUTH)
{ "config": { "endpoint_url": "https://partner.example.com/decionis/webhook",
              "provider_name": "partner-webhook", "workflow_id": "decision_intake" },
  "credentials": { "webhook_secret": "whsec_partner_xxx" },
  "subscriptions": [ { "event_name": "decisioning.v2.ran", "is_enabled": true, "filter": {} } ] }
```

WH: "Beside decisioning.v2.ran, an organisation's subscribers can name the events of execution
authority". The doc's example only shows `decisioning.v2.ran`; the exact `event_name` string used
to subscribe to the authority events is **not shown** (presumably the event name itself). This
route is **not in OAS**.

**Delivery:** `POST` to `config.endpoint_url` ("Destination callback URL Decionis will POST to").

| Header | Source | Meaning |
| --- | --- | --- |
| `x-decionis-signature` | WH, AUTH | "HMAC SHA-256 signature over the outbound request body when webhook_secret is configured." Verify: "Validate x-decionis-signature against the raw request body using the stored callback secret." |
| `Authorization: Bearer <token>` | WH | "Sent only when access_token or api_token credentials are stored." |
| `x-decionis-event`, `x-decionis-delivery-id` | API | Documented for the **Make** instant webhook only ("Every delivery includes x-decionis-event ... and x-decionis-delivery-id"); not stated for `WEBHOOK`. |

Signature encoding (hex vs base64, any `sha256=` prefix), timestamp header and replay window:
**not documented**. Retries (WH): at-least-once; 2xx accepted; 4xx "Do not blind retry"; 5xx or
timeout "Retry with backoff". Dedup (WH): "Each event is keyed so a replay of the same intent, the
same decision or the same refusal code lands once in the outbox. A different answer to the same
intent is a new event." "Delivery never affects a decision, and no event carries a credential, a
token, a receipt or an attestation."

**Payload fields** (WH table; a field list, **no JSON example and no envelope published**):

- `authority.escalation_required`: `tenant_id`, `intent_id`, `intent_hash`, `expires_at`,
  `decision_id`, `dossier_id`, `reason_codes`, `authority_requirement` ("the issued Presence
  requirement's id and selector, or null"), `selector` and `verification` ("the policy's: kind and
  role, provider, methods, level"), `escalation_id` when managed, "and the action with its
  parameters".
- `authority.escalation_resolved`: "The same identity fields"; `outcome` (`ALLOW`, `BLOCK`,
  `ESCALATE`, `REVIEW_REQUIRED`, `ERROR`, or `REFUSED`); `reason_codes`; `evidence` (kind `presence`
  or `attestation`; `provider`, `method`, `approver_role`, `attestation_id`, `key_id`,
  `request_id`, `approved_at`); "the action's type and resource".
- `managed_escalation.*` (`created`, `presence_requested`, `awaiting_approver`, `presence_verified`,
  `presence_rejected`, `reauthorizing`, `grant_issued`, `blocked`, `cancelled`, `expired`,
  `failed`): `org_id`, `intent_id`, `intent_hash`, `escalation_id`, `evaluation_id`,
  `presence_request_id`, `status`, `expires_at`.

**Where the hash is:** `intent_hash` is a named field (Agent-Safe Intent v1, `sha256:<hex>`). The
event is documented to carry "the action with its parameters", **not** the full binding
(`captured_at`, `actor`, `context`, `downstream_target`, ...), so the relay cannot recompute the
hash from the webhook alone; the full binding is held by the proposer (the executor's handoff
`escalation.intent`, below). Exact JSON key names for "the action" and "selector and
verification": **not documented**.

**The proposer side of the same hold (no webhook involved):**

- AgentSafe gateway: `202`, JSON with `version: agent-safe.gateway/1`, `state`, `verdict`,
  `reason_codes`, `execution: HELD`, intent/decision/dossier ids, a `resume` path and a
  `resume_token` (ASP http-interception.md).
- AgentSafe trusted executor `POST /v1/actions`: `verdict: "ESCALATE"`, `outcome:
  "ESCALATE_PENDING"`, `executed: false`, plus an `escalation` object `{ mode: "DIRECT", intent,
  request_id, approval_url, expires_at }`, `{ mode: "MANAGED", intent, escalation }` or
  `{ mode: "ATTESTATION", intent, requirement }` (ASP packages/agentsafe/README.md). Example
  handoff (ASP card-authorization.md):

```json
{ "verdict": "ESCALATE", "outcome": "ESCALATE_PENDING",
  "escalation": { "mode": "ATTESTATION", "intent": { "...": "the exact intent, to present back" },
    "requirement": { "requirement_id": null, "expires_at": "2026-10-12T12:05:00.000Z",
      "selector": { "kind": "ROLE", "role_id": "CARDHOLDER" },
      "verification": { "provider": "koard", "methods": ["CARD_TAP"], "level": "STANDARD" } } } }
```

## 2. Resolving a held intent

There is no single documented "resolve" endpoint with approve / reject / amend semantics. Three
documented paths:

### 2a. Case inbox: `POST https://api.decionis.com/v1/cases/{caseId}/decisions` (OAS `decideCase`)

"The one inbound decision path". `caseId` is "`<owner>:<kind>:<ref>`, for example
`commerce:payment:<uuid>` or `core:escalation:<uuid>`". Auth: "Organization API key with
decision:write and a person (Business Central `x-decionis-actor` or an MCP OAuth token), or the
named recipient's own Account session with the signed email `link`." Presence passkey step-up
when the authority requirement asks. Query `view` = `card` | `business-central` | `assistant`.

Body (`additionalProperties: false`): `verb` (required: `approve` | `reject` | `edit` |
`escalate`), `revision` (required integer ≥ 0), `decision_id` (uuid), `choices` (≤ 16 strings),
`note` (≤ 1000 chars), `link` (signed email fallback link). 200: `{ "applied": boolean, "card":
{...} }`, "`applied` is false when the same decision was already applied". Errors: `403`
`wrong_tenant` / `not_a_member` / `not_authorized` / `actor_required` / `link_not_yours`; `409`
`stale_revision` (with the current card) / `already_decided` / `decision_in_progress` /
`step_up_unavailable`; `410` `case_expired`; `428` `step_up_required` with `step_up_url`.
Listing: `GET /v1/cases?status=pending&view=&limit=` and `GET /v1/cases/{caseId}`
(`decision:read`; card format `decionis.delivery.card/1`, schema open).

Not documented: what `edit` does and where edited arguments would go (no argument field); the card
schema; whether every `ESCALATE` from `/v1/authority/grants` creates a `core:escalation` case;
whether a decision returns or creates a dossier; no `intent_hash` field in the body.

### 2b. Re-present the intent with evidence: `POST https://api.decionis.com/v1/authority/grants`

Same body as §3a (`/v1/authority/enforce-and-bind` is a "Deprecated alias ... the same
handler") plus `evidence.humanApproval`, one of (OAS `HumanApprovalEvidence`):

- `{ "provider": "presence", "requestId": "...", "receiptDossierId": "..." }`
- `{ "provider": "attestation", "attestation": "<compact JWS>" }`. JWS header `alg` EdDSA,
  `typ` `decionis-presence-attestation+jwt`, `kid`; payload (OAS `PresenceAttestationClaims`)
  `iss`, `aud` (org uuid = `tenant_id`), `sub`, `iat`, `exp` (≤ 300 s after `iat`), `jti`,
  `intent_id`, `intent_hash`, `presence: { method, result: VERIFIED|FAILED, approver_role, ... }`.
  Key: registered at `POST /v1/execution/provider-keys` (`kid`, `issuer`, `algorithm: EdDSA`,
  `public_jwk`, `purpose: presence_attestation`; needs `policy:write` or `org:*`), or an admitted
  directory provider's JWKS.

"An ESCALATE becomes an ALLOW only when the organisation's policy has a rule matching those facts"
(facts written to `agent_safe.human_approval`). Refusal: `409` with `PRESENCE_ATTESTATION_MALFORMED`
/ `_KEY_UNKNOWN` / `_SIGNATURE_INVALID` / `_EXPIRED` / `_AUDIENCE_MISMATCH` / `_INTENT_MISMATCH` /
`_ISSUER_MISMATCH` / `_NOT_VERIFIED`, "and no evaluation runs". Response: the normal decision (§3a),
including `dossier_id` / `dossier_url`. A managed escalation can be cancelled with
`DELETE /v1/authority/escalations/{escalationId}` ("without authorizing execution").

### 2c. Through a self-hosted AgentSafe (ASP)

- Trusted executor `POST /v1/escalations` (role `PROPOSER`, or `OPERATOR` with scope
  `escalations.resume` for attestations only): present the `escalation` object back unchanged, or
  `{ "mode": "ATTESTATION", "intent": {...}, "attestation": "<compact JWS>" }`. An intent past
  `EXECUTOR_INTENT_TTL_SECONDS` is `409 INTENT_EXPIRED`.
- Gateway `POST /_agentsafe/v1/escalations/{intent_id}/resume` with header
  `AgentSafe-Resume-Token`; `403 RESUME_TOKEN_INVALID`; `409` without Presence configured ("the
  hold is the answer"); `404 ESCALATION_NOT_HELD` after a restart or on another replica.

### Errors asked about

| Case | What is documented |
| --- | --- |
| Hash mismatch | Spec §5: the authority "recomputes it from the binding it receives and refuses a request whose stated hash differs". Reason code `INTENT_HASH_MISMATCH` (ASP execution-intent.md, for claims). HTTP status on `/v1/authority/grants`: **not documented**. |
| Expired | Case: `410 case_expired`. Executor: `409 INTENT_EXPIRED`. Grants route: **not documented** beyond the 5-minute `expires_at` bound. |
| Already resolved | Case: `409 already_decided`, or `200` with `applied: false`. Grants: `409` "the idempotency key is already bound". |
| Amended args denied by policy | **Not documented** (no amend path exists to be denied). A new proposal is evaluated like any other: `BLOCK` with reason codes. |
| Escalate to second reviewer | Case verb `escalate` exists; semantics **not documented**. |

## 3. Submitting a tool call (scripted agent, C36)

### 3a. Direct to Decionis: `POST https://api.decionis.com/v1/authority/grants`

Headers: `Authorization: Bearer <org API key>` (OAS `ApiKeyAuth`), `Idempotency-Key: <intent_id>`
("must exactly match the intent_id"). Body = the binding of §6 plus `intent_hash`
(`^sha256:[0-9a-f]{64}$`), `mode` (`SHADOW` | `PARALLEL` | `ENFORCEMENT`), optional `escalation`
(`{ "mode": "MANAGED", "approver": { principal_id | role_id }, verification_requirements }`),
`executor` (`platform`, `style`: `dispatch` | `permit`, `version`) and `evidence`.

200 `ExecutionAuthorityDecision`, required: `decision_id`, `chain_id`, `status`, `should_execute`,
`authority_classification` (`AUTHORITATIVE` | `OBSERVATIONAL`), `execution_eligible`,
`execution_binding_digest`, `reason_codes`, `action_hash`, `policy_version`, `mode`,
`execution_token`, `execution_token_jti`, `execution_token_key_id`, `execution_token_expires_at`,
`dossier_id`, `dossier_sha256`, `dossier_url`, `approval_request_id`, `ledger_entry_id`; optional
`managed_escalation` (`outcome`, `escalation_id`, `intent_id`, `status`, `expires_at`,
`reason_codes`), `verification` (share-safe verify URLs, sent only to a `User-Agent` of
`agent-safe-pipeline/0.2.0`+ or `govern/2.0.0`+), `escalation_requirement` (`requirement_id`,
`expires_at`, `selector`, `verification`; only for `agent-safe-pipeline/0.3.7`+), `permit_id`,
`intent_sha256`, `expires_at`. Errors `400 401 403 409 429 503`; error body `{ error, message,
request_id, status }`. Key scopes: a `decision:shadow` key runs `SHADOW` only; `decision:enforce`
runs `SHADOW` or `ENFORCEMENT`.

### 3b. Through the AgentSafe trusted executor (`@decionis/agentsafe`, self-hosted)

`POST /v1/actions`, `Authorization: Bearer <principal token>` (role `PROPOSER`):

```json
{ "proposal": { "action": "forward_request", "target": "payout:synthetic-beneficiary-1",
                "parameters": { "amountMinor": 5000, "currency": "USD" } },
  "idempotency_key": "payout-1-v1", "correlation_id": "synthetic-run-1" }
```

Tenant, actor and downstream target come from executor configuration (supplying them is
`400 REQUEST_INVALID`); an unregistered action is `422 ACTION_NOT_REGISTERED`. Response fields:
`mode`, `intent_id`, `intent_hash`, `verdict`, `decision_id`, `dossier_id`, `reason_codes`,
`fail_closed`, `outcome` (`COMPLETED` | `BLOCKED` | `FAILED_BEFORE_DISPATCH` |
`UNKNOWN_AFTER_DISPATCH` | `ESCALATE_PENDING`), `executed`, `authorization`, `finalization`,
`result`, `effect`, `recovery`, and `escalation` on a hold.

### 3c. Through the AgentSafe HTTP gateway

The agent sends its normal `POST`/`PUT`/`PATCH`/`DELETE` to the gateway; `interception.routes`
(`path`, `action`, `methods`, optional `policyId` / `policyVersion`) name the action. The gateway
binds `parameters.method`, `.path`, `.query`, `.body` (ASP routes.md, http-interception.md).

Credentials: org API key via OTP onboarding then deployment bundle (AUTH), or `POST
/v1/public/agents/provision` (provisional workspace, shadow policy, 50 decisions/month; LLMS).

## 4. Policy format (C48)

**Bundle** (POL "Bundle contract"; OAS `PolicyBundle`), submitted with
`POST /v1/protocol/policies/bundles` (Bearer API key). Required: `protocol_version` (1.x),
`bundle_id` (uuid), `org_id`, `version` (≤ 100 chars), `effective_from`, `rules` (non-empty).
Optional: `policy_id`, `effective_to`, `metadata`, `allowed_transitions`, `commerce_preflight`,
`commerce_history`, `signature`.

**Rule** (OAS `PolicyRule`, `additionalProperties: false`): `rule_id`, `name`, `decision_domain`,
`when` (open object), `then`, `priority`, `enabled`, optional `rationale`. `then`: `action`
(`REQUIRE_REVIEW` | `AUTO_APPROVE` | `AUTO_REJECT` | `ESCALATE` | `REQUEST_INFO`), `severity`
(`routine` | `elevated` | `urgent`), `assignee_role`, `sla_minutes`, `authority` (`reason_codes`,
`selector`, `verification_requirements`, `resolution`, `expires_in_seconds` 60..3600).

- `selector`: `{ kind: "ROLE", role_id, principal_id? }` or `{ kind: "PRINCIPAL", principal_id, role_id? }`.
- `verification_requirements`: `level` (`STANDARD` | `HIGH_CONFIDENCE`), `methods` (1..3 of
  `WEBAUTHN`, `MOBILE_DEVICE`, `ACTIVE_LIVENESS`, `CARD_TAP`), `hardware_pki_required`,
  `disallow_virtual_cameras`, optional `mobile_device_policy`, `trusted_ip_regions`, `provider`.
- `resolution`: `quorum` (const `1`), `delegation` (`DISALLOWED` | `REQUIREMENT_REFRESH`),
  `fallback_role_ids`.

Example rule (POL):

```json
{ "rule_id": "review-commerce-proposals", "name": "Review commerce proposals", "decision_domain": "*",
  "when": { "all": [ { "field": "decision_type", "operator": "EXISTS" } ] },
  "then": { "action": "REQUIRE_REVIEW" }, "priority": 100, "enabled": true }
```

Evaluation (PX): enabled rules for the decision domain, highest priority first; "the first rule
whose conditions all hold decides"; no match is a REVIEW; `AUTO_APPROVE`→APPROVE,
`AUTO_REJECT`→REJECT, `ESCALATE`→ESCALATE, `REQUIRE_REVIEW`/`REQUEST_INFO`→REVIEW. Without a
`policy_projection`, "the authority evaluates `action.type` as the decision type, transaction type
and workflow key" (spec §3). Condition operators seen: `EXISTS` (POL), `EQ_FACT` / `NEQ_FACT` (OAS),
`op: "lte"` / `"gt"` on `"field": "action.amount"` (POL page sample `policy.decionis.json`, a
different, simplified shape with `action: "allow" | "escalate"`), `in` and `≥` (PX rendered).
Other routes: `POST /v1/policies`, `POST /v1/policies/validate`,
`POST /v1/orgs/:orgId/policies/strategies[/draft]`; `context.decionis_policy` (`content`,
`sha256`, `enforce`) publishes only with `policy:write` / `policy:*` / `org:*`.

## 5. Decision Dossier (C39, C49)

**Fetch:** `GET /v1/protocol/dossiers/{dossier_id}?org_id=<uuid>` (Bearer API key) →
`{ service, protocol_version, dossier }` (OAS). `GET
/v1/public/decision-dossiers/{dossier_id}/proof-bundle?sig=&exp=` (public, share-link
capability) → `{ service, dossier_id, dossier_payload, jwks_url, jwks_path, verify_with, message }`.
Also `/verify`, `/reproduce`, `GET /v1/orgs/:orgId/decision-dossiers/:dossierId/portable` (DD),
`/v1/protocol/dossiers/{id}/proof-packet`. The decision's `verification` object carries
`verification_url`, `verification_page_url`, `link_exp`, `asymmetric_proof_bundle`, etc.

**Shape** (`dossier_payload`, `schema_version: "decionis.decision_dossier/2.0"`, from ASP
`dossiers/vectors/*.json`): `authority_evidence`, `dossier_id`, `evaluation_id`, `generated_at`,
`governance.policy_snapshot`, `inputs_snapshot`, `integrity.proof_bundle` (`algorithm`,
`artifacts`, `bundle_type`, `issued_at`, `key_id`, `rotation_policy`, `version`), `linked_data`,
`portable_artifact` (`machine_readable`: `verdict`, `outcome`, `mode`, `execution_eligible`,
`execution_binding_digest`, `policy_reference`, `policy_version`, `protocol_version`, ...),
`routing_decision` (`authority`, `decision_id`, `evaluation_id`, `execution_grant_issued`,
`outcome`, `policy_evaluation`, `policy_snapshot`, `policy_version`, `reason_codes`). An `ALLOW`
also signs `/execution_binding` (proof bundle `2.1`, RFC 8785). DD's field table names
`dossier_id`, `decision_class`, `policy_version`, `signal_context`, `verification`.

**JWKS (pin):** `https://api.decionis.com/.well-known/decision-dossier-jwks.json` (VER CLI
`PINNED_DECIONIS_JWKS_URL`). VER's `assessJwksTrustAnchor` returns `DECIONIS_OFFICIAL` for exactly
`https://api.decionis.com` with path `/.well-known/decision-dossier-jwks.json` or
`/v1/.well-known/decision-dossier-jwks.json` (LLMS lists the `/v1/` form). Both returned 200 on
2026-10-28. Execution eligibility also needs `required_artifact_coverage_verified === true` (VER).

**Synthetic corpus** (saved under `relay/src/fixtures/dossiers/`): signed with key id
`agent-safe-synthetic-dossier-corpus-v1`, whose private key ASP publishes deliberately. Verify
with `--jwks corpus-jwks.json`; the trust anchor is never official, so these are not C49 records.

## 6. Agent-Safe Intent v1 (`agent-safe.intent/1`)

**Binding** (spec §3; one JSON object with exactly these top-level keys):

| Property | Req | By | Constraint |
| --- | --- | --- | --- |
| `protocol_version` | yes | producer | literal `agent-safe.intent/1` |
| `tenant_id` | yes | producer | UUID of the organization |
| `intent_id` | yes | producer | UUID, fresh per capture |
| `captured_at`, `expires_at` | yes | producer | RFC 3339 UTC with `Z`, as `toISOString()` writes it |
| `actor` | yes | producer | `id`, `type` (1–200), optional `runtime` (1–200), `trust_level` (1–80); no other key |
| `action.type` | yes | agent | 1–120 chars, `^[a-z][a-z0-9._:-]*$` |
| `action.resource` | yes | agent | 1–500 chars |
| `action.parameters` | yes | agent | any JSON object |
| `context` | yes | producer | any object; MUST carry `idempotency_key` (1–180); reserved `enforcement_boundary`, `workload`, `agent_safe` |
| `downstream_target` | yes | producer | `system`, `operation` (1–200), optional `environment` (1–200), `endpoint` (1–500); no other key |
| `policy_projection` | no | producer | `decision_type` (1–120), `transaction_type`, `workflow_key`, `channel` (string or `null`); no other key |
| `expected_effect_digest` | no | producer | `sha256:` + 64 lowercase hex |

Rules: fixed-key objects refuse extra keys; numbers finite; `__proto__`/`constructor`/`prototype`
refused; refuse beyond 100 KiB canonical bytes, depth 20, 5,000 entries, 1,000 array elements.

**Canonical form** (spec §4): `JSON.stringify` output after sorting every object's keys at every
depth by UTF-16 code unit (ECMAScript default sort; no folding or normalization); no whitespace;
strings verbatim (no Unicode normalization; `"` and `\` escaped; U+0000–U+001F as `\b \f \n \r \t`
or `\u00XX`; lone surrogate as `\uXXXX`; everything else, astral included, as itself); numbers as
`JSON.stringify` writes them (`-0`→`0`, `1e21`→`1e+21`); arrays keep order; `undefined` is absent.

**Hash** (spec §5): `"sha256:" + hex(SHA-256(UTF-8(canonical form)))`. Every single-property change
must yield a different hash (§6).

**Conformance** (§7): for every vector under `conformance/agent-safe-intent-v1.json`,
`conformance/vectors/` and `conformance/frameworks/`, reproduce `canonical_json` and `intent_hash`
from `binding`, accept whole bindings and refuse §3 refusals, and reproduce each `mutations[]`
entry (`path`, `value`, `binding`, `canonical_json`, `intent_hash`) with no two hashes equal.
Vectors without `protocol_version` in `binding` are canonicalization-only cases.

**Files** (saved byte-for-byte from ASP @ `923f1c7` to `relay/src/fixtures/vectors/`):
`agent-safe-intent-v1.json` (pinned hash
`sha256:aff2fd3aa1a7557a77f20afa5583f56eb0c39529304b31f69ee78e1e7b53e316`),
`composed-vs-decomposed.json`, `compromised-principal.json` (base + 8 mutations),
`fractional-exponent.json`, `negative-zero.json`, `nested-arrays.json`,
`policy-projection.json` (base + 5), `policy-projection-absent.json`,
`target-precondition.json` (base + 4), `unicode-astral.json`, `utf16-sort-order.json`; and
`frameworks/{langchain,mcp,openai,vercel}.json`. The CLI does not recurse into subdirectories:

```bash
npx @decionis/verify intent relay/src/fixtures/vectors relay/src/fixtures/vectors/frameworks
# 0.5.0 today: 14 reproduced, 1 failed (policy-projection.json, BINDING_INVALID), exit 1
```

## 7. Fixtures written

- `relay/src/fixtures/vectors/` (+ `frameworks/`): §6. `relay/src/fixtures/dossiers/`: ASP
  `dossiers/vectors/{allow,block,escalate,owned-execution-bound,runtime-signals}.json` and
  `dossiers/corpus-jwks.json` @ `923f1c7`; each wraps `dossier_payload` with `expected`, and all
  exit 0 under `npx @decionis/verify --file <f> --jwks .../dossiers/corpus-jwks.json`.
- No `webhook.json` / `resolve.json`: no complete sample payload is published for either (§1, §2).

## 8. Not documented / open questions (for H1)

1. A full JSON example and envelope for `authority.escalation_required`, and whether it carries the
   whole binding (needed to recompute `intent_hash`) or only "the action with its parameters".
2. `x-decionis-signature` encoding and replay protection; whether `x-decionis-event` /
   `x-decionis-delivery-id` are sent by the `WEBHOOK` provider; the `event_name` strings for
   subscribing to authority events. The `WEBHOOK/connect` route is absent from the OpenAPI document.
3. **Approve-with-changed-arguments**: AGENTS.md §6.5 says "supported"; no public source describes
   it. Documented behaviour: a changed call is a new intent, proposed and evaluated afresh.
4. Which resolve path suits Cyclone: the case inbox needs "a person" (Entra actor header, MCP OAuth
   token, or Account session) and the `edit` verb is undefined; the attestation path needs a
   registered `presence_attestation` key plus a policy rule matching the approval facts.
   `verification_requirements.methods` lists only `WEBAUTHN`, `MOBILE_DEVICE`, `ACTIVE_LIVENESS`,
   `CARD_TAP`; whether another `presence.method` value (a gesture) can be matched by a rule is not
   documented. Cyclone forbids biometric approval; `ACTIVE_LIVENESS` and device passkeys may be.
5. How a rule's `when` addresses `action.parameters.*` (e.g. `deg_s`), and the full operator list.
6. HTTP status and code for a hash mismatch or an expired intent on `/v1/authority/grants`; how to
   explicitly reject an `ESCALATE` on that path (none documented; the hold lapses at `expires_at`).
7. The 5-minute intent ceiling makes C15 (overnight handover queue) and long C29 TTLs impossible as
   live holds; overnight items can only be records (dossiers) or re-proposals.
8. AGENTS.md §5.1 `intent_hash` ("sha256 hex of canonical {tool,args,target,rule_id}") conflicts
   with the spec (whole binding, `sha256:` prefix); `HeldIntent` should carry the binding.
9. `@decionis/verify@0.5.0` intent CLI fails `policy-projection.json`; C13's "exit 0" acceptance
   needs a newer verifier, or the parity test must call `intentHash()` directly.
10. OAS `PolicyRule.then` has no `allowance`, yet the grants description cites `then.allowance`.

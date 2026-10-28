# Cyclone policy (C48)

`cyclone.json` is a policy bundle in the documented format (`docs/agentsafe.md` §4: OAS `PolicyBundle` /
`PolicyRule`), covering the four demo scenarios (BRIEF §7). Rules are evaluated highest priority first and the
first rule whose conditions all hold decides (§4, PX). The relay (`relay/src/policy.ts`) reads the same file to
present held intents on the desk; the policy gate's own verdict always wins when it is stricter.

## Rules

| Priority | `rule_id` | When | `then.action` | Desk |
| --- | --- | --- | --- | --- |
| 1000 | `oven.setpoint.hard_limit` | `set_oven_setpoint`, `setpoint_c` > 420 | `AUTO_REJECT` | forbidden (450 °C is refused) |
| 990 | `arm.velocity.hard_max` | `set_arm_velocity`, `deg_s` > 300 | `AUTO_REJECT` | forbidden |
| 980 | `conveyor.speed.large_change` | `set_conveyor_speed`, `speed_pct` > 10 | `AUTO_REJECT` | forbidden |
| 970 | `lift.height.envelope` | `lift_pallet`, `height_mm` > 1500 | `AUTO_REJECT` | forbidden |
| 800 | `cyclone.approval.two_hand` | arm ≤ 300 °/s + human approval `VERIFIED` by `CYCLONE_OPERATOR` with `two_hand_hold` / `one_hand_gaze_hold` | `AUTO_APPROVE` | (approval) |
| 790 | `cyclone.approval.single` | conveyor / oven / lift + human approval with `place` / `gaze_pinch` / `two_hand_hold` | `AUTO_APPROVE` | (approval) |
| 500 | `conveyor.speed.small_change` | `speed_pct` ≤ 10 | `ESCALATE` | single, risk 0 |
| 500 | `arm.velocity.walkway_adjacent` | `cell` = 3 (next to walkway W1) | `ESCALATE` | two_hand, risk 1 (≤ 180 °/s) or 2; amend dial ceiling 180 °/s |
| 500 | `oven.setpoint.within_limit` | `setpoint_c` ≤ 420 | `ESCALATE` | single, risk 1 |
| 500 | `lift.routine` | `height_mm` ≤ 1500 | `ESCALATE` | single, risk 0 (the drill: only the rehearsal shows the shelf clip) |
| 1 | `cyclone.default.hold` | any `decision_type` | `ESCALATE` | forbidden (veto or escalate only) |

Hard limits outrank approvals, so no human approval can push the oven past 420 °C.

## Mapping to Cyclone's gestures (`metadata.cyclone`)

`single` / `two_hand` / `forbidden` are Cyclone's gesture requirements; they do not exist in the documented
vocabulary (DECISIONS D20e). The mapping lives in the bundle's documented optional `metadata` field:

| Documented `then.action` | Grant status (§3a) | Desk |
| --- | --- | --- |
| `AUTO_APPROVE` | `ALLOW` | not held (executes; simulated in Cyclone) |
| `ESCALATE` | `ESCALATE` | the rule's `requires` (`single` or `two_hand`) |
| `AUTO_REJECT` | `BLOCK` | `forbidden` (slot locked; veto or escalate) |
| `REQUIRE_REVIEW`, `REQUEST_INFO` | `REVIEW_REQUIRED` | `forbidden` (the desk cannot approve a review) |
| — | `ERROR` | `forbidden` |

The action → status pairing is inferred from the two documented vocabularies (PX: `AUTO_APPROVE`→APPROVE,
`AUTO_REJECT`→REJECT, `ESCALATE`→ESCALATE, `REQUIRE_REVIEW`/`REQUEST_INFO`→REVIEW; grants statuses
ALLOW/ESCALATE/BLOCK/REVIEW_REQUIRED). `metadata.cyclone.rules` gives each rule's desk requirement, risk
bands and amend dial.

## What Festus must provision (H1)

1. A Cyclone workspace: org API key with `decision:enforce` (grants in `ENFORCEMENT`) and `policy:write`.
2. Replace `org_id` (`REPLACE-WITH-CYCLONE-ORG-UUID`) and push: `cd relay && npm run policy:push`
   (`POST /v1/protocol/policies/bundles`; it substitutes `DECIONIS_ORG_ID`). Confirm the bundle is accepted
   as written, especially the points below.
3. Presence-attestation key: `npm run keygen`, then `npm run register:key`
   (`POST /v1/execution/provider-keys`, `purpose: presence_attestation`).
4. WEBHOOK integration pointing at `https://<relay>/webhooks/policy-gate` with a `webhook_secret`, subscribed
   to `authority.escalation_required` and `authority.escalation_resolved`.

## Undocumented — confirm before the live run

- **Condition dialect.** `when` is an open object. The bundle uses `{ "all": [ { field, operator, value } ] }`
  (POL example shape) with `decision_type` (spec §3: `action.type` is the decision type), dotted paths into
  `action.parameters.*`, and operators `EXISTS` (POL), `in` (PX), `lte` / `gt` (POL sample). How a rule
  addresses `action.parameters.*` and the full operator list are not documented (§8.5).
- **Human-approval facts.** Approvals match `agent_safe.human_approval.{result, approver_role, method}`; the
  docs say only that approval facts are "written to `agent_safe.human_approval`" (§2b). Whether a Cyclone
  gesture (`two_hand_hold`, `place`, …) is an acceptable `presence.method` is not documented (§8.4).
  `verification_requirements` is omitted: its methods (`WEBAUTHN`, `MOBILE_DEVICE`, `ACTIVE_LIVENESS`,
  `CARD_TAP`) do not describe a gesture, and Cyclone forbids biometric approval.
- **Amendment ceiling.** Approve-with-changed-arguments is undocumented (§8.3), so the 180 °/s ceiling is
  enforced by the relay (`metadata.cyclone.rules["arm.velocity.walkway_adjacent"].amend.safe_max`) before any
  call; the documented route is a counter-offer and a fresh proposal at ≤ 180 °/s, which this policy holds
  for a two-hand approval like any other arm call.
- `metadata` content, `policy_id`, `decision_domain: "*"`, `protocol_version: "1.1"` and the rule-id format
  are assumed acceptable.

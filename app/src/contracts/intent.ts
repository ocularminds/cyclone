import type { RehearsalSnapshot } from '../core/receipt';
/**
 * Data contracts shared by the client, the scenario engine and the relay.
 * HeldIntent mirrors AGENTS.md §5.1 (fields fixed; optional additions only).
 */

export type Requirement = 'single' | 'two_hand' | 'forbidden';
export type RiskLevel = 0 | 1 | 2 | 3;

/** Agent-Safe Intent v1 (`agent-safe.intent/1`) binding, spec §3. */
export type IntentBinding = {
  protocol_version: 'agent-safe.intent/1';
  tenant_id: string;
  intent_id: string;
  captured_at: string;
  expires_at: string;
  actor: { id: string; type: string; runtime?: string; trust_level?: string };
  action: { type: string; resource: string; parameters: Record<string, unknown> };
  context: { idempotency_key: string; [key: string]: unknown };
  downstream_target: {
    system: string;
    operation: string;
    environment?: string;
    endpoint?: string;
  };
  expected_effect_digest?: string;
};

export type AmendSpec = {
  param: string;
  min: number;
  max: number;
  step: number;
  safe_max?: number;
  unit: string;
};

export type HeldIntent = {
  intent_id: string;
  agent: { id: string; label: string };
  tool: string;
  args: Record<string, unknown>;
  target: { asset_id: string };
  policy: { rule_id: string; requires: Requirement };
  risk: { level: RiskLevel; reasons: string[] };
  rationale?: string;
  expires_at: string;
  /** Agent-Safe Intent v1 hash (`sha256:<hex>`) of `binding`. */
  intent_hash: string;
  // optional additions
  binding?: IntentBinding;
  /** Demo engine only. Never rendered before a decision. */
  is_drill?: boolean;
  amend?: AmendSpec;
  /** One-line summary shown on the card (falls back to rationale). */
  summary?: string;
  /** Set when an agent re-proposes after a counter-offer. */
  supersedes?: string;
};

export type DecisionKind =
  | 'APPROVE'
  | 'APPROVE_AMENDED'
  | 'REJECT'
  | 'ESCALATE'
  | 'AUTO_APPROVE_RULE';

export type ReasonCode = 'user_veto' | 'expired' | 'counter_offer' | 'forbidden';

export type Gesture =
  | 'place'
  | 'two_hand_hold'
  | 'one_hand_gaze_hold'
  | 'gaze_pinch'
  | 'veto_push'
  | 'escalate_place'
  | 'rule'
  /** Added: TTL expiry auto-reject has no user gesture (logged in DECISIONS.md). */
  | 'timeout';

export type Decision = {
  intent_id: string;
  decision: DecisionKind;
  intent_hash: string;
  amended_args?: Record<string, unknown>;
  amended_hash?: string;
  reason?: { code: ReasonCode; suggested?: Record<string, unknown> };
  gesture: Gesture;
  client_ts: string;
};

export type LiveVerification = {
  verified: boolean;
  required_artifact_coverage_verified: boolean;
  trust_anchor: string;
  issuer_tier: string;
  assurance_scope_summary: string;
  checked_at: string;
  /** Only the relay may establish signed action association. Absent in legacy relay responses. */
  intent_binding_verified?: boolean;
  /** Proof retrieval can be retried without submitting another authorization. */
  proof_status?: 'pending' | 'verified' | 'unverified';
  binding_reason?: string;
};

/** Authorization is an upstream fact, independent of whether its proof is available. */
export type Authorization = {
  status: 'unknown' | 'held' | 'approved' | 'rejected' | 'escalated' | 'expired';
  source: 'demo' | 'policy_gate' | 'relay';
  decision_id?: string;
  dossier_id?: string;
};

/** This app has no actuator. A live permission must never imply an observed result. */
export type Execution = {
  eligible: boolean;
  status: 'not_requested' | 'simulated' | 'confirmed';
  reason: string;
};

export type DemoVerification = { demo_signature: string; key_id: string };

export type Rehearsed = { args: Record<string, unknown>; path_samples_ref: string; snapshot?: RehearsalSnapshot };

export type SignedRecord = {
  record_id: string;
  intent_id: string;
  decision: Decision;
  intent_hash: string;
  amended_hash?: string;
  decided_at: string;
  rehearsal: Rehearsed;
  /** Client digest only; never presented as a claim signed by the live policy service. */
  local_rehearsal?: Rehearsed;
  source: 'demo' | 'live';
  dossier?: unknown;
  verification: LiveVerification | DemoVerification;
  authorization?: Authorization;
  /** Held binding retained for independent server/build-time proof association. */
  authority_binding?: IntentBinding;
  execution?: Execution;
  /** Monotonic relay revision prevents a late response from replacing a newer proof check. */
  revision?: number;
  /** Policy refused the amended values; the intent stays held (C12). */
  denied?: { reason: string };
  // display helpers carried with the record so the ledger can replay offline
  tool?: string;
  asset_id?: string;
  agent_id?: string;
  is_drill?: boolean;
};

export const isLive = (v: SignedRecord['verification']): v is LiveVerification =>
  'verified' in v;

import type { IntentBinding } from '../../app/src/contracts/intent';

/**
 * The one HTTP client for the policy gate (Decionis AgentSafe). Every call
 * cites the section of docs/agentsafe.md it implements; anything those docs do
 * not state is a named stub that throws NotDocumented (needs H1). `fetch` is
 * injectable so tests never touch the network. Shared by the relay and the
 * scripted agent (agent/src).
 */

/** OAS `ExecutionAuthorityDecision.status` (docs/agentsafe.md Headline 1, §3a). */
export type GrantStatus = 'ALLOW' | 'ESCALATE' | 'BLOCK' | 'REVIEW_REQUIRED' | 'ERROR';

/** 200 body of POST /v1/authority/grants (docs/agentsafe.md §3a; required fields only typed). */
export type AuthorityDecision = {
  decision_id: string;
  status: GrantStatus;
  should_execute: boolean;
  execution_eligible: boolean;
  reason_codes: string[];
  dossier_id: string;
  dossier_url?: string;
  managed_escalation?: {
    outcome?: string;
    escalation_id?: string;
    intent_id?: string;
    status?: string;
    expires_at?: string;
    reason_codes?: string[];
  };
  expires_at?: string;
  [key: string]: unknown;
};

/** OAS `HumanApprovalEvidence` (docs/agentsafe.md §2b). */
export type HumanApproval =
  | { provider: 'attestation'; attestation: string }
  | { provider: 'presence'; requestId: string; receiptDossierId: string };

export type GrantOptions = {
  /** docs/agentsafe.md §3a: `SHADOW` | `PARALLEL` | `ENFORCEMENT`. */
  mode: 'SHADOW' | 'PARALLEL' | 'ENFORCEMENT';
  evidence?: { humanApproval: HumanApproval };
};

/** A non-2xx answer; body is `{ error, message, request_id, status }` (docs/agentsafe.md §3a). */
export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly body: unknown,
  ) {
    super(`policy gate ${status} ${error}`);
  }
}

/** The relay was asked to take a path the public docs do not describe. Needs H1. */
export class NotDocumented extends Error {
  constructor(
    readonly path: string,
    readonly ref: string,
  ) {
    super(`NOT_DOCUMENTED: ${path} (${ref}); needs H1 confirmation before it can be built`);
  }
}

/** Credentials or keys are missing (H1). */
export class NotConfigured extends Error {
  constructor(readonly what: string) {
    super(`NOT_CONFIGURED: ${what}`);
  }
}

export type UpstreamOptions = {
  base: string;
  apiKey: string | null;
  orgId: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export class Upstream {
  private readonly fetcher: typeof fetch;
  private readonly base: string;

  constructor(private readonly opts: UpstreamOptions) {
    this.fetcher = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.base = opts.base.replace(/\/$/, '');
  }

  /** True when an org API key is present (H1). */
  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  get orgId(): string | null {
    return this.opts.orgId;
  }

  /**
   * docs/agentsafe.md §3a: POST /v1/authority/grants with the Intent v1 binding
   * at the top level plus `intent_hash` and `mode`; `Authorization: Bearer <org
   * API key>`; `Idempotency-Key` must exactly match `intent_id`.
   * docs/agentsafe.md §2b: the same call re-presents a held intent with
   * `evidence.humanApproval` (an ESCALATE becomes ALLOW only if a policy rule
   * matches the approval facts).
   */
  async grant(binding: IntentBinding, intentHash: string, options: GrantOptions): Promise<AuthorityDecision> {
    const body = Upstream.grantBody(binding, intentHash, options);
    return (await this.request('POST', '/v1/authority/grants', {
      body,
      headers: { 'idempotency-key': binding.intent_id },
    })) as AuthorityDecision;
  }

  /** The exact JSON body of a grants call (also printed by the agent's dry run). */
  static grantBody(binding: IntentBinding, intentHash: string, options: GrantOptions): Record<string, unknown> {
    return {
      ...binding,
      intent_hash: intentHash,
      mode: options.mode,
      ...(options.evidence ? { evidence: options.evidence } : {}),
    };
  }

  /**
   * docs/agentsafe.md §5: GET /v1/protocol/dossiers/{dossier_id}?org_id=<uuid>
   * (Bearer API key) → `{ service, protocol_version, dossier }`.
   */
  async dossier(dossierId: string): Promise<unknown> {
    if (!this.opts.orgId) throw new NotConfigured('DECIONIS_ORG_ID');
    const path = `/v1/protocol/dossiers/${encodeURIComponent(dossierId)}?org_id=${encodeURIComponent(this.opts.orgId)}`;
    return this.request('GET', path);
  }

  /**
   * docs/agentsafe.md §2b: DELETE /v1/authority/escalations/{escalationId}
   * cancels a managed escalation "without authorizing execution".
   */
  async cancelEscalation(escalationId: string): Promise<void> {
    await this.request('DELETE', `/v1/authority/escalations/${encodeURIComponent(escalationId)}`);
  }

  /**
   * docs/agentsafe.md §2b: POST /v1/execution/provider-keys registers the
   * presence-attestation public key (`kid`, `issuer`, `algorithm: EdDSA`,
   * `public_jwk`, `purpose: presence_attestation`; needs policy:write or org:*).
   */
  async registerProviderKey(input: { kid: string; issuer: string; public_jwk: Record<string, unknown> }): Promise<unknown> {
    return this.request('POST', '/v1/execution/provider-keys', {
      body: { ...input, algorithm: 'EdDSA', purpose: 'presence_attestation' },
    });
  }

  /** docs/agentsafe.md §4: POST /v1/protocol/policies/bundles (Bearer API key). */
  async pushPolicy(bundle: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', '/v1/protocol/policies/bundles', { body: bundle });
  }

  /** docs/agentsafe.md §5: the pinned dossier JWKS is public; no credentials are sent. */
  async publicJson(url: string): Promise<unknown> {
    const res = await this.fetcher(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 10_000),
    });
    if (!res.ok) throw new UpstreamError(res.status, 'JWKS_UNAVAILABLE', null);
    return res.json();
  }

  // --- Stubs: the public docs are silent (docs/agentsafe.md §8). Each needs H1. ---

  /** Approve-with-changed-arguments for a held intent: no endpoint or field exists (Headline 3, §8.3). */
  async approveAmended(): Promise<never> {
    throw new NotDocumented('approve-with-changed-arguments', 'docs/agentsafe.md Headline 3, §8.3');
  }

  /** Explicitly reject an ESCALATE on /v1/authority/grants: none documented; the hold lapses (§8.6). */
  async rejectHeld(): Promise<never> {
    throw new NotDocumented('explicit reject of a held grant', 'docs/agentsafe.md §2, §8.6');
  }

  /** Case-inbox `escalate` verb for a grants ESCALATE: caseId mapping and semantics undocumented (§2a, §8.4). */
  async escalateCase(): Promise<never> {
    throw new NotDocumented('escalate a held grant to a second reviewer', 'docs/agentsafe.md §2a, §8.4');
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    extra: { body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<unknown> {
    if (!this.opts.apiKey) throw new NotConfigured('DECIONIS_API_KEY');
    const headers: Record<string, string> = {
      accept: 'application/json',
      // docs/agentsafe.md §3a: OAS ApiKeyAuth
      authorization: `Bearer ${this.opts.apiKey}`,
      ...(extra.headers ?? {}),
    };
    if (extra.body !== undefined) headers['content-type'] = 'application/json';
    const res = await this.fetcher(`${this.base}${path}`, {
      method,
      headers,
      body: extra.body === undefined ? undefined : JSON.stringify(extra.body),
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? 15_000),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const err = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      const code = typeof err.error === 'string' ? err.error : typeof err.code === 'string' ? err.code : `HTTP_${res.status}`;
      throw new UpstreamError(res.status, code, parsed);
    }
    return parsed;
  }
}

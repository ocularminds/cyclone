import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** relay/ (this file lives in relay/src). */
export const RELAY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(RELAY_ROOT, '..');

export type Session = { token: string; subject: string };

export type RelayConfig = {
  port: number;
  host: string;
  /** Static client sessions (Bearer tokens) until real login exists. */
  sessions: Session[];
  /** Bearer token the scripted agent uses for POST /held (and the WebSocket). */
  agentToken: string | null;
  /** CORS allow-list for the headset origin; `*` allows any. */
  origins: string[];
  /** GET /capabilities → supportsAmendedApproval. Default false (DECISIONS D20a). */
  amendedApproval: boolean;
  /** Present an ESCALATE only after the held-intent webhook confirmed it. */
  requireWebhook: boolean;
  webhook: { secret: string | null; bearer: string | null; allowUnsigned: boolean };
  upstream: {
    base: string;
    apiKey: string | null;
    orgId: string | null;
    /** Gate for the undocumented explicit-reject stub (docs/agentsafe.md §8.6). */
    reject: boolean;
    /** Gate for the undocumented case-escalate stub (docs/agentsafe.md §2a, §8.4). */
    escalate: boolean;
  };
  attest: {
    /** Ed25519 private key: PKCS#8 PEM, a path to one, or a private JWK as JSON. */
    key: string | null;
    kid: string | null;
    issuer: string | null;
    role: string;
    /** Override for `presence.method`; default is the Cyclone gesture. */
    method: string | null;
  };
  /** Dossier JWKS: the pinned production URL, or a local file (never an official anchor). */
  jwks: { url: string; file: string | null };
  policyPath: string;
  castPath: string;
  /** Where held intents and records persist; null keeps them in memory. */
  dataDir: string | null;
  /** C49: when set, webhook payloads, handoffs and sealed records are saved here. */
  recordDir: string | null;
  sweepMs: number;
  now: () => number;
};

export class Config {
  static readonly PINNED_JWKS = 'https://api.decionis.com/.well-known/decision-dossier-jwks.json';
  static readonly API_BASE = 'https://api.decionis.com';

  static defaults(over: Partial<RelayConfig> = {}): RelayConfig {
    return {
      port: 8787,
      host: '0.0.0.0',
      sessions: [],
      agentToken: null,
      origins: ['*'],
      amendedApproval: false,
      requireWebhook: false,
      webhook: { secret: null, bearer: null, allowUnsigned: false },
      upstream: { base: Config.API_BASE, apiKey: null, orgId: null, reject: false, escalate: false },
      attest: { key: null, kid: null, issuer: null, role: 'CYCLONE_OPERATOR', method: null },
      jwks: { url: Config.PINNED_JWKS, file: null },
      policyPath: join(REPO_ROOT, 'policy/cyclone.json'),
      castPath: join(REPO_ROOT, 'app/src/scenario/agents.json'),
      dataDir: null,
      recordDir: null,
      sweepMs: 1000,
      now: () => Date.now(),
      ...over,
    };
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): RelayConfig {
    const flag = (name: string) => /^(1|true|yes|on)$/i.test(env[name] ?? '');
    const text = (name: string) => (env[name]?.trim() ? env[name]!.trim() : null);
    const path = (name: string, fallback: string | null) => {
      const value = text(name);
      if (!value) return fallback;
      return isAbsolute(value) ? value : resolve(RELAY_ROOT, value);
    };
    const base = Config.defaults();
    return Config.defaults({
      port: Number(env.PORT ?? base.port),
      host: text('HOST') ?? base.host,
      sessions: Config.sessions(env.RELAY_SESSIONS ?? ''),
      agentToken: text('RELAY_AGENT_TOKEN'),
      origins: (env.RELAY_ORIGINS ?? '*').split(',').map((o) => o.trim()).filter(Boolean),
      amendedApproval: flag('RELAY_AMENDED_APPROVAL'),
      requireWebhook: flag('RELAY_REQUIRE_WEBHOOK'),
      webhook: {
        secret: text('RELAY_WEBHOOK_SECRET'),
        bearer: text('RELAY_WEBHOOK_BEARER'),
        allowUnsigned: flag('RELAY_WEBHOOK_UNSIGNED'),
      },
      upstream: {
        base: text('DECIONIS_API_BASE') ?? base.upstream.base,
        apiKey: text('DECIONIS_API_KEY'),
        orgId: text('DECIONIS_ORG_ID'),
        reject: flag('RELAY_UPSTREAM_REJECT'),
        escalate: flag('RELAY_UPSTREAM_ESCALATE'),
      },
      attest: {
        key: text('RELAY_ATTEST_KEY'),
        kid: text('RELAY_ATTEST_KID'),
        issuer: text('RELAY_ATTEST_ISSUER'),
        role: text('RELAY_APPROVER_ROLE') ?? base.attest.role,
        method: text('RELAY_PRESENCE_METHOD'),
      },
      jwks: { url: text('RELAY_JWKS_URL') ?? base.jwks.url, file: path('RELAY_JWKS_FILE', null) },
      policyPath: path('RELAY_POLICY', base.policyPath)!,
      castPath: path('RELAY_CAST', base.castPath)!,
      dataDir: path('RELAY_DATA_DIR', join(RELAY_ROOT, '.data')),
      recordDir: flag('RELAY_RECORD') ? path('RELAY_RECORD_DIR', join(RELAY_ROOT, 'src/fixtures/recorded')) : null,
      sweepMs: Number(env.RELAY_SWEEP_MS ?? base.sweepMs),
    });
  }

  /** `token:subject,token2:subject2` → sessions; a bare token gets subject `operator`. */
  static sessions(spec: string): Session[] {
    return spec
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const at = s.indexOf(':');
        return at < 0 ? { token: s, subject: 'operator' } : { token: s.slice(0, at), subject: s.slice(at + 1) || 'operator' };
      });
  }
}

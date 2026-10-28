import {
  assessDossierAssuranceScope,
  assessDossierIssuer,
  assessJwksTrustAnchor,
  extractDossierPayload,
  verifyDossierProofBundle,
  type AssuranceScope,
  type IssuerAssessment,
  type VerifyResult,
} from '@decionis/verify';
import { readFile } from 'node:fs/promises';
import type { LiveVerification } from '../../app/src/contracts/intent';
import { Config, type RelayConfig } from './config';
import { Brand, Json } from './errors';
import type { Upstream } from './upstream';

export type Checked = {
  verification: LiveVerification;
  /** Raw signature validity, before coverage and trust-anchor gating. */
  signatures: boolean;
  payload: Record<string, unknown> | null;
  result: VerifyResult | null;
};

export type JwksSnapshot = { source: string; jwks: unknown; fetched_at: string };

/**
 * Dossier verification (C39), server-side only: `@decionis/verify` imports
 * Node built-ins and never ships to the headset. A seal is verified only when
 * the signatures verify, every required artifact is covered, and the JWKS
 * came from the pinned production URL (trust anchor `DECIONIS_OFFICIAL`).
 * Anything else seals as unverified (fail closed). Text that reaches the
 * headset is brand-free.
 */
export class Verifier {
  private cache: JwksSnapshot | null = null;
  private cachedAt = 0;

  constructor(
    /** JWKS source: an https URL (trust assessed from it) or a local file path (never official). */
    readonly source: string,
    private readonly loader: (source: string) => Promise<unknown>,
    private readonly now: () => number,
    private readonly ttlMs = 60 * 60 * 1000,
  ) {}

  static forConfig(cfg: RelayConfig, upstream: Upstream): Verifier {
    if (cfg.jwks.file) return new Verifier(cfg.jwks.file, Verifier.readFile, cfg.now);
    // docs/agentsafe.md §5: pin https://api.decionis.com/.well-known/decision-dossier-jwks.json
    return new Verifier(cfg.jwks.url, (url) => upstream.publicJson(url), cfg.now);
  }

  static async readFile(path: string): Promise<unknown> {
    return JSON.parse(await readFile(path, 'utf8'));
  }

  /** Fetched once and cached; refreshed after the TTL (key rotation overlaps, per §5). */
  async jwks(): Promise<JwksSnapshot> {
    const now = this.now();
    if (this.cache && now - this.cachedAt < this.ttlMs) return this.cache;
    const jwks = await this.loader(this.source);
    this.cache = { source: this.source, jwks, fetched_at: new Date(now).toISOString() };
    this.cachedAt = now;
    return this.cache;
  }

  /** Verify a dossier body (any common envelope); optionally pin its dossier_id. */
  async check(body: unknown, expectedId?: string): Promise<Checked> {
    const at = new Date(this.now()).toISOString();
    let snapshot: JwksSnapshot;
    try {
      snapshot = await this.jwks();
    } catch {
      return Verifier.unavailable('The signing keys could not be loaded; sealed as unverified.', at);
    }
    return Verifier.assess(body, snapshot.jwks, snapshot.source, at, expectedId);
  }

  /** Pure: the same computation the relay runs live and record.ts runs at build time. */
  static assess(body: unknown, jwks: unknown, source: string, checkedAt: string, expectedId?: string): Checked {
    let payload: Record<string, unknown>;
    try {
      payload = extractDossierPayload(body);
    } catch {
      return Verifier.unavailable('The signed record could not be read; sealed as unverified.', checkedAt);
    }
    if (!Json.isObject(payload) || Object.keys(payload).length === 0) {
      return Verifier.unavailable('The signed record could not be read; sealed as unverified.', checkedAt);
    }
    const result = verifyDossierProofBundle({ dossier_payload: payload, public_jwks: jwks });
    const anchor = assessJwksTrustAnchor(source);
    const paths = new Set(result.verified_artifact_paths ?? []);
    const issuer = assessDossierIssuer(payload, paths);
    const authentic = result.verified && anchor.trusted;
    const scope = assessDossierAssuranceScope(result, payload, authentic);
    const coverage = result.required_artifact_coverage_verified === true;
    const idMatches = expectedId === undefined || payload.dossier_id === expectedId;
    const verified = result.verified === true && coverage && anchor.status === 'DECIONIS_OFFICIAL' && idMatches;
    const head = [
      result.verified ? 'Signatures valid' : 'Signatures invalid',
      coverage ? 'coverage complete' : 'coverage incomplete',
      anchor.status === 'DECIONIS_OFFICIAL' ? 'official key source' : 'key source not the official anchor',
      ...(idMatches ? [] : ['record id mismatch']),
    ].join(' · ');
    return {
      verification: {
        verified,
        required_artifact_coverage_verified: coverage,
        trust_anchor: anchor.status,
        issuer_tier: Verifier.tier(issuer, authentic),
        assurance_scope_summary: `${head}. ${Verifier.summary(scope)}`,
        checked_at: checkedAt,
      },
      signatures: result.verified === true,
      payload,
      result,
    };
  }

  /** No dossier to check: always unverified, never executable. */
  static unavailable(reason: string, checkedAt: string): Checked {
    return {
      verification: {
        verified: false,
        required_artifact_coverage_verified: false,
        trust_anchor: 'UNAVAILABLE',
        issuer_tier: 'unknown',
        assurance_scope_summary: Brand.scrub(reason),
        checked_at: checkedAt,
      },
      signatures: false,
      payload: null,
      result: null,
    };
  }

  /** Honest issuer label; a provisional anonymous workspace says so (AGENTS C39). */
  static tier(issuer: IssuerAssessment, authentic: boolean): string {
    const base =
      issuer.unknown_tier !== null
        ? `unrecognised tier "${issuer.unknown_tier}"`
        : issuer.tier === 'owned'
          ? 'owned workspace'
          : issuer.tier === 'provisional_anonymous'
            ? 'provisional anonymous workspace (never claimed by a person)'
            : 'not stated';
    const established = authentic && issuer.signature_covered;
    return Brand.scrub(issuer.tier === null && issuer.unknown_tier === null ? base : established ? base : `${base} (claim unestablished)`);
  }

  /** Short, brand-free scope line from the verifier's own keys. */
  static summary(scope: AssuranceScope): string {
    const words = (items: AssuranceScope['established']) => items.map((i) => i.key.replace(/_/g, ' ')).join(', ') || 'nothing';
    return `Established: ${words(scope.established)}. Not established: ${words(scope.not_established)}.`;
  }

  static pinned(): string {
    return Config.PINNED_JWKS;
  }
}

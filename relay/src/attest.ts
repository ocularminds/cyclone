import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { RelayConfig } from './config';

/**
 * Presence attestation for docs/agentsafe.md §2b: a compact JWS, header
 * `alg: EdDSA`, `typ: decionis-presence-attestation+jwt`, `kid`; payload
 * (OAS `PresenceAttestationClaims`) `iss`, `aud` (org uuid = tenant_id), `sub`,
 * `iat`, `exp` (≤ 300 s after `iat`), `jti`, `intent_id`, `intent_hash`,
 * `presence: { method, result, approver_role }`. The key's public half must be
 * registered at POST /v1/execution/provider-keys (H1).
 */
export type AttestClaims = {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  intent_id: string;
  intent_hash: string;
  presence: { method: string; result: 'VERIFIED' | 'FAILED'; approver_role: string };
};

export class Attestor {
  static readonly TYP = 'decionis-presence-attestation+jwt';
  /** Docs cap exp at 300 s after iat; stay well inside it. */
  static readonly LIFETIME_S = 120;

  constructor(
    private readonly key: KeyObject,
    readonly kid: string,
    readonly issuer: string,
    readonly role: string,
    private readonly method: string | null,
    private readonly now: () => number,
  ) {
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Attestation key must be Ed25519');
  }

  /** Null when the relay has no attestation key (approvals then answer 503 until H1). */
  static fromConfig(cfg: RelayConfig): Attestor | null {
    const { key, kid, issuer, role, method } = cfg.attest;
    if (!key || !kid || !issuer) return null;
    return new Attestor(Attestor.loadKey(key), kid, issuer, role, method, cfg.now);
  }

  /** PKCS#8 PEM text, a path to a PEM file, or a private OKP JWK as JSON. */
  static loadKey(spec: string): KeyObject {
    const text = !spec.includes('-----BEGIN') && !spec.trim().startsWith('{') && existsSync(spec) ? readFileSync(spec, 'utf8') : spec;
    if (text.trim().startsWith('{')) return createPrivateKey({ key: JSON.parse(text), format: 'jwk' });
    return createPrivateKey(text);
  }

  sign(input: { tenant_id: string; intent_id: string; intent_hash: string; subject: string; gesture: string }): string {
    const iat = Math.floor(this.now() / 1000);
    const claims: AttestClaims = {
      iss: this.issuer,
      aud: input.tenant_id,
      sub: input.subject,
      iat,
      exp: iat + Attestor.LIFETIME_S,
      jti: randomUUID(),
      intent_id: input.intent_id,
      intent_hash: input.intent_hash,
      presence: { method: this.method ?? input.gesture, result: 'VERIFIED', approver_role: this.role },
    };
    const header = { alg: 'EdDSA', typ: Attestor.TYP, kid: this.kid };
    const signingInput = `${Attestor.b64(JSON.stringify(header))}.${Attestor.b64(JSON.stringify(claims))}`;
    const signature = sign(null, Buffer.from(signingInput), this.key).toString('base64url');
    return `${signingInput}.${signature}`;
  }

  publicJwk(): Record<string, unknown> {
    const jwk = createPublicKey(this.key).export({ format: 'jwk' }) as Record<string, unknown>;
    return { ...jwk, kid: this.kid, alg: 'EdDSA', use: 'sig' };
  }

  /** Fresh Ed25519 pair for `npm run keygen`. */
  static generate(): { privatePem: string; publicJwk: Record<string, unknown> } {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    return {
      privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
      publicJwk: publicKey.export({ format: 'jwk' }) as Record<string, unknown>,
    };
  }

  /** Decode and check a compact JWS against a public JWK (tests and diagnostics). */
  static open(jws: string, publicJwk: Record<string, unknown>): { header: Record<string, unknown>; claims: AttestClaims } | null {
    const parts = jws.split('.');
    if (parts.length !== 3) return null;
    const key = createPublicKey({ key: publicJwk as never, format: 'jwk' });
    const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], 'base64url'));
    if (!ok) return null;
    return {
      header: JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')),
      claims: JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')),
    };
  }

  private static b64(text: string): string {
    return Buffer.from(text, 'utf8').toString('base64url');
  }
}

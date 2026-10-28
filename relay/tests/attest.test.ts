import { createPrivateKey } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Attestor } from '../src/attest';
import { Config } from '../src/config';

const input = {
  tenant_id: '6f1c2a7e-3b4d-4e5f-9a0b-1c2d3e4f5a6b',
  intent_id: '0b7d8e7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  intent_hash: `sha256:${'c'.repeat(64)}`,
  subject: 'operator-1',
  gesture: 'place',
};

describe('presence attestation JWS (docs/agentsafe.md §2b)', () => {
  it('is a compact EdDSA JWS with the documented header and claims, exp ≤ 300 s after iat', () => {
    const { privatePem, publicJwk } = Attestor.generate();
    const a = new Attestor(Attestor.loadKey(privatePem), 'kid-1', 'https://cyclone.example/attest', 'CYCLONE_OPERATOR', null, () => Date.UTC(2026, 10, 10));
    const jws = a.sign(input);
    expect(jws.split('.')).toHaveLength(3);
    const opened = Attestor.open(jws, publicJwk)!;
    expect(opened.header).toEqual({ alg: 'EdDSA', typ: 'decionis-presence-attestation+jwt', kid: 'kid-1' });
    expect(opened.claims).toMatchObject({
      iss: 'https://cyclone.example/attest',
      aud: input.tenant_id,
      sub: 'operator-1',
      intent_id: input.intent_id,
      intent_hash: input.intent_hash,
      presence: { method: 'place', result: 'VERIFIED', approver_role: 'CYCLONE_OPERATOR' },
    });
    expect(opened.claims.iat).toBe(Date.UTC(2026, 10, 10) / 1000);
    expect(opened.claims.exp - opened.claims.iat).toBeLessThanOrEqual(300);
    expect(opened.claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.publicJwk()).toMatchObject({ kty: 'OKP', crv: 'Ed25519', x: publicJwk.x, kid: 'kid-1', alg: 'EdDSA' });
  });

  it('a tampered token or another key does not open', () => {
    const one = Attestor.generate();
    const two = Attestor.generate();
    const a = new Attestor(Attestor.loadKey(one.privatePem), 'k', 'iss', 'R', 'WEBAUTHN', () => 0);
    const jws = a.sign(input);
    expect(Attestor.open(jws, two.publicJwk)).toBeNull();
    const [h, p, s] = jws.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), intent_hash: 'sha256:x' })).toString('base64url');
    expect(Attestor.open(`${h}.${forged}.${s}`, one.publicJwk)).toBeNull();
    expect(Attestor.open(jws, one.publicJwk)?.claims.presence.method).toBe('WEBAUTHN');
  });

  it('loads the key from PEM text, a PEM file or a private JWK; absent config → no attestor', () => {
    const { privatePem } = Attestor.generate();
    const file = join(mkdtempSync(join(tmpdir(), 'cyclone-key-')), 'attest.pem');
    writeFileSync(file, privatePem);
    const jwk = JSON.stringify(createPrivateKey(privatePem).export({ format: 'jwk' }));
    for (const spec of [privatePem, file, jwk]) expect(Attestor.loadKey(spec).asymmetricKeyType).toBe('ed25519');
    expect(Attestor.fromConfig(Config.defaults())).toBeNull();
  });
});

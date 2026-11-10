import * as ed from '@noble/ed25519';
import type { DemoVerification, SignedRecord } from '../contracts/intent';
import type { Store } from '../state/store';
import { Canon } from './canon';

type KeyPair = { secret: Uint8Array; publicKey: Uint8Array; keyId: string };

/**
 * Demo-mode record signer (C39): Ed25519 via @noble/ed25519 with a
 * per-install key, over Decionis sorted JSON v1. Labelled "demo signature"
 * everywhere it is shown; it never claims the official trust anchor.
 */
export class DemoSigner {
  private pair: KeyPair | null = null;

  constructor(private readonly store: Store) {}

  async keys(): Promise<KeyPair> {
    if (this.pair) return this.pair;
    const saved = this.store.read<unknown>('demoKey', null);
    const valid = typeof saved === 'string' && /^[0-9a-f]{64}$/i.test(saved);
    if (saved !== null && !valid) this.store.write('demoKeyCorrupt', saved);
    const secret = valid ? Canon.fromHex(saved) : ed.utils.randomPrivateKey();
    if (!valid) this.store.write('demoKey', Canon.hex(secret));
    const publicKey = await ed.getPublicKeyAsync(secret);
    const keyId = `demo-${(await Canon.sha256(Canon.hex(publicKey))).slice(0, 16)}`;
    this.pair = { secret, publicKey, keyId };
    return this.pair;
  }

  /** The bytes that are signed: the record without its verification block. */
  static payload(record: Omit<SignedRecord, 'verification'> | SignedRecord): string {
    const { verification: _ignored, ...rest } = record as SignedRecord;
    return Canon.stringify(rest);
  }

  async sign(record: Omit<SignedRecord, 'verification'>): Promise<SignedRecord> {
    // Re-signing a migrated local record replaces its export envelope, without nesting it.
    const { dossier: _oldExport, ...content } = structuredClone(record);
    const { secret, keyId } = await this.keys();
    const portable = DemoSigner.payload(content);
    const artifactSignature = await ed.signAsync(Canon.utf8(portable), secret);
    // Published proof-bundle 2.0: one signed portable document. No Protocol 1.1
    // authority or execution-binding claims are made by a local demo issuer.
    const dossier = {
      schema_version: 'decionis.decision_dossier/2.0', dossier_id: content.record_id,
      portable_artifact: content,
      integrity: { proof_bundle: {
        bundle_type: 'decionis.decision_dossier.proof_bundle', version: '2.0',
        issued_at: content.decided_at, algorithm: 'Ed25519', key_id: keyId,
        rotation_policy: { strategy: 'JWKS_OVERLAP', active_key_id: keyId, previous_key_ids: [], verification_grace_period_days: 30, rotated_at: null, public_jwks_path: '/.well-known/decision-dossier-jwks.json' },
        artifacts: [{ artifact_kind: 'portable_artifact', media_type: 'application/json', document_path: '/portable_artifact',
          canonical_document_sha256: await Canon.sha256(portable), signature: DemoSigner.b64url(artifactSignature) }],
      } },
    };
    const full = { ...content, dossier };
    const sig = await ed.signAsync(Canon.utf8(DemoSigner.payload(full)), secret);
    const verification: DemoVerification = { demo_signature: Canon.hex(sig), key_id: keyId };
    return { ...full, verification };
  }

  /** A single download works as both --file and --jwks; it contains no private key. */
  async export(record: SignedRecord): Promise<{ dossier_payload: unknown; keys: unknown[]; source: string }> {
    if (record.source !== 'demo' || !record.dossier || !(await this.verify(record))) throw new Error('No valid demo proof export for this record.');
    return { dossier_payload: structuredClone(record.dossier), keys: [await this.publicJwk()], source: 'Cyclone demo signature; no external authority or execution claim' };
  }

  async verify(record: SignedRecord): Promise<boolean> {
    const v = record.verification as DemoVerification;
    if (!v.demo_signature) return false;
    const { publicKey, keyId } = await this.keys();
    if (v.key_id !== keyId) return false;
    try {
      return await ed.verifyAsync(
        Canon.fromHex(v.demo_signature),
        Canon.utf8(DemoSigner.payload(record)),
        publicKey,
      );
    } catch {
      return false;
    }
  }

  async publicJwk(): Promise<{ kty: 'OKP'; crv: 'Ed25519'; x: string; kid: string }> {
    const { publicKey, keyId } = await this.keys();
    return { kty: 'OKP', crv: 'Ed25519', x: DemoSigner.b64url(publicKey), kid: keyId };
  }

  static b64url(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}

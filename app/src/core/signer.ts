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
    const saved = this.store.read<string | null>('demoKey', null);
    const secret = saved ? Canon.fromHex(saved) : ed.utils.randomPrivateKey();
    if (!saved) this.store.write('demoKey', Canon.hex(secret));
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
    const { secret, keyId } = await this.keys();
    const sig = await ed.signAsync(Canon.utf8(DemoSigner.payload(record)), secret);
    const verification: DemoVerification = { demo_signature: Canon.hex(sig), key_id: keyId };
    return { ...record, verification };
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

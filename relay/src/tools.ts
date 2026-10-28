import { readFileSync } from 'node:fs';
import { Attestor } from './attest';
import { Config } from './config';
import { Upstream } from './upstream';

/**
 * H1 helpers (each needs credentials except keygen):
 *   npm run keygen          new Ed25519 presence-attestation key (PEM + public JWK)
 *   npm run register:key    docs/agentsafe.md §2b: POST /v1/execution/provider-keys
 *   npm run policy:push     docs/agentsafe.md §4: POST /v1/protocol/policies/bundles
 */
async function main(cmd: string | undefined): Promise<number> {
  const cfg = Config.fromEnv();
  const upstream = new Upstream({ base: cfg.upstream.base, apiKey: cfg.upstream.apiKey, orgId: cfg.upstream.orgId });

  if (cmd === 'keygen') {
    const { privatePem, publicJwk } = Attestor.generate();
    console.log('# Store the private key as RELAY_ATTEST_KEY (PEM text or a file path). Never commit it.');
    console.log(privatePem);
    console.log('# Public JWK to register (npm run register:key):');
    console.log(JSON.stringify(publicJwk, null, 2));
    return 0;
  }

  if (cmd === 'register-key') {
    const attestor = Attestor.fromConfig(cfg);
    if (!attestor) {
      console.error('Set RELAY_ATTEST_KEY, RELAY_ATTEST_KID and RELAY_ATTEST_ISSUER first.');
      return 2;
    }
    const input = { kid: attestor.kid, issuer: attestor.issuer, public_jwk: attestor.publicJwk() };
    if (!upstream.configured) {
      console.log('Dry run (no DECIONIS_API_KEY): POST /v1/execution/provider-keys');
      console.log(JSON.stringify({ ...input, algorithm: 'EdDSA', purpose: 'presence_attestation' }, null, 2));
      return 0;
    }
    console.log(JSON.stringify(await upstream.registerProviderKey(input), null, 2));
    return 0;
  }

  if (cmd === 'push-policy') {
    const bundle = JSON.parse(readFileSync(cfg.policyPath, 'utf8')) as Record<string, unknown>;
    if (cfg.upstream.orgId) bundle.org_id = cfg.upstream.orgId;
    if (!upstream.configured || !cfg.upstream.orgId) {
      console.log('Dry run (needs DECIONIS_API_KEY and DECIONIS_ORG_ID): POST /v1/protocol/policies/bundles');
      console.log(JSON.stringify(bundle, null, 2));
      return 0;
    }
    console.log(JSON.stringify(await upstream.pushPolicy(bundle), null, 2));
    return 0;
  }

  console.log('usage: tsx src/tools.ts keygen | register-key | push-policy');
  return 2;
}

main(process.argv[2]).then(
  (code) => (process.exitCode = code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  },
);

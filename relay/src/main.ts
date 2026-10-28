import { Config } from './config';
import { Relay } from './server';

/** `npm start`: run the relay with configuration from the environment (see README.md). */
const cfg = Config.fromEnv();
const relay = await Relay.create(cfg, { logger: true });
const address = await relay.listen();

const status = (on: boolean) => (on ? 'configured' : 'not configured (H1)');
relay.app.log.info(
  {
    address,
    sessions: cfg.sessions.length,
    agent: Boolean(cfg.agentToken),
    upstream: status(relay.upstream.configured),
    attestation: status(Boolean(relay.attestor)),
    webhookSignature: status(Boolean(cfg.webhook.secret)),
    jwks: cfg.jwks.file ?? cfg.jwks.url,
    amendedApproval: cfg.amendedApproval,
    recording: cfg.recordDir,
  },
  'cyclone relay ready',
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void relay.close().finally(() => process.exit(0));
  });
}

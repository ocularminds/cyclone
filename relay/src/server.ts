import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { Attestor } from './attest';
import { Auth } from './auth';
import type { RelayConfig } from './config';
import { Resolver } from './decide';
import { Brand, RelayError } from './errors';
import { Intake } from './held';
import { Hub } from './hub';
import { PolicyBook } from './policy';
import { Recorder } from './record';
import { Sealer } from './seal';
import { Store } from './store';
import { Upstream } from './upstream';
import { Verifier } from './verify';
import { Webhook } from './webhook';

type RawRequest = FastifyRequest & { rawBody?: string };

export type RelayDeps = {
  /** Injected into every upstream call (policy gate API and JWKS); tests mock it. */
  fetch?: typeof fetch;
  logger?: boolean;
};

/**
 * Cyclone live-mode relay (C35, AGENTS §8.1). Endpoints:
 *   GET  /capabilities                    { supportsAmendedApproval, source: 'live' }
 *   GET  /ws?session=…                    intent.held / intent.expired / intent.resolved / record.sealed
 *   POST /intents/{intent_id}/decision    Bearer session; Decision → SignedRecord
 *   POST /webhooks/policy-gate            held-intent webhook (docs/agentsafe.md §1)
 *   POST /held                            agent hands over the full binding (Bearer agent token)
 *   GET  /health                          what is configured (no secrets)
 */
export class Relay {
  readonly app: FastifyInstance;
  readonly store: Store;
  readonly hub = new Hub();
  readonly policy: PolicyBook;
  readonly upstream: Upstream;
  readonly verifier: Verifier;
  readonly attestor: Attestor | null;
  readonly recorder: Recorder | null;
  readonly intake: Intake;
  readonly resolver: Resolver;
  readonly auth: Auth;
  private timer: NodeJS.Timeout | null = null;

  private constructor(
    readonly cfg: RelayConfig,
    deps: RelayDeps,
  ) {
    this.app = Fastify({
      // Never log a WebSocket session token (it travels in the query string).
      logger: deps.logger
        ? {
            serializers: {
              req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url.replace(/([?&]session=)[^&]*/, '$1***') }),
            },
          }
        : false,
      bodyLimit: 1024 * 1024,
    });
    this.store = new Store(cfg.dataDir);
    this.policy = PolicyBook.load(cfg.policyPath);
    this.upstream = new Upstream({ base: cfg.upstream.base, apiKey: cfg.upstream.apiKey, orgId: cfg.upstream.orgId, fetch: deps.fetch });
    this.verifier = Verifier.forConfig(cfg, this.upstream);
    this.attestor = Attestor.fromConfig(cfg);
    this.recorder = Recorder.forConfig(cfg, this.verifier);
    this.auth = new Auth(cfg);
    this.intake = new Intake(this.store, this.policy, this.hub, cfg, Intake.labels(cfg.castPath), this.recorder);
    const sealer = new Sealer(this.upstream, this.verifier, cfg.now);
    this.resolver = new Resolver(this.store, this.policy, sealer, this.upstream, this.attestor, this.hub, cfg, this.recorder);
  }

  static async create(cfg: RelayConfig, deps: RelayDeps = {}): Promise<Relay> {
    const relay = new Relay(cfg, deps);
    await relay.app.register(websocket);
    relay.routes();
    await relay.app.ready();
    return relay;
  }

  private routes(): void {
    const { app, cfg } = this;

    // Keep the raw body: the webhook signature is over the exact bytes (docs/agentsafe.md §1).
    app.removeAllContentTypeParsers();
    app.addContentTypeParser('*', { parseAs: 'string' }, (req, body, done) => {
      const text = String(body ?? '');
      (req as RawRequest).rawBody = text;
      if (!text) return done(null, {});
      try {
        done(null, JSON.parse(text));
      } catch {
        done(RelayError.badRequest('Body is not JSON.'), undefined);
      }
    });

    app.addHook('onRequest', async (req, reply) => {
      const origin = req.headers.origin;
      const any = cfg.origins.includes('*');
      if (origin && (any || cfg.origins.includes(origin))) {
        reply.header('access-control-allow-origin', any ? '*' : origin);
        reply.header('vary', 'origin');
      }
    });
    app.options('/*', async (_req, reply) => {
      reply.header('access-control-allow-methods', 'GET,POST,OPTIONS');
      reply.header('access-control-allow-headers', 'authorization,content-type');
      reply.header('access-control-max-age', '600');
      return reply.code(204).send();
    });

    app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
      if (err instanceof RelayError) return reply.code(err.status).send(err.body());
      if (err.statusCode && err.statusCode < 500) {
        return reply.code(err.statusCode).send({ code: 'BAD_REQUEST', detail: Brand.scrub(err.message) });
      }
      req.log.error(err);
      return reply.code(500).send({ code: 'UNAVAILABLE', detail: 'Relay error; the intent stays held.' });
    });

    app.get('/health', async () => ({
      ok: true,
      upstream: this.upstream.configured,
      attestation: Boolean(this.attestor),
      webhook_signed: Boolean(cfg.webhook.secret),
      amended_approval: cfg.amendedApproval,
      held: this.store.held().length,
      peers: this.hub.size,
    }));

    // Public on purpose: it holds no secret, and the client must learn the real flag
    // (app/src/adapters/live.ts keeps its default when this call fails).
    app.get('/capabilities', async () => ({ supportsAmendedApproval: cfg.amendedApproval, source: 'live' as const }));

    app.get(
      '/ws',
      {
        websocket: true,
        preValidation: async (req: FastifyRequest, reply: FastifyReply) => {
          const { session } = (req.query ?? {}) as { session?: string };
          if (!this.auth.socket(session)) {
            await reply.code(401).send({ code: 'UNAUTHORIZED', detail: 'A valid relay session is required.' });
          }
        },
      },
      (socket) => {
        this.hub.add(socket, this.store.held().map((e) => e.intent!));
        socket.on('close', () => this.hub.remove(socket));
        socket.on('error', () => this.hub.remove(socket));
      },
    );

    app.post('/intents/:intentId/decision', async (req) => {
      const who = this.auth.client(req.headers.authorization);
      const { intentId } = req.params as { intentId: string };
      return this.resolver.resolve(req.body, intentId, who.subject);
    });

    app.post('/held', async (req) => {
      this.auth.agent(req.headers.authorization);
      return this.intake.handoff(req.body);
    });

    app.post('/webhooks/policy-gate', async (req, reply) => {
      const raw = (req as RawRequest).rawBody ?? '';
      this.checkWebhook(req, raw);
      const header = (name: string) => {
        const v = req.headers[name];
        return Array.isArray(v) ? v[0] : v;
      };
      const ev = Webhook.parse(req.body, header('x-decionis-event'));
      if (!ev) throw RelayError.badRequest('Unrecognised webhook payload.');
      // 2xx: delivery is at-least-once and 4xx is not retried (docs/agentsafe.md §1).
      if ('ignored' in ev) return reply.code(202).send({ status: 'ignored', event: ev.name });
      return reply.code(202).send(this.intake.webhook(ev, raw));
    });
  }

  /** docs/agentsafe.md §1: x-decionis-signature (HMAC-SHA256 of the raw body); optional Bearer. */
  private checkWebhook(req: FastifyRequest, raw: string): void {
    const w = this.cfg.webhook;
    if (w.bearer) {
      const token = Auth.bearer(req.headers.authorization);
      if (!token || !Auth.same(token, w.bearer)) throw new RelayError(401, 'UNAUTHORIZED', 'Webhook bearer token invalid.');
    }
    const sig = req.headers['x-decionis-signature'];
    if (w.secret) {
      if (!Webhook.verify(raw, Array.isArray(sig) ? sig[0] : sig, w.secret)) {
        throw new RelayError(401, 'UNAUTHORIZED', 'Webhook signature invalid.');
      }
    } else if (!w.allowUnsigned) {
      throw new RelayError(401, 'UNAUTHORIZED', 'Unsigned webhooks are refused; configure RELAY_WEBHOOK_SECRET.');
    }
  }

  async listen(): Promise<string> {
    const address = await this.app.listen({ port: this.cfg.port, host: this.cfg.host });
    this.timer = setInterval(() => void this.resolver.sweep().catch(() => undefined), this.cfg.sweepMs);
    this.timer.unref();
    return address;
  }

  async close(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.hub.closeAll();
    await this.app.close();
  }
}

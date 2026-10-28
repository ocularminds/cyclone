import { timingSafeEqual } from 'node:crypto';
import type { RelayConfig } from './config';
import { RelayError } from './errors';

export type Principal = { kind: 'client' | 'agent'; subject: string };

/**
 * Relay authentication. The headset holds only a relay session (never a
 * policy-gate key); sessions are static Bearer tokens from config until real
 * login exists. The scripted agent has its own token for POST /held.
 */
export class Auth {
  constructor(private readonly cfg: RelayConfig) {}

  /** `Authorization: Bearer <token>` → token, else null. */
  static bearer(header: string | undefined): string | null {
    const m = /^Bearer\s+(.+)$/i.exec(header ?? '');
    return m ? m[1].trim() : null;
  }

  static same(a: string, b: string): boolean {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }

  identify(token: string | null): Principal | null {
    if (!token) return null;
    for (const s of this.cfg.sessions) if (Auth.same(token, s.token)) return { kind: 'client', subject: s.subject };
    if (this.cfg.agentToken && Auth.same(token, this.cfg.agentToken)) return { kind: 'agent', subject: 'agent' };
    return null;
  }

  client(header: string | undefined): Principal {
    const p = this.identify(Auth.bearer(header));
    if (!p) throw new RelayError(401, 'UNAUTHORIZED', 'A valid relay session is required.');
    if (p.kind !== 'client') throw new RelayError(403, 'UNAUTHORIZED', 'Decisions need an operator session.');
    return p;
  }

  agent(header: string | undefined): Principal {
    const p = this.identify(Auth.bearer(header));
    if (!p) throw new RelayError(401, 'UNAUTHORIZED', 'A valid agent token is required.');
    if (p.kind !== 'agent') throw new RelayError(403, 'UNAUTHORIZED', 'Only the agent hands over held intents.');
    return p;
  }

  /** WebSocket: `?session=` (browsers cannot set headers on a WebSocket). Agent token also allowed. */
  socket(session: string | undefined): Principal | null {
    return this.identify(session ?? null);
  }
}

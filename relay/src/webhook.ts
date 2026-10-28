import { createHmac, timingSafeEqual } from 'node:crypto';
import { Json } from './errors';

export type HeldEvent = {
  name: 'authority.escalation_required';
  tenant_id?: string;
  intent_id: string;
  intent_hash: string;
  expires_at?: string;
  decision_id?: string;
  dossier_id?: string;
  escalation_id?: string | null;
  reason_codes: string[];
};

export type ResolvedEvent = Omit<HeldEvent, 'name'> & {
  name: 'authority.escalation_resolved';
  outcome?: string;
};

export type WebhookEvent = HeldEvent | ResolvedEvent | { name: string; ignored: true };

/**
 * Inbound held-intent webhook (docs/agentsafe.md §1). Field names are the
 * documented ones (WH field lists); the JSON envelope is NOT documented, so
 * fields are read at the top level or under `data` / `payload`, and the event
 * name from the body (`event_name` / `event` / `type`) or the `x-decionis-event`
 * header (documented for the Make provider only). Needs H1 to pin it down.
 */
export class Webhook {
  static readonly HELD = 'authority.escalation_required';
  static readonly RESOLVED = 'authority.escalation_resolved';

  /**
   * `x-decionis-signature`: "HMAC SHA-256 signature over the outbound request
   * body when webhook_secret is configured" (docs/agentsafe.md §1, WH/AUTH).
   * The encoding is not documented: accept lowercase/uppercase hex or
   * base64/base64url, with or without a `sha256=` prefix. Constant-time compare.
   */
  static verify(raw: string, header: string | undefined, secret: string): boolean {
    if (!header) return false;
    const expected = createHmac('sha256', secret).update(raw, 'utf8').digest();
    for (const candidate of header.split(',')) {
      const given = Webhook.decode(candidate.trim().replace(/^sha256=/i, ''));
      if (given && given.length === expected.length && timingSafeEqual(given, expected)) return true;
    }
    return false;
  }

  static decode(text: string): Buffer | null {
    if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, 'hex');
    if (/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) {
      const buf = Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      return buf.length === 32 ? buf : null;
    }
    return null;
  }

  /** Sign a body the way the relay checks it (tests and local tooling). */
  static sign(raw: string, secret: string, encoding: 'hex' | 'base64' = 'hex'): string {
    return createHmac('sha256', secret).update(raw, 'utf8').digest(encoding);
  }

  /** Parse an event; null when it is not JSON-shaped or lacks the identity fields. */
  static parse(body: unknown, headerEvent?: string): WebhookEvent | null {
    if (!Json.isObject(body)) return null;
    const inner = Json.isObject(body.data) ? body.data : Json.isObject(body.payload) ? body.payload : body;
    const named = headerEvent ?? Json.str(body.event_name) ?? Json.str(body.event) ?? Json.str(body.type) ?? Json.str(inner.event_name);
    const intent_id = Json.str(inner.intent_id);
    const intent_hash = Json.str(inner.intent_hash);
    // Without a name, `outcome` is what tells the resolved event apart (field lists, §1).
    const name = named ?? (intent_id && intent_hash ? (inner.outcome !== undefined ? Webhook.RESOLVED : Webhook.HELD) : undefined);
    if (!name) return null;
    if (name !== Webhook.HELD && name !== Webhook.RESOLVED) return { name, ignored: true };
    if (!intent_id || !intent_hash || !/^sha256:[0-9a-f]{64}$/.test(intent_hash)) return null;
    const common = {
      tenant_id: Json.str(inner.tenant_id),
      intent_id,
      intent_hash,
      expires_at: Json.str(inner.expires_at),
      decision_id: Json.str(inner.decision_id),
      dossier_id: Json.str(inner.dossier_id),
      escalation_id: Json.str(inner.escalation_id) ?? null,
      reason_codes: Json.strings(inner.reason_codes),
    };
    if (name === Webhook.HELD) return { name, ...common };
    return { name, ...common, outcome: Json.str(inner.outcome) };
  }
}

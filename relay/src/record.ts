import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SignedRecord } from '../../app/src/contracts/intent';
import { Config, REPO_ROOT, RELAY_ROOT, type RelayConfig } from './config';
import type { Handoff } from './held';
import type { Entry, LiveRecord } from './store';
import { Verifier, type JwksSnapshot } from './verify';

/**
 * C49 — recorded real dossiers for demo mode.
 *
 * During a live run (RELAY_RECORD=1) the relay saves, per intent, every
 * held-intent webhook payload, the agent's handoff, each sealed record with its
 * Decision Dossier, and the JWKS the dossiers were verified against. Then:
 *
 *   npm run record:export   re-verifies every recorded dossier and writes the
 *                           verified ones to app/src/scenario/fixtures.json
 *   npm run check:fixtures  fails if any recorded dossier or fixture does not
 *                           verify (signatures, coverage, official anchor)
 */
export class Recorder {
  constructor(
    private readonly dir: string,
    private readonly verifier: Verifier,
  ) {}

  static forConfig(cfg: RelayConfig, verifier: Verifier): Recorder | null {
    return cfg.recordDir ? new Recorder(cfg.recordDir, verifier) : null;
  }

  /** Folder per intent; the id's hyphens are dropped (file names carry no hyphens). */
  private folder(intentId: string): string {
    const dir = join(this.dir, intentId.replace(/[^0-9A-Za-z]/g, ''));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  private static write(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  webhook(intentId: string, raw: string): void {
    const file = join(this.folder(intentId), 'webhooks.json');
    const list = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown[]) : [];
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      // keep the raw text
    }
    list.push({ received_at: new Date().toISOString(), body });
    Recorder.write(file, list);
  }

  handoff(intentId: string, h: Handoff): void {
    Recorder.write(join(this.folder(intentId), 'handoff.json'), h);
  }

  record(e: Entry, record: LiveRecord): void {
    const dir = this.folder(e.intent_id);
    Recorder.write(join(dir, `${record.decision.decision.toLowerCase()}.json`), record);
    if (record.dossier) Recorder.write(join(dir, 'dossier.json'), { dossier_payload: record.dossier });
    void this.verifier
      .jwks()
      .then((snap) => Recorder.write(join(this.dir, 'jwks.json'), snap))
      .catch(() => undefined);
  }
}

type Found = { folder: string; file: string; record: LiveRecord };

/** Export and check of the recorded fixtures (build-time; Node only). */
export class Fixtures {
  static readonly NOTE =
    'C49: recorded live held intents and their verified Decision Dossiers. Empty until a live run (needs H1 credentials). Populated by relay/src/record.ts; checked by relay tests at build time.';

  constructor(
    readonly dir: string = join(RELAY_ROOT, 'src/fixtures/recorded'),
    readonly out: string = join(REPO_ROOT, 'app/src/scenario/fixtures.json'),
    private readonly fetcher: typeof fetch = globalThis.fetch?.bind(globalThis),
  ) {}

  /** Every sealed record saved by a live run. */
  recorded(): Found[] {
    if (!existsSync(this.dir)) return [];
    const found: Found[] = [];
    for (const name of readdirSync(this.dir)) {
      const folder = join(this.dir, name);
      if (!statSync(folder).isDirectory()) continue;
      for (const file of readdirSync(folder)) {
        if (!/^(approve|approve_amended|reject|escalate)\.json$/.test(file)) continue;
        found.push({ folder, file, record: JSON.parse(readFileSync(join(folder, file), 'utf8')) as LiveRecord });
      }
    }
    return found;
  }

  fixtures(): SignedRecord[] {
    if (!existsSync(this.out)) return [];
    const data = JSON.parse(readFileSync(this.out, 'utf8')) as { records?: SignedRecord[] };
    return data.records ?? [];
  }

  /** The JWKS saved during the run, or (online / missing) the pinned production JWKS. */
  async snapshot(online: boolean): Promise<JwksSnapshot> {
    const file = join(this.dir, 'jwks.json');
    if (!online && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as JwksSnapshot;
    const res = await this.fetcher(Config.PINNED_JWKS, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`pinned JWKS ${res.status}`);
    return { source: Config.PINNED_JWKS, jwks: await res.json(), fetched_at: new Date().toISOString() };
  }

  static assess(record: SignedRecord, snap: JwksSnapshot): ReturnType<typeof Verifier.assess> | null {
    if (!record.dossier) return null;
    return Verifier.assess(record.dossier, snap.jwks, snap.source, new Date().toISOString());
  }

  /** Re-verify every recorded dossier; write the verified records as the demo fixtures. */
  async export(online = false): Promise<{ written: number; lines: string[] }> {
    const found = this.recorded().filter((f) => f.record.dossier);
    const lines: string[] = [];
    if (found.length === 0) return { written: 0, lines: ['No recorded dossiers yet (needs an H1 live run); fixtures.json left as is.'] };
    const snap = await this.snapshot(online);
    const records: SignedRecord[] = [];
    for (const f of found) {
      const checked = Fixtures.assess(f.record, snap)!;
      const { relay: _note, ...plain } = f.record;
      if (checked.verification.verified) records.push({ ...plain, verification: checked.verification });
      lines.push(`${checked.verification.verified ? 'ok  ' : 'FAIL'} ${f.record.intent_id} ${f.file} — ${checked.verification.assurance_scope_summary}`);
    }
    records.sort((a, b) => a.decided_at.localeCompare(b.decided_at));
    if (records.length > 0) writeFileSync(this.out, `${JSON.stringify({ note: Fixtures.NOTE, records }, null, 2)}\n`);
    lines.push(`${records.length} verified record(s) written to ${this.out}.`);
    return { written: records.length, lines };
  }

  /** Fails when any recorded dossier or shipped fixture does not verify against the official anchor. */
  async check(online = false): Promise<{ ok: boolean; lines: string[] }> {
    const fixtures = this.fixtures();
    const found = this.recorded().filter((f) => f.record.dossier);
    if (fixtures.length === 0 && found.length === 0) {
      return { ok: true, lines: ['No recorded fixtures yet (needs an H1 live run); nothing to check.'] };
    }
    const snap = await this.snapshot(online);
    const lines: string[] = [];
    let ok = true;
    for (const r of fixtures) {
      const stored = 'verified' in r.verification ? r.verification : null;
      const checked = r.source === 'live' ? Fixtures.assess(r, snap) : null;
      const good = Boolean(
        stored?.verified && stored.required_artifact_coverage_verified && stored.trust_anchor === 'DECIONIS_OFFICIAL' && checked?.verification.verified,
      );
      ok &&= good;
      lines.push(`${good ? 'ok  ' : 'FAIL'} fixture ${r.intent_id} ${r.decision.decision}`);
    }
    for (const f of found) {
      const checked = Fixtures.assess(f.record, snap)!;
      ok &&= checked.verification.verified;
      lines.push(`${checked.verification.verified ? 'ok  ' : 'FAIL'} recorded ${f.record.intent_id} ${f.file}`);
    }
    return { ok, lines };
  }
}

async function main(argv: string[]): Promise<number> {
  const cmd = argv[0];
  const opt = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const dir = opt('--dir');
  const out = opt('--out');
  const fixtures = new Fixtures(dir ? resolve(dir) : undefined, out ? resolve(out) : undefined);
  const online = argv.includes('--online');
  if (cmd === 'export') {
    const res = await fixtures.export(online);
    for (const line of res.lines) console.log(line);
    return 0;
  }
  if (cmd === 'check') {
    const res = await fixtures.check(online);
    for (const line of res.lines) console.log(line);
    console.log(res.ok ? 'check:fixtures passed' : 'check:fixtures FAILED');
    return res.ok ? 0 : 1;
  }
  console.log('usage: tsx src/record.ts export|check [--dir <recorded>] [--out <fixtures.json>] [--online]');
  return 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    },
  );
}

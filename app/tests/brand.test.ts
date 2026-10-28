import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// C41: no corporate names in anything the app can render. Protocol identifiers
// (`agent-safe.intent/1`) and verifier enum values are data, never shown.
const ROOT = join(__dirname, '..');
const ALLOWED = [/agent-safe\.intent\/1/g, /DECIONIS_OFFICIAL/g];
const BRAND = /decionis|agent\s?safe/i;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|json|uikitml|html)$/.test(n) ? [p] : [];
  });
}

function strip(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const a of ALLOWED) out = out.replace(a, '');
  return out;
}

describe('brand audit (C41)', () => {
  const targets = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'public')), join(ROOT, 'index.html')].filter(
    (f) => !f.endsWith('AGENTS.md'),
  );

  it('no brand names in code, data, UI markup or the page shell', () => {
    const hits = targets.filter((f) => BRAND.test(strip(readFileSync(f, 'utf8')))).map((f) => f.slice(ROOT.length + 1));
    expect(hits).toEqual([]);
  });

  it('the in-app term is "policy gate"', () => {
    const text = targets.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(text).toMatch(/policy gate/);
  });
});

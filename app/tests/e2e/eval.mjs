// Evaluates the expression in tests/e2e/.cmd.json inside the page (driver helper).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function run({ frame, workspaceRoot }) {
  const { js } = JSON.parse(readFileSync(join(workspaceRoot, 'tests/e2e/.cmd.json'), 'utf8'));
  return frame.evaluate(js);
}

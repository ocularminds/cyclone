// Build the unchanged production configuration and report Rollup's module graph.
// Run from app/: NODE_ENV=production node tests/build-audit.mjs
import { build } from 'vite';
import { writeFileSync } from 'node:fs';

await build({
  plugins: [{
    name: 'cyclone-evidence-only',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter((item) => item.type === 'chunk').map((chunk) => {
        const modules = Object.entries(chunk.modules).map(([id, value]) => {
          const dependency = id.split('/node_modules/').at(-1);
          const name = id.includes('/node_modules/') ? dependency : id.replace(process.cwd(), 'app');
          const parts = dependency.split('/');
          const group = !id.includes('/node_modules/') ? 'app / virtual' :
            parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
          return { name, group, renderedBytes: value.renderedLength };
        });
        const groups = {};
        for (const module of modules) groups[module.group] = (groups[module.group] ?? 0) + module.renderedBytes;
        return {
          file: chunk.fileName,
          isEntry: chunk.isEntry,
          bytes: Buffer.byteLength(chunk.code),
          moduleCount: modules.length,
          groups: Object.entries(groups).sort((a, b) => b[1] - a[1]).map(([name, renderedBytes]) => ({ name, renderedBytes })),
          largestModules: modules.sort((a, b) => b.renderedBytes - a.renderedBytes).slice(0, 12),
          containsServerVerifier: modules.some((module) => module.group === '@decionis/verify'),
        };
      });
      if (chunks.some((chunk) => chunk.containsServerVerifier)) throw new Error('Server verifier entered the browser bundle');
      writeFileSync('../docs/revision1/bundle.json', JSON.stringify({
        command: 'NODE_ENV=production node tests/build-audit.mjs',
        note: 'Evidence-only plugin; no chunk transformations. Module rendered sizes precede final chunk minification and SDK post-processing; they are attribution estimates, not transfer sizes.',
        node: process.version,
        chunks,
      }, null, 2) + '\n');
    },
  }],
});

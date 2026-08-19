import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSecurity147Package } from './security147Package.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const outputDir = path.join(repoRoot, 'scripts', 'releases', 'openday-security-147');
mkdirSync(outputDir, { recursive: true });

for (const target of ['staging', 'production']) {
  const result = buildSecurity147Package({ repoRoot, target });
  const basename = `${target}-security-147.sql`;
  writeFileSync(path.join(outputDir, basename), result.sql);
  writeFileSync(path.join(outputDir, `${basename}.sha256`), `${result.sha256}  ${basename}\n`);
  writeFileSync(path.join(outputDir, `${target}-manifest.json`), `${JSON.stringify({
    schemaVersion: 'openday-security-release/v1',
    target: result.target,
    approvedProjectRef: result.projectRef,
    artifact: { file: basename, sha256: result.sha256 },
    migration: {
      number: result.migration.number,
      filename: result.migration.filename,
      sha256: result.migration.sha256,
    },
  }, null, 2)}\n`);
  console.log(`${target}: migration 147, SHA256 ${result.sha256}`);
}

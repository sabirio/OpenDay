import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatchupPackage } from './databaseCatchupPackage.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..');
const outputDir = path.join(repoRoot, 'scripts', 'releases', 'openday-catchup-059-146');
mkdirSync(outputDir, { recursive: true });

for (const target of ['staging', 'production']) {
  const result = buildCatchupPackage({ repoRoot, target });
  const basename = `${target}-catchup.sql`;
  writeFileSync(path.join(outputDir, basename), result.sql);
  writeFileSync(path.join(outputDir, `${basename}.sha256`), `${result.sha256}  ${basename}\n`);
  writeFileSync(path.join(outputDir, `${target}-manifest.json`), `${JSON.stringify({
    schemaVersion: 'openday-database-catchup/v1',
    target: result.target,
    approvedProjectRef: result.projectRef,
    applicationCommit: result.applicationCommit,
    artifact: { file: basename, sha256: result.sha256 },
    migrations: result.migrations.map(({ number, filename, sha256 }) => ({ number, filename, sha256 })),
  }, null, 2)}\n`);
  console.log(`${target}: ${result.migrations.length} migrations, SHA256 ${result.sha256}`);
}

const localOutputArgument = process.argv.find((argument) => argument.startsWith('--local-certification-output='));
if (localOutputArgument) {
  const outputPath = path.resolve(localOutputArgument.slice(localOutputArgument.indexOf('=') + 1));
  const result = buildCatchupPackage({ repoRoot, target: 'production', preflightMode: 'local-certification' });
  writeFileSync(outputPath, result.sql);
  console.log(`local certification: ${outputPath}, SHA256 ${result.sha256}`);
}

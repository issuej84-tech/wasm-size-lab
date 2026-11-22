import { appendFile, writeFile } from 'node:fs/promises';
import { compareFiles, unsignedInteger } from '../lib/report.mjs';
import { formatMarkdown } from '../lib/format.mjs';

try {
  const quality = unsignedInteger(process.env.LAB_BROTLI_QUALITY, 'Brotli quality', 11);
  const budget = process.env.LAB_MAX_GROWTH === ''
    ? undefined
    : unsignedInteger(process.env.LAB_MAX_GROWTH, 'Brotli size budget');
  const report = await compareFiles(process.env.LAB_BASELINE, process.env.LAB_CANDIDATE, quality);
  const markdown = formatMarkdown(report, budget);
  await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  await appendFile(process.env.GITHUB_OUTPUT, 'brotli-delta=' + report.size.brotli.delta + '\n');
  if (process.env.LAB_JSON_REPORT) {
    await writeFile(process.env.LAB_JSON_REPORT, JSON.stringify(report, null, 2) + '\n');
  }
  if (budget !== undefined && report.size.brotli.delta > budget) {
    console.error('Brotli size budget exceeded. See the report in the job summary.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('wasm-size-lab: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
}

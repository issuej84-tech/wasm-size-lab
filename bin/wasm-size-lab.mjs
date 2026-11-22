#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { compareFiles, DEFAULT_QUALITY, unsignedInteger } from '../lib/report.mjs';
import { formatMarkdown } from '../lib/format.mjs';

const help = [
  'Usage: wasm-size-lab [options] BASELINE.wasm CANDIDATE.wasm',
  '',
  '  --format markdown|json   Output format (default markdown)',
  '  --brotli-quality 0..11   Brotli quality (default 9)',
  '  --max-brotli-growth BYTES   Fail if Brotli grows by more than this many bytes',
  '  -h, --help              Show usage',
].join('\n');

try {
  const { values, positionals } = parseArgs({
    options: {
      format: { type: 'string', default: 'markdown' },
      'brotli-quality': { type: 'string', default: String(DEFAULT_QUALITY) },
      'max-brotli-growth': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log(help);
  } else {
    if (positionals.length !== 2) throw new Error(help);
    if (!['markdown', 'json'].includes(values.format)) throw new Error('Unknown output format. Use markdown or json.');
    const quality = unsignedInteger(values['brotli-quality'], 'Brotli quality', 11);
    const budget = values['max-brotli-growth'] === undefined
      ? undefined
      : unsignedInteger(values['max-brotli-growth'], 'Brotli size budget');
    const report = await compareFiles(...positionals, quality);
    process.stdout.write(values.format === 'json' ? JSON.stringify(report, null, 2) + '\n' : formatMarkdown(report, budget));
    if (budget !== undefined && report.size.brotli.delta > budget) process.exitCode = 1;
  }
} catch (error) {
  console.error('wasm-size-lab: ' + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 2;
}

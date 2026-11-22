import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { formatMarkdown } from '../lib/format.mjs';
import { compareWasm } from '../lib/report.mjs';
import { inspectWasm } from '../lib/sections.mjs';

const core = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
const component = Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]);

function custom(name, content = Buffer.alloc(0)) {
  const key = Buffer.from(name);
  assert(key.length < 128 && content.length + key.length + 1 < 128);
  return Buffer.concat([Buffer.from([0, 1 + key.length + content.length, key.length]), key, content]);
}

test('measures actual compressed bytes and accounts for every raw byte', () => {
  const baseline = Buffer.concat([core, custom('labels', Buffer.alloc(16, 65))]);
  const candidate = Buffer.concat([core, custom('labels', Buffer.alloc(31, 65)), custom('labels')]);
  const report = compareWasm(baseline, candidate);
  assert.equal(report.size.raw.delta, candidate.length - baseline.length);
  assert.equal(report.size.brotli.candidate, brotliCompressSync(candidate, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 9 },
  }).length);
  assert.equal(report.size.gzip.candidate, gzipSync(candidate, { level: 9 }).length);
  assert.equal(report.sections.reduce((total, row) => total + row.delta, 0), report.size.raw.delta);
  assert.equal(report.sections[0].candidate.count, 2);
});

test('accepts an empty component and discloses mixed binary kinds', () => {
  assert.equal(inspectWasm(component).kind, 'component');
  const nested = Buffer.concat([component, Buffer.from([1, 8]), core]);
  assert.equal(inspectWasm(nested).sections.get('core module').bytes, 10);
  assert.equal(compareWasm(core, nested).sections, null);
});

test('rejects bad headers, invalid u32 and truncated envelopes', () => {
  assert.throws(() => inspectWasm(Buffer.from('bad')), /Expected a WebAssembly/);
  assert.throws(() => inspectWasm(Buffer.concat([core, Buffer.from([1, 255, 255, 255, 255, 16])])), /Invalid.*u32/);
  assert.throws(() => inspectWasm(Buffer.concat([core, Buffer.from([1, 3, 0])])), /Truncated WebAssembly section/);
  assert.throws(() => inspectWasm(Buffer.concat([core, Buffer.from([0, 1, 3])])), /custom section name/);
  assert.throws(() => inspectWasm(Buffer.concat([core, Buffer.from([0, 2, 1, 255])])), /Invalid UTF-8/);
});

test('escapes names rendered in Markdown', () => {
  const head = Buffer.concat([core, custom('|<img>\n`')]);
  const summary = formatMarkdown(compareWasm(core, head), 0);
  assert.match(summary, /Brotli budget exceeded/);
  assert.match(summary, /&#124;&#60;img&#62;&#10;&#96;/);
  assert.doesNotMatch(summary, /<img>/);
});

test('CLI and action preserve reports when the budget fails', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wasm-size-lab-test-'));
  try {
    const baseline = join(directory, 'base build.wasm');
    const candidate = join(directory, 'head build.wasm');
    const summary = join(directory, 'summary.md');
    const outputs = join(directory, 'output');
    const json = join(directory, 'report.json');
    await writeFile(baseline, core);
    await writeFile(candidate, Buffer.concat([core, custom('growth', Buffer.from('abcdef'))]));
    const cli = spawnSync(process.execPath, ['bin/wasm-size-lab.mjs',
      '--format', 'json', '--max-brotli-growth', '0', baseline, candidate], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    const report = JSON.parse(cli.stdout);
    const invalid = spawnSync(process.execPath, ['bin/wasm-size-lab.mjs',
      '--brotli-quality', '12', baseline, candidate], { encoding: 'utf8' });
    assert.equal(invalid.status, 2);
    assert.match(invalid.stderr, /Brotli quality/);
    const action = spawnSync(process.execPath, ['bin/action.mjs'], { encoding: 'utf8', env: {
      ...process.env, LAB_BASELINE: baseline, LAB_CANDIDATE: candidate, LAB_BROTLI_QUALITY: '9',
      LAB_MAX_GROWTH: '0', LAB_JSON_REPORT: json, GITHUB_STEP_SUMMARY: summary, GITHUB_OUTPUT: outputs,
    } });
    assert.equal(action.status, 1, action.stderr);
    assert.match(await readFile(summary, 'utf8'), /budget exceeded/);
    assert.equal(await readFile(outputs, 'utf8'), 'brotli-delta=' + report.size.brotli.delta + '\n');
    assert.deepEqual(JSON.parse(await readFile(json, 'utf8')), report);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { arch, cpus, platform } from 'node:os';
import { parseArgs } from 'node:util';
import { compareWasm, unsignedInteger } from '../lib/report.mjs';

const { values: args } = parseArgs({ options: {
  yasno: { type: 'string' },
  'wasm-opt': { type: 'string', default: 'wasm-opt' },
  rustc: { type: 'string', default: 'rustc' },
  zig: { type: 'string', default: 'zig' },
  out: { type: 'string', default: 'research-output' },
  rounds: { type: 'string', default: '9' },
} });
assert(args.yasno, 'Pass the path to a Yasno checkout through --yasno.');
const rounds = unsignedInteger(args.rounds, 'Startup sample count', 100);
const work = resolve(args.out);
const yasno = resolve(args.yasno);
const startupScript = fileURLToPath(new URL('./startup.mjs', import.meta.url));
const cSource = fileURLToPath(new URL('./hash.c', import.meta.url));
await mkdir(work, { recursive: true });
const { calculator } = await import(pathToFileURL(join(yasno, 'examples/calculator/runtime.mjs')));

function run(program, params) {
  return execFileSync(program, params, { encoding: 'utf8', windowsHide: true }).trim();
}

function referenceChecksum(seed, count) {
  let value = seed;
  for (let i = 0; i < count; i++) {
    value ^= i;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    value ^= value >>> 16;
  }
  return value;
}

function verify(name, bytes) {
  if (name === 'c') {
    const { checksum } = new WebAssembly.Instance(new WebAssembly.Module(bytes)).exports;
    for (const [seed, count] of [[0, 0], [24, 10], [892, 500], [-1, 1400]]) {
      assert.equal(checksum(seed, count), referenceChecksum(seed, count));
    }
  } else {
    const solve = calculator(bytes);
    for (let n = 1; n <= 128; n++) {
      assert.equal(solve('(' + n + '.5 - 2.25) * -3 + 8 / 2'), (n + .5 - 2.25) * -3 + 4);
    }
  }
}

const variants = [
  ['input', []],
  ['size', ['-Oz']],
  ['skipInlining', ['-Oz', '--skip-pass=inlining', '--skip-pass=inlining-optimizing']],
];
const rows = {};
for (const name of ['yasno', 'rust', 'c']) {
  const input = join(work, name + '-input.wasm');
  if (name === 'yasno') {
    run(process.execPath, [join(yasno, 'yasno.mjs'), 'build', join(yasno, 'examples/calculator/calculator.ys'), '-o', input]);
  } else if (name === 'rust') {
    run(args.rustc, [join(yasno, 'examples/calculator/calculator.rs'), '--edition=2021',
      '--crate-type=cdylib', '--target=wasm32-unknown-unknown', '--remap-path-prefix', yasno + '=/yasno', '-O', '-C', 'panic=abort',
      '-C', 'link-arg=--strip-all', '-o', input]);
  } else {
    run(args.zig, ['cc', '-target', 'wasm32-freestanding', '-O2', '-nostdlib',
      '-Wl,--no-entry', '-Wl,--export=checksum', '-Wl,--strip-all', cSource, '-o', input]);
  }
  rows[name] = {};
  for (const [variant, flags] of variants) {
    const file = join(work, name + '-' + variant + '.wasm');
    if (flags.length) run(args['wasm-opt'], [input, ...flags, '-o', file]);
    const bytes = await readFile(file);
    verify(name, bytes);
    const { size } = compareWasm(bytes, bytes);
    rows[name][variant] = {
      file, size: { raw: size.raw.baseline, brotli: size.brotli.baseline, gzip: size.gzip.baseline },
      startupSamplesMs: [],
    };
  }
}

const workloads = Object.values(rows).flatMap(row => Object.values(row));
for (let round = 0; round < rounds; round++) {
  for (let i = 0; i < workloads.length; i++) {
    const item = workloads[(round + i) % workloads.length];
    item.startupSamplesMs.push(Number(run(process.execPath, [startupScript, item.file])));
  }
}
function summarize(item) {
  const ordered = [...item.startupSamplesMs].sort((a, b) => a - b);
  const startup = ordered.length ? {
    medianMs: (ordered[Math.floor(ordered.length / 2)] + ordered[Math.floor((ordered.length - 1) / 2)]) / 2,
    samplesMs: item.startupSamplesMs,
  } : null;
  return { ...item.size, startup };
}
const result = {
  versions: {
    node: process.version,
    wasmOpt: run(args['wasm-opt'], ['--version']),
    rustc: run(args.rustc, ['--version']),
    zig: run(args.zig, ['version']),
    yasno: run('git', ['-C', yasno, 'rev-parse', 'HEAD']),
  },
  system: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
  variants: Object.fromEntries(variants),
  results: Object.fromEntries(Object.entries(rows).map(([name, row]) =>
    [name, Object.fromEntries(Object.entries(row).map(([variant, item]) => [variant, summarize(item)]))])),
};
await writeFile(join(work, 'study.json'), JSON.stringify(result, null, 2) + '\n');
for (const [name, row] of Object.entries(result.results)) {
  console.log(name);
  console.table(Object.fromEntries(Object.entries(row).map(([variant, item]) =>
    [variant, { raw: item.raw, Brotli: item.brotli, gzip: item.gzip, 'startup (ms)': item.startup?.medianMs } ])));
}

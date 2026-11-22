import { readFile } from 'node:fs/promises';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { compareSections, inspectWasm } from './sections.mjs';

export const DEFAULT_QUALITY = 9;

export function unsignedInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  if (!/^\d+$/.test(String(value)) || Number(value) > maximum) {
    throw new Error(label + ' must be an integer between 0 and ' + maximum + '.');
  }
  return Number(value);
}

function measure(bytes, quality) {
  return {
    raw: bytes.length,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: quality },
    }).length,
    gzip: gzipSync(bytes, { level: 9 }).length,
  };
}

function delta(baseline, candidate) {
  return {
    baseline,
    candidate,
    delta: candidate - baseline,
    percent: baseline ? (candidate - baseline) * 100 / baseline : null,
  };
}

function inspect(bytes, role) {
  try {
    return inspectWasm(bytes);
  } catch (error) {
    throw new Error(role + ': ' + error.message, { cause: error });
  }
}

export function compareWasm(baseline, candidate, quality = DEFAULT_QUALITY) {
  const baseInfo = inspect(baseline, 'Baseline');
  const headInfo = inspect(candidate, 'Candidate');
  const baseSize = measure(baseline, quality);
  const headSize = measure(candidate, quality);
  return {
    schemaVersion: 1,
    kinds: { baseline: baseInfo.kind, candidate: headInfo.kind },
    compression: { brotliQuality: quality, gzipLevel: 9 },
    size: {
      raw: delta(baseSize.raw, headSize.raw),
      brotli: delta(baseSize.brotli, headSize.brotli),
      gzip: delta(baseSize.gzip, headSize.gzip),
    },
    sections: baseInfo.kind === headInfo.kind
      ? compareSections(baseInfo.sections, headInfo.sections)
      : null,
  };
}

export async function compareFiles(baseline, candidate, quality) {
  const [base, head] = await Promise.all([readFile(baseline), readFile(candidate)]);
  return compareWasm(base, head, quality);
}

const HEADER = [
  [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00],
  [0x00, 0x61, 0x73, 0x6d, 0x0d, 0x00, 0x01, 0x00],
];
const CORE_SECTIONS = [
  'custom', 'type', 'import', 'function', 'table', 'memory', 'global',
  'export', 'start', 'element', 'code', 'data', 'data count', 'tag',
];
const COMPONENT_SECTIONS = [
  'custom', 'core module', 'core instance', 'core type', 'component',
  'instance', 'alias', 'type', 'canonical', 'start', 'import', 'export',
];
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function uint32(bytes, offset, end) {
  let result = 0;
  for (let group = 0; group < 5 && offset < end; group++) {
    const byte = bytes[offset++];
    if (group === 4 && byte > 15) break;
    result += (byte & 127) * 2 ** (group * 7);
    if (byte < 128) return [result, offset];
  }
  throw new Error('Invalid WebAssembly u32 at byte ' + offset + '.');
}

function customName(bytes, offset, end) {
  const [length, start] = uint32(bytes, offset, end);
  if (length > end - start) throw new Error('Truncated WebAssembly custom section name.');
  try {
    return utf8.decode(bytes.subarray(start, start + length));
  } catch {
    throw new Error('Invalid UTF-8 in a WebAssembly custom section name.');
  }
}

export function inspectWasm(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected a Uint8Array.');
  const index = HEADER.findIndex(header => header.every((byte, i) => bytes[i] === byte));
  if (index < 0) throw new Error('Expected a WebAssembly core v1 module or Component Model 0x0d component.');
  const sectionNames = index === 0 ? CORE_SECTIONS : COMPONENT_SECTIONS;
  const sections = new Map([['header', { bytes: 8, count: 1 }]]);

  for (let offset = 8; offset < bytes.length;) {
    const id = bytes[offset];
    const [size, payload] = uint32(bytes, offset + 1, bytes.length);
    const end = payload + size;
    if (end > bytes.length) throw new Error('Truncated WebAssembly section at byte ' + offset + '.');
    const name = id === 0
      ? 'custom: ' + customName(bytes, payload, end)
      : sectionNames[id] ?? 'section ' + id;
    const total = sections.get(name) ?? { bytes: 0, count: 0 };
    total.bytes += end - offset;
    total.count++;
    sections.set(name, total);
    offset = end;
  }
  return { kind: index === 0 ? 'core' : 'component', sections };
}

export function compareSections(baseSections, headSections) {
  const names = new Set([...baseSections.keys(), ...headSections.keys()]);
  return [...names].map(name => {
    const baseline = baseSections.get(name) ?? { bytes: 0, count: 0 };
    const candidate = headSections.get(name) ?? { bytes: 0, count: 0 };
    return { name, baseline, candidate, delta: candidate.bytes - baseline.bytes };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)
    || (a.name === b.name ? 0 : a.name < b.name ? -1 : 1));
}

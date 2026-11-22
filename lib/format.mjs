const numbers = new Intl.NumberFormat('en-US');

function signed(value, formatter = numbers.format) {
  return (value > 0 ? '+' : '') + formatter(value);
}

function safeCell(text) {
  return text.replace(/[^\p{L}\p{N} ._:-]/gu, c => '&#' + c.codePointAt(0) + ';');
}

const lines = sizes => Object.entries(sizes).map(([name, value]) => {
  const label = { raw: 'Raw Wasm', brotli: 'Brotli', gzip: 'gzip' }[name];
  const percent = value.percent === null ? '—' : signed(value.percent, n => n.toFixed(2)) + '%';
  return '| ' + [label, numbers.format(value.baseline), numbers.format(value.candidate),
    signed(value.delta), percent].join(' | ') + ' |';
});

export function formatMarkdown(report, budget) {
  const output = [
    '## WebAssembly size comparison',
    '',
    '| Metric | Baseline (B) | Candidate (B) | Delta (B) | Change |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...lines(report.size),
    '',
  ];
  if (report.size.raw.delta < 0 && report.size.brotli.delta > 0) {
    output.push('**The raw module shrank, but its Brotli payload grew.**', '');
  }
  if (budget !== undefined) {
    const actual = report.size.brotli.delta;
    const state = actual > budget ? 'exceeded' : 'within limit';
    output.push('Brotli budget ' + state + ' (' + signed(actual) + ' B, maximum +' + numbers.format(budget) + ' B).', '');
  }
  if (report.sections === null) {
    output.push('Section deltas require two binaries of the same kind.', '');
  } else {
    const sections = report.sections.filter(row => row.delta !== 0 || row.baseline.count !== row.candidate.count);
    if (sections.length) {
      output.push(
        '### Raw sections with size changes',
        '',
        '| Section | Baseline (B) | Candidate (B) | Delta (B) |',
        '| --- | ---: | ---: | ---: |',
        ...sections.slice(0, 20).map(row =>
          '| ' + [safeCell(row.name.slice(0, 140)), numbers.format(row.baseline.bytes),
            numbers.format(row.candidate.bytes), signed(row.delta)].join(' | ') + ' |'),
        '',
      );
      if (sections.length > 20) output.push('The JSON report includes every section.', '');
    }
  }
  output.push('Brotli quality ' + report.compression.brotliQuality + ' · gzip level ' + report.compression.gzipLevel + '.');
  return output.join('\n') + '\n';
}

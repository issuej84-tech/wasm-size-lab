const select = document.querySelector('#case');
const result = document.querySelector('#result');
const template = document.querySelector('#chart');
const definition = {
  'rust-rerun': { baseline: 'First -Oz', candidate: 'Second -Oz', file: 'rust-rerun' },
  'rust-keep-local-order': { baseline: 'First -Oz', candidate: 'Second -Oz, local order kept', file: 'rust-keep-local-order' },
  yasno: { baseline: '-Oz, inlining skipped', candidate: '-Oz', file: 'yasno' },
  rust: { baseline: 'Compiler output', candidate: '-Oz', file: 'rust' },
  c: { baseline: 'Compiler output', candidate: '-Oz', file: 'c' },
};
const number = new Intl.NumberFormat('en');
const signed = new Intl.NumberFormat('en', { signDisplay: 'exceptZero' });
const metricName = { raw: 'Raw Wasm', brotli: 'Brotli', gzip: 'gzip' };

function cell(tag, value, parent) {
  const node = document.createElement(tag);
  node.textContent = value;
  parent.append(node);
  return node;
}

function render(comparison, pathname, captions) {
  const view = template.content.cloneNode(true);
  const takeaway = view.querySelector('.takeaway');
  const brotli = comparison.size.brotli.delta;
  takeaway.textContent = comparison.size.raw.delta < 0 && brotli > 0
    ? 'The binary shrank. The Brotli payload grew.'
    : 'Brotli payload: ' + signed.format(brotli) + ' bytes.';
  takeaway.classList.toggle('worse', brotli > 0);
  view.querySelector('.baseline-caption').textContent = captions.baseline;
  view.querySelector('.candidate-caption').textContent = captions.candidate;

  const metrics = view.querySelector('.metrics');
  for (const [name, data] of Object.entries(comparison.size)) {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const description = document.createElement('div');
    cell('h3', metricName[name], description);
    const delta = cell('span', signed.format(data.delta) + ' B', description);
    delta.className = data.delta > 0 ? 'delta growth' : 'delta';

    const track = document.createElement('div');
    track.className = 'track';
    track.setAttribute('aria-label', metricName[name] + ' baseline and candidate');
    for (const key of ['baseline', 'candidate']) {
      const lane = document.createElement('div');
      lane.className = 'glyph-track';
      lane.setAttribute('aria-hidden', 'true');
      const glyph = document.createElement('div');
      glyph.className = 'glyph ' + key;
      glyph.style.setProperty('--width', data[key] / Math.max(data.baseline, data.candidate) * 100 + '%');
      lane.append(glyph);
      track.append(lane);
      cell('span', number.format(data[key]) + ' B', track).className = 'track-value';
    }
    metric.append(description, track);
    metrics.append(metric);
  }

  const table = view.querySelector('tbody');
  const changed = comparison.sections.filter(row => row.delta !== 0 || row.baseline.count !== row.candidate.count);
  for (const row of changed) {
    const tr = document.createElement('tr');
    cell('th', row.name, tr).scope = 'row';
    cell('td', number.format(row.baseline.bytes) + ' B', tr);
    cell('td', number.format(row.candidate.bytes) + ' B', tr);
    cell('td', signed.format(row.delta) + ' B', tr);
    table.append(tr);
  }
  view.querySelector('details').hidden = changed.length === 0;
  const download = view.querySelector('.download');
  download.href = pathname;
  download.download = captions.file + '-size-comparison.json';
  result.replaceChildren(view);
}

let requested = 0;
async function show() {
  const selection = definition[select.value];
  const request = ++requested;
  const file = './' + selection.file + '.json';
  try {
    const response = await fetch(file);
    if (!response.ok) throw new Error('Request failed');
    const data = await response.json();
    if (request === requested) render(data, file, selection);
  } catch {
    if (request === requested) {
      result.replaceChildren();
      cell('p', 'Could not load this comparison. Choose another sample or reload the page.', result);
    }
  }
}

select.disabled = false;
select.addEventListener('change', show);
show();

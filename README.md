# Wasm Size Lab

**Catch WebAssembly size regressions in pull requests.** Compare two builds by raw bytes, Brotli, gzip and the sections that changed.

[Try the interactive demo](https://issuej84-tech.github.io/wasm-size-lab/) · [Reproduce the Binaryen experiment](research/README.md) · [See the first release](https://github.com/issuej84-tech/wasm-size-lab/releases/tag/v0.1.0)

![Test status](https://github.com/issuej84-tech/wasm-size-lab/actions/workflows/test.yml/badge.svg)

Binaryen 133 produced these two builds of the same Yasno calculator from the same input. The baseline skips the inlining passes and the candidate uses plain `-Oz`. Both builds pass the same calculator checks.

| Metric | Baseline | Candidate | Change |
| --- | ---: | ---: | ---: |
| Raw Wasm | 1,566 B | 1,558 B | −8 B |
| Brotli | 856 B | 860 B | **+4 B** |
| gzip | 872 B | 875 B | +3 B |

## Quick start

Clone the repository and run the CLI with Node.js 22 or newer. It uses Node.js built-ins.

```sh
git clone https://github.com/issuej84-tech/wasm-size-lab.git
cd wasm-size-lab
node bin/wasm-size-lab.mjs demo/yasno-baseline.wasm demo/yasno-candidate.wasm
```

Use `--format json` for machine-readable output. Use `--max-brotli-growth 256` to fail the check when the candidate adds more than 256 Brotli bytes. `--brotli-quality` selects a quality from 0 to 11 and defaults to 9. The CLI uses gzip level 9. It writes reports to standard output and returns code 0 on success, 1 when the budget is exceeded and 2 for invalid input or other errors.

## GitHub Actions

Add this step to a pull-request workflow after checking out the following files or producing both builds with your existing build steps. Set up Node.js 22 or newer in the job first.

```yaml
- name: Compare WebAssembly builds
  uses: issuej84-tech/wasm-size-lab@v0.1.0
  with:
    baseline: out/baseline.wasm
    candidate: out/candidate.wasm
    max-brotli-growth: '256'
    json-report: wasm-size-report.json
```

The action writes the Markdown report to the workflow's job summary, where reviewers can open it from the PR checks. A budget failure still publishes the summary. The optional `json-report` input writes a local JSON file for another action or an artifact upload. The output `brotli-delta` holds the signed difference in bytes. The comparison itself runs with read-only workflow permissions. The [self-test workflow](.github/workflows/test.yml) shows the action checking this repository's sample.

## What the report measures

- **Raw Wasm** includes the preamble, section headers and section payloads. Sections with the same name are combined, including repeated custom sections.
- **Brotli and gzip** compress each entire input with the same settings. Use the Brotli setting that matches your delivery pipeline. Compare builds with the same Node.js version for a stable budget.
- **Supported inputs** include core WebAssembly v1 and Component Model binaries with the `0x0d` preamble. Component section attribution covers the top level.
- **Execution** is unnecessary for size analysis. The CLI checks the binary preamble and section envelopes. Use your compiler or a WebAssembly validator for full semantic validation.

```sh
node --test
```

MIT licensed. Created by **mayw1ng**.

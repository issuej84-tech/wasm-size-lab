# Binaryen compression experiment

Binaryen issue #4322 describes inputs for which inlining reduces raw bytes but worsens compressibility. This experiment compares the default `-Oz` pipeline with the same build skipping two named inlining passes. The three workloads are a Yasno calculator, a Rust calculator and a small C checksum. [Binaryen issue #4322](https://github.com/WebAssembly/binaryen/issues/4322)

| Workload and variant | Raw B | Brotli B | gzip B |
| --- | ---: | ---: | ---: |
| Yasno compiler output | 1,829 | 973 | 998 |
| Yasno `-Oz`, inlining passes skipped | 1,566 | 856 | 872 |
| Yasno `-Oz` | 1,558 | 860 | 875 |
| Rust compiler output | 5,424 | 2,491 | 2,627 |
| Rust `-Oz`, inlining passes skipped | 2,910 | 1,422 | 1,539 |
| Rust `-Oz` | 2,878 | 1,410 | 1,519 |
| C compiler output | 271 | 173 | 200 |
| C `-Oz`, inlining passes skipped | 254 | 157 | 176 |
| C `-Oz` | 254 | 157 | 176 |

On the Yasno input, the default pipeline saved 8 raw bytes compared with skipping inlining but added 4 Brotli bytes at quality 9. On the Rust input the default pipeline saved 12 Brotli bytes relative to skipping inlining. The C builds tied. In a separate check, applying `-Oz` to the already optimized Yasno build that skipped inlining kept Brotli at 856 B and added one gzip byte. The 4-byte Brotli delta above is a comparison between two pipelines on the same compiler output.

## A repeat optimization can grow the Brotli payload

In the table, the second pass takes the first `-Oz` output as its input. The third row keeps Binaryen from reordering local variables during that second pass.

| Rust pipeline | Raw B | Brotli B | gzip B |
| --- | ---: | ---: | ---: |
| First `-Oz` | 2,878 | 1,410 | 1,519 |
| Second `-Oz` | 2,874 | 1,436 | 1,505 |
| Second `-Oz` with `--skip-pass=reorder-locals` | 2,874 | 1,397 | 1,510 |

The second default pass saves 4 raw bytes and adds 26 Brotli bytes. Skipping `reorder-locals` during that pass gives the same 2,874 raw bytes and saves 39 Brotli bytes relative to the default second pass. gzip encodes the default second pass in 5 fewer bytes than the version that skips local reordering. Both variants pass the same 128 expression checks.

After running the study below, reproduce the two comparisons with these commands. The complete tables for Yasno, Rust and C are available in the [recorded results](results.json).

```sh
node bin/wasm-size-lab.mjs research-output/rust-size.wasm research-output/rust-sizeAgain.wasm
node bin/wasm-size-lab.mjs research-output/rust-sizeAgain.wasm research-output/rust-sizeAgainKeepLocalOrder.wasm
```

## Reproduce the checked-in Yasno comparison

Run from the repository root with Node.js 22 or newer.

```sh
node bin/wasm-size-lab.mjs demo/yasno-baseline.wasm demo/yasno-candidate.wasm
```

The baseline and candidate originate from the pinned Yasno source below. The [release](https://github.com/issuej84-tech/wasm-size-lab/releases/tag/v0.1.1) includes the sample binaries and the current report.

## Rebuild the three workloads

The recorded run used Binaryen 133, Node.js 26.13.0, Zig 0.15.2 and rustc 1.100.0. Install the Rust target `wasm32-unknown-unknown`. The `wasm-opt`, `rustc` and `zig` binaries can be in PATH or supplied explicitly using flags with those names.

```sh
git clone https://github.com/issuej84-tech/yasno.git ../yasno
git -C ../yasno checkout 462d26508b23b00a39d2010bfa6968e20c779acc
rustup target add wasm32-unknown-unknown
node research/study.mjs --yasno ../yasno --out research-output
```

The script builds and checks every variant. It tests 128 calculator expressions against a JavaScript reference and tests the C checksum against a JavaScript implementation. The Rust build remaps the checkout path in diagnostics. `study.json` records toolchain versions, all byte counts, and nine startup samples per variant by default.

For the startup samples, a fresh Node.js process reads the file and then times module compilation plus instantiation. Disk I/O and process launch are outside the timed region. These small modules produce variable sub-millisecond samples, so the raw timing data are exploratory. [Recorded samples](results.json)

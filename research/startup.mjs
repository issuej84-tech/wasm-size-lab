import { readFileSync } from 'node:fs';

const bytes = readFileSync(process.argv[2]);
const start = performance.now();
new WebAssembly.Instance(new WebAssembly.Module(bytes));
console.log(performance.now() - start);

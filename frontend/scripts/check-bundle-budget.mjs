import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

// A reproducible safeguard, not a substitute for field performance measurements.
// Only the HTML entry and its static imports count as first-load assets.
// The local AI model, PDF worker and Mermaid should stay behind dynamic imports.
const manifest = JSON.parse(readFileSync("dist/.vite/manifest.json", "utf8"));
const root = manifest["index.html"];
if (!root?.isEntry || !root.file) {
  throw Error("Vite main HTML entry missing from build manifest.");
}
const visited = new Set();
const assets = new Set(["index.html"]);
function walk(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const item = manifest[key];
  if (!item) throw Error("Unknown static import in manifest: " + key);
  if (item.file) assets.add(item.file);
  for (const path of item.css ?? []) assets.add(path);
  for (const dependency of item.imports ?? []) walk(dependency);
}
walk("index.html");

const budget = 350 * 1024;
const summary = [];
let totalGzip = 0;
for (const relative of [...assets].sort()) {
  if (!/^(?:assets\/[^/]+|index\.html)$/.test(relative)) {
    throw Error("Unexpected asset path: " + relative);
  }
  const raw = readFileSync(join("dist", relative));
  const gzip = gzipSync(raw, { level: 9 }).byteLength;
  totalGzip += gzip;
  summary.push({ asset: relative, rawBytes: raw.byteLength, gzipBytes: gzip });
}
const unexpected = summary.filter(({asset}) =>
  /(qa-open-model|onnx|ort-wasm|pdf\.worker|mermaid|elk)/i.test(asset)
);
if (unexpected.length) {
  throw Error("Heavy optional capability bundled into initial load: " +
    unexpected.map((v) => v.asset).join(", "));
}
console.log(JSON.stringify({
  initialGzipBytes: totalGzip, budgetBytes: budget,
  initialAssets: summary, deferredCapabilities: "model, PDF and Mermaid"
}, null, 2));
if (totalGzip > budget) {
  throw Error("Initial page exceeds 350 KiB gzip budget by " +
    (totalGzip-budget) + " bytes.");
}

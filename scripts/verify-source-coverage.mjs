import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const manifest = JSON.parse(await readFile("public/sources/manifest.json", "utf8"));
const failures = [];
const expectedFiles = new Set(["manifest.json"]);
for (const entry of manifest.entries || []) {
  if (!/^https:\/\//.test(entry.originalUrl || "")) failures.push(`${entry.id}: originalUrl`);
  if (!/^\.\/sources\//.test(entry.archivePath || "")) failures.push(`${entry.id}: archivePath`);
  expectedFiles.add(path.basename(entry.archivePath || ""));
  try {
    await access(path.join("public", entry.archivePath.replace(/^\.\//, "")));
  } catch {
    failures.push(`${entry.id}: archive missing`);
  }
  if (!/^[a-f0-9]{64}$/.test(entry.sha256 || "")) failures.push(`${entry.id}: sha256`);
}
for (const filename of await readdir("public/sources")) {
  if (!expectedFiles.has(filename)) failures.push(`${filename}: not registered in manifest`);
}
const source = [
  await readFile("src/calc/computePoint.js", "utf8"),
  await readFile("src/calc/calculationSources.js", "utf8"),
].join("\n");
for (const entry of manifest.entries || []) {
  if (!source.includes(entry.archivePath)) failures.push(`${entry.id}: archive not referenced by core`);
  if (!source.includes(entry.originalUrl)) failures.push(`${entry.id}: original URL not referenced by core`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`✓ source coverage ${manifest.entries.length}/${manifest.entries.length}`);

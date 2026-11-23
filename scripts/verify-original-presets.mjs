import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";
import {parseMaze, serializeMaze, mazeSummary} from "../src/maze-document.mjs";

const directory = process.argv[2];
if (!directory) throw new Error("Pass the directory containing original JSON presets");

let tested = 0;
for (const name of (await readdir(directory)).filter(n => n.endsWith(".json")).sort()) {
  const originalText = await readFile(join(directory, name), "utf8");
  let original;
  try {
    original = JSON.parse(originalText);
  } catch (error) {
    console.log(name, "invalid JSON in original, excluded:", error.message);
    continue;
  }
  const parsed = parseMaze(originalText);
  const result = JSON.parse(serializeMaze(parsed));
  assert.deepEqual(result, original, "A source preset changed during round trip: " + name);
  const summary = mazeSummary(parsed);
  assert.equal(summary.cellCount, original.data.cells.length);
  console.log(name, "ROUNDTRIP PASS", JSON.stringify(summary));
  tested++;
}
assert.equal(tested, 8, "Expected eight parseable original standard/hard theme presets");
console.log("Verified lossless structural round trip for all", tested, "original maze presets.");

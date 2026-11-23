import test from "node:test";
import assert from "node:assert/strict";
import {
  CELL_KINDS, THEMES, parseMaze, validateMaze, serializeMaze,
  insertCell, editCell, deleteCell, mazeSummary
} from "../src/maze-document.mjs";

const original = {
  uniqueIdentifier: "fixture-not-from-original-game",
  source: "physical",
  version: "1",
  options: {
    add_borders: "true",
    fill_floors: "true",
    music_enabled: "false",
    sound_enabled: "true",
    preserved_future_flag: "a future version"
  },
  data: {
    scale: ["3", "1", "3"],
    duration: "60",
    player_avatars: {},
    theme: "marble_maze",
    cells: [
      {position: ["0", "0", "0"], type: "entrance"},
      {position: ["1", "0", "1"], type: "wall", variant: "2", future: {custom: 7}},
      {position: ["2", "0", "2"], type: "exit"}
    ]
  },
  name: "Round-trip test",
  extra_top_level: {unknown: true}
};

test("recognizes all historically recovered cell categories and themes", () => {
  assert.equal(CELL_KINDS.length, 15);
  assert.deepEqual(THEMES, ["adventure", "hedge", "marble_maze", "space"]);
});

test("preserves type, value, coordinate string representations and unknown keys", () => {
  const parsed = parseMaze(JSON.stringify(original));
  assert.deepEqual(JSON.parse(serializeMaze(parsed)), original);
  assert.equal(typeof parsed.data.cells[0].position[0], "string");
  assert.equal(typeof parsed.data.scale[0], "string");
  assert.equal(typeof parsed.options.music_enabled, "string");
  assert.equal(parsed.data.cells[1].future.custom, 7);
});

test("protects source objects from edits and does not remove unrelated fields", () => {
  const altered = editCell(original, 1, {variant: "9", custom_extension: "keep"});
  assert.equal(original.data.cells[1].variant, "2");
  assert.equal(altered.data.cells[1].variant, "9");
  assert.equal(altered.data.cells[1].future.custom, 7);
  assert.equal(altered.data.cells[1].custom_extension, "keep");
  assert.equal(altered.extra_top_level.unknown, true);
});

test("supports insertion and deletion without changing the original", () => {
  const inserted = insertCell(original, {position: ["2", "0", "1"], type: "riddle", mystery: 5}, 2);
  assert.equal(inserted.data.cells.length, 4);
  assert.equal(inserted.data.cells[2].mystery, 5);
  const restored = deleteCell(inserted, 2);
  assert.deepEqual(restored, original);
  assert.equal(original.data.cells.length, 3);
});

test("summarizes coordinates without guessing original board orientation", () => {
  const summary = mazeSummary(original);
  assert.equal(summary.cellCount, 3);
  assert.equal(summary.types.wall, 1);
  assert.deepEqual(summary.scale, [3, 1, 3]);
  assert.deepEqual(summary.bounds, [
    {min: 0, max: 2}, {min: 0, max: 0}, {min: 0, max: 2}
  ]);
});

test("rejects malformed JSON, invalid cells and bad dimensions", () => {
  assert.throws(() => parseMaze("{oops"), SyntaxError);
  assert.throws(() => validateMaze({data: {scale: [0, 1, 1], cells: []}}), RangeError);
  assert.throws(() => validateMaze({data: {scale: ["3", "1", "3"], cells: [{type: "wall"}]}}), TypeError);
  assert.throws(() => insertCell(original, {position: [0, 1], type: "wall"}), TypeError);
  assert.throws(() => deleteCell(original, 999), RangeError);
  assert.throws(() => editCell(original, -1, {type: "wall"}), RangeError);
});

test("does not silently discard unknown future cell types", () => {
  const next = insertCell(original, {position: ["0", "0", "1"], type: "future-cell-kind"});
  assert.equal(next.data.cells.at(-1).type, "future-cell-kind");
});

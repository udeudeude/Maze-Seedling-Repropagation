/**
 * Minimal, lossless adapter for Maze by Seedling's recovered document structure.
 * Based on the Android 1.4 classes and bundled preset schemas. Not game code.
 * Deliberately preserves unknown keys and numeric-looking strings.
 */
export const CELL_KINDS = Object.freeze([
  "empty", "entrance", "exit", "floor", "gate", "info", "map",
  "riddle", "secret_passage", "shadow", "speed_hazard",
  "speed_powerup", "timer_hazard", "timer_powerup", "wall",
]);

export const THEMES = Object.freeze(["adventure", "hedge", "marble_maze", "space"]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function integral(value, name) {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new TypeError(name + " must be an integer or decimal integer string");
  }
  if (!/^-?\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) {
    throw new TypeError(name + " must be a safe integer");
  }
  return Number(value);
}

function cell(cellValue, path) {
  if (!object(cellValue)) throw new TypeError(path + " must be an object");
  if (!Array.isArray(cellValue.position) || cellValue.position.length !== 3) {
    throw new TypeError(path + ".position must have three coordinates");
  }
  cellValue.position.forEach((coordinate, i) => integral(coordinate, path + ".position[" + i + "]"));
  if (typeof cellValue.type !== "string" || !cellValue.type) {
    throw new TypeError(path + ".type must be a nonempty string");
  }
  // Do not reject unrecognized types or optional properties: preserve future variants.
}

export function validateMaze(document) {
  if (!object(document)) throw new TypeError("Maze must be a JSON object");
  if (!object(document.data)) throw new TypeError("Maze must contain data");
  if (!Array.isArray(document.data.cells)) throw new TypeError("data.cells must be an array");
  if (!Array.isArray(document.data.scale) || document.data.scale.length !== 3) {
    throw new TypeError("data.scale must have three dimensions");
  }
  document.data.scale.forEach((n, i) => {
    if (integral(n, "data.scale[" + i + "]") <= 0) {
      throw new RangeError("data.scale dimensions must be positive");
    }
  });
  document.data.cells.forEach((entry, i) => cell(entry, "data.cells[" + i + "]"));
  if (document.options !== undefined && !object(document.options)) {
    throw new TypeError("options must be an object");
  }
  return document;
}

export function parseMaze(json) {
  const document = typeof json === "string" ? JSON.parse(json) : clone(json);
  return validateMaze(document);
}

export function serializeMaze(document, spacing = 2) {
  return JSON.stringify(validateMaze(document), null, spacing);
}

export function editCell(document, index, changes) {
  const updated = parseMaze(document);
  if (!Number.isInteger(index) || index < 0 || index >= updated.data.cells.length) {
    throw new RangeError("Cell index out of bounds");
  }
  if (!object(changes)) throw new TypeError("Changes must be an object");
  const next = {...updated.data.cells[index], ...clone(changes)};
  cell(next, "updated cell");
  updated.data.cells[index] = next;
  return updated;
}

export function insertCell(document, incoming, index = undefined) {
  const updated = parseMaze(document);
  const item = clone(incoming);
  cell(item, "new cell");
  if (index === undefined) {
    updated.data.cells.push(item);
  } else {
    if (!Number.isInteger(index) || index < 0 || index > updated.data.cells.length) {
      throw new RangeError("Insert position out of bounds");
    }
    updated.data.cells.splice(index, 0, item);
  }
  return updated;
}

export function deleteCell(document, index) {
  const updated = parseMaze(document);
  if (!Number.isInteger(index) || index < 0 || index >= updated.data.cells.length) {
    throw new RangeError("Cell index out of bounds");
  }
  updated.data.cells.splice(index, 1);
  return updated;
}

export function mazeSummary(document) {
  const maze = validateMaze(document);
  const types = {};
  const bounds = [0, 1, 2].map(() => ({min: null, max: null}));
  for (const item of maze.data.cells) {
    types[item.type] = (types[item.type] ?? 0) + 1;
    item.position.forEach((v, i) => {
      const number = integral(v, "position");
      bounds[i].min = Math.min(bounds[i].min ?? number, number);
      bounds[i].max = Math.max(bounds[i].max ?? number, number);
    });
  }
  return {
    name: maze.name ?? null,
    theme: maze.data.theme ?? null,
    scale: maze.data.scale.map(Number),
    cellCount: maze.data.cells.length,
    types,
    bounds
  };
}

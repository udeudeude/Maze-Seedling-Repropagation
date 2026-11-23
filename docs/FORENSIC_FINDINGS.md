# Evidence-led reconstruction findings

## Verified binary

This document records **static examination** of APKPure's original `com.seedling.maze` package. Its SHA-256 is
`564117f42b2f6e297ed75ea42b6206a84dce1ca704afed6a0ff751b2e47b6676`.
The manifest independently confirms **version 1.4, build 822**, Android minimum version 4.4, and target API 25.
The XAPK comprises a 73,620,680-byte APK and 49,424,833-byte expansion OBB.

Analyses: [initial inventory](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/45102001862), [Unity/managed code](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/45102412030), [Android editor/schema](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/45102583256).
The workflow inventories the archive **without executing the application** and does not upload its proprietary binaries.

## Architecture verified from the package

The Android application has three distinct components:

1. **Physical maze scanning** uses Android camera activity `MazeCaptureActivity`, OpenCV libraries, and `libtile_reader.so`; the `TileReader` Java class communicates through native methods `processFromJNI` and `json`. Capture includes preview and overlay processing and rotation. **Image-processing thresholds and geometry are not yet determined.**
2. **Native Android editor** has `MazeEditorActivity`, `MazeView`, `MazeUtility`, image/audio capture, text messaging, riddles, wall placement, tile selection, undo-like finger buffers, zoom, and maze-completability checks.
3. **Unity 3D explorer** uses `Seedling.VRMaze` managed code, scene assets in the APK and expansion OBB, and a Google Cardboard stereoscopic renderer. Managed logic includes player controllers, gates and keys, shadows that follow players, secret passages, shortest-path search, timer and speed power-ups, maps, riddles, localized sound, and multiplayer peers.

The native scanner library is **not stripped of its relevant C++ symbol names**. Exported symbols include `TileReader::getBoardCorners`, `computeBoard`, `drawGrid`, `removeBoardEdges`, `getWalls`, `setBoardDimensions`, and `stb::TileBoard::toJSON`, `getBoardWalls`, `getTileAt`, `setTileAt`, and `hasStart`/`hasEnd`. This establishes the original processing stages, but **does not reveal their exact mathematical thresholds**. The Android application declares camera, audio-recording, storage, and network permissions. The presence of a class or method proves the feature was implemented in some form; it does **not** establish that it worked correctly or identically to iOS.

## Concrete mechanics and data model

Two versions of the same concept appear in the code:

- Native model: `Maze`, `MazeData`, `MazeCells`, `MazeCell`, `MazeOptions`, `MazeTheme`, `MazeCaptureJsonFixer`.
- Editor model: `TileObject` with `posX`, `posY`, `type`, `variant`, `photoPath`, `audioPath`, `audioRate`, `textMessage`, `riddle`.

The native cell type enumeration has: **empty, entrance, exit, floor, gate, info, map, riddle, secret passage, shadow, speed hazard, speed power-up, timer hazard, timer power-up, wall**.

Each bundled preset's document keys are `source`, `uniqueIdentifier`, `version`, `options`, `data`, `name`. `data` contains `cells`, `duration`, `player_avatars`, `scale`, `theme`. A cell has a three-coordinate `position`, `type` and, optionally, `variant`. The coordinates, the three scale components, the duration (`"300.0"`), tile variants, and boolean-like options (`"true"`) are stored as **strings**, which must be preserved during round trips.

**All eight built-in level documents specify scale `["18", "1", "18"]`, with horizontal tile coordinates in the range 0–17.** This verifies an 18 × 18 *digital* cell map. It does **not** by itself establish the photographic scanning grid's dimensions or the physical sizes of the wall pieces.

The original theme identifiers in JSON are `adventure`, `hedge`, `marble_maze`, `space`. The native Java enum calls the Marble theme `MARBLE`, but its **serialized identifier is `marble_maze`**. This distinction matters for compatibility.

Eight valid built-in preset documents were recovered structurally (not republished), and the replacement model was independently tested against **every one** with a lossless JSON round-trip in [this successful integration run](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/45102851758):

| Environment | Standard cells | Hard cells |
|---|---:|---:|
| Adventure | 115 | 132 |
| Hedge | 114 | 121 |
| Marble | 102 | 130 |
| Space | 109 | 136 |


The original preset titles are **Forbidden Temple** (Adventure), **Castle Quest** (Hedge), **Marble Mayhem** (Marble), and **Space Race** (Space), each in standard and hard versions. A ninth file, `assets/json/tutorial.json`, was found but is **not valid strict JSON** as stored, containing a trailing comma. Its intent and actual loader tolerance require further investigation.

## Original themes and visual evidence

The actual theme enumeration in the Android package is **ADVENTURE, HEDGE, MARBLE, SPACE**. Unity includes matching theme classes. Scene objects in the expansion archive identify:

- `castle`, `Castle`, `Music - Hedge` and flag geometry.
- `Spaceship`, `space-starcruiser`, `Music - Space`, cruiser geometry.
- An adventure terrain and `Music - Adventure`.
- A Marble theme with rolling-marble loop and physical-maze materials.

Original asset metadata includes **63 meshes, 109 textures, 20 audio clips, 27 sprites, and 13 Unity font objects**; one serialized main Unity asset alone is about 190 MB when reconstructed from fragments. Named UI/level assets include `VR-Tile-Start`, `VR-Tile-Finish`, `VR-Physical-Floor-Hole-01`, `Space-Wall-A`, `Gate - Force Field`, `Gate - Idol Wall`, `RiddleSphere`, `PlayerMarker-LH`, `PlayerMarker-RH`, and `map_pane_player`.

The Unity font assets identify the **Avenir** family. The Android APK additionally includes `assets/fonts/Futura.ttc`. These are historical typography references, **not a grant to redistribute font files**.

## Cross-checks from contemporary sources

- [Seedling's video (2016)](https://www.youtube.com/watch?v=sNR9Vf7bxe4) confirms capture, rearranged walls, puzzles, multiplayer, and Cardboard exploration.
- [Archived iOS App Store entry](https://maze-seedling.appstor.io/) documents more specific iOS features, including pressure-sensitive gesture shortcuts.
- [Physical kit specifications](https://fieldfolio.com/seedling-inspire-wholesalers-limited/catalog/design-your-own-marble-maze-app-not-working) confirm 45 wall blocks, perforated boards, start and end markers, and the included headset.
- [Historical maze capture photograph](https://brooksandco.co.nz/products/maze-diy-virtual-reality-adventure-game-for-kids-steam-toy) shows the alignment prompt and camera view.

The Android and iOS interfaces should be treated as **separate sources**, not assumed identical.

## Tested reconstruction foundation

`src/maze-document.mjs` now imports, validates, edits, and exports the original JSON structure while preserving unknown cell keys and the original string-based numeric representation. Unit tests are green, and all eight actual source presets were parsed and reserialized without changing their JSON data (the original proprietary level layouts were not published).

## Next implementation constraints

1. Derive precise board dimensions, snapping, markers, scan thresholds, and image-processing steps from the native `libtile_reader.so` and scanner UI. **Do not guess them.**
2. Implement an original editor and importer against the verified JSON schema with full round-trip preservation and explicit migration.
3. Preserve the four theme identities, actual cell semantics, audio cues, and controls; redraw or license assets appropriately for public distribution.
4. Implement camera scanning, manual correction, editing, single-player, Google Cardboard stereoscopy, and multiplayer in independently testable increments.
5. Keep raw third-party binaries out of this public repository. The user's **private** `udeudeude/work-and-research` repository can be used for non-public research if needed, subject to its `AGENTS.md` constraints. Its main branch is **not** a scratchpad.

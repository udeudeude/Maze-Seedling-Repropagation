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

**All eight built-in level documents specify scale `["18", "1", "18"]`, with horizontal tile coordinates in the range 0–17.** This verifies an 18 × 18 *digital* cell map. Independently, the contemporary [Vat19 retailer description](https://www.vat19.com/item/design-your-own-marble-maze-virtual-reality) says **each physical maze starts on an 18 × 18 grid**. This corroborates the physical paper's cell count but **not** grid pitch, printable-region offsets, wall placement geometry, physical wall lengths, or native image calibration. Direct validation against original boards remains outstanding.

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

## Native scanner pipeline: direct call evidence (November 27, 2026)

A [successful checksum-pinned static ARM inspection](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/45996895162) examined `lib/armeabi-v7a/libtile_reader.so` from the verified original Android 1.4 archive. The library itself has SHA-256 `5e2795b7a9a3db2949464381100cedcafcd2bad0a8b8ee401828d1f987b525f0` (402,864 bytes).

Direct function calls **verified from the original native binary**:

- `TileReader::liveProcess` calls both `TileReader::getBoardCorners` and `TileReader::computeBoard`.
- `TileReader::computeBoard` calls `stb::TileBoard::getWidth`, `getHeight`, `setTileAt`, and `reset_start_end`. This is direct evidence for grid-cell population in the live recognition path.
- `TileReader::getWalls` calls `stb::TileBoard::getBoardWalls`; it is a tiny accessor/delegation, not independent evidence for photographic wall detection.
- `TileReader::drawGrid` accesses board width and height; `TileReader::toJSON` calls the `TileBoard` serializer, which in turn accesses dimensions and tile cells.
- `TileReader::setBoardDimensions` calls `TileBoard` construction and assignment, but the current direct-call probe did not identify where its arguments are set.

**Not established:** numeric physical grid pitch, actual three wall-block lengths, camera perspective calibration, threshold values, marker detection rules, call order, or reconstruction fidelity. Small integer immediates appearing in disassembly are **not** evidence for dimensions. Indirect calls and external OpenCV calls are not fully resolved by the bounded direct-call method. No original code, executable, photographs, source tiles, or disassembly were committed or uploaded; only high-level derived relationships appear in workflow logs.

This narrows subsequent static investigation to `liveProcess` and `getBoardCorners`/`computeBoard` and the unknown dimension-setting caller, rather than reverse-engineering `getWalls` as though it performed the detector's pixel segmentation.


## Live JNI-to-scanner processing trace (November 27, 2026)

A [second checksum-pinned static native study](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/46004646781) traced the same original `libtile_reader.so` (SHA-256 `5e2795b7a9a3db2949464381100cedcafcd2bad0a8b8ee401828d1f987b525f0`) and broadened the search for direct callers.

- The actual Android JNI entrypoint **`Java_com_seedling_maze_TileReader_processFromJNI` directly calls `TileReader::liveProcess`**.
- `liveProcess` has direct named call sites for **`getBoardCorners`, `drawCorners`, `isSquareIsh`, `computeBoard`, `padImage`, `drawKnownTiles` and `stb::TileBoard::clear`**. Their lexical sequence puts corner recognition/drawing and a square-shape check before board computation, then image padding and known-tile drawing. **This is instruction-site order, not execution order**: conditional branches and loops were not recovered, and the circumstances of `clear` cannot be inferred.
- `drawKnownTiles` consults width, height and `TileBoard::getTileAt`; `computeBoard` consults dimensions and calls `setTileAt`. This establishes a shared native board representation for recognition and the visual overlay, not equivalence to current web rendering.
- The library imports OpenCV `Canny`, `GaussianBlur`, `blur`, `boundingRect`, `cvtColor`, `findContours`, `getPerspectiveTransform` and `warpPerspective`. **An imported function is not proof of use by any specific scanner stage**, nor evidence of specific thresholds.
- **Coverage limitation:** the linear pass decoded 924/2,612 bytes in `getBoardCorners` and 1,900/2,744 bytes in `computeBoard`. Data islands and control flow can terminate or bypass the remaining code, so negative call results are inconclusive. Original executable bytes and disassembly were neither executed nor redistributed.

Next: reconstruct the guarded corner/board processing and find the origin of board dimensions, then validate against independently annotated real physical-board images before changing the experimental web classifier.


## Reachable scanner stages from original control-flow traversal (November 27, 2026)

The [successful native control-flow experiment](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/46016709408) inspected the same checksum-pinned 402,864-byte Android **libtile_reader.so**. A bounded ARM/Thumb entrypoint traversal followed direct branches and avoided the literal-pool false stops that limited the previous linear pass. Its synthetic branch/fallthrough tests and existing game-model tests passed.

- **TileReader::getBoardCorners:** **2,398 / 2,612 bytes** decoded from branch-reachable paths, versus **924** in the earlier linear method. It contains **two direct calls to TileReader::euclideanDist**, missed by the linear pass, alongside point/vector handling. The fact that it calculates distances does not establish perspective-calibration coordinates or corner-selection rules.
- **TileReader::computeBoard:** **2,482 / 2,744 bytes** decoded, versus **1,900** linearly. Newly uncovered calls include **TileReader::computeMatches** and **stb::TileBoard::hasStart** and **hasEnd**; **reset_start_end** and **setTileAt** also occur in the same original function. This directly connects board population to an additional matching stage and start/end board checks, but **does not prove marker color rules, thresholds, or pixel-to-tile mapping**.
- **TileReader::computeMatches:** 688-byte function symbol, **620 bytes traversed**. Its direct named call sites in this analysis are largely OpenCV data-structure constructors/destructors. Neither its symbol name nor this result proves which pixels, shapes or rules it compares.
- Static traversal also follows both sides of a conditional branch, irrespective of actual input conditions. Decoded bytes are not guaranteed executed, while computed jumps, jump tables, callback dispatch and data-flow values remain outside scope. Bounded traversal and zero reported unresolved transfers **do not establish complete or correct behavioral recovery**.

The next original-parity research target is the arguments/data dependencies of **computeMatches** and the origin of board dimensions, tested against actual annotated kit photographs. This run changed only repeatable forensic tooling and its evidence audit, not recognition behavior or public assets. No original executable bytes were published.

## Next implementation constraints

1. Derive precise board dimensions, snapping, markers, scan thresholds, and image-processing steps from the native `libtile_reader.so` and scanner UI. **Do not guess them.**
2. Implement an original editor and importer against the verified JSON schema with full round-trip preservation and explicit migration.
3. Preserve the four theme identities, actual cell semantics, audio cues, and controls; redraw or license assets appropriately for public distribution.
4. Implement camera scanning, manual correction, editing, single-player, Google Cardboard stereoscopy, and multiplayer in independently testable increments.
5. Keep raw third-party binaries out of this public repository. The user's **private** `udeudeude/work-and-research` repository can be used for non-public research if needed, subject to its `AGENTS.md` constraints. Its main branch is **not** a scratchpad.


## Original-kit marker symbols versus classifier defaults (November 28, 2026)

A [contemporary photograph of the assembled physical kit](https://images.vat19.com/covers/x-large/design-your-own-marble-maze.jpg) shows a red sticker with a white flag pictogram and a separate turquoise sticker. This **visually supports** a provisional red-Finish / turquoise-Start interpretation, rather than the web prototype's earlier inverted color-to-role guess. The photo does **not** reveal the original Android algorithm's sticker recognition thresholds or prove every kit uses the same icon/color mapping. Scanner outputs are unconfirmed proposals, and the user must be able to correct the roles before import. No original image or sticker artwork is redistributed.


## Original scanner's image-processing call sites, structurally attributed (November 28, 2026)

The [checksum-pinned ARM investigation](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/46106959210) traced **calls originating within the original native library**, going beyond the previously known list of imported image-processing functions. The original `libtile_reader.so` checksum remains `5e2795b7a9a3db2949464381100cedcafcd2bad0a8b8ee401828d1f987b525f0`.

The 32-bit ARM procedure linkage table contains 115 consistently decoded call stubs, with one 20-byte resolver and 115 twelve-byte entries, corresponding to 115 contiguous relocation slots. Calculated stub references and relocation slots each advance by four bytes and differ by one constant address bias of **-360,360 bytes**. This permits a **structural, linker-order attribution** of imported function names to reachable scanner call sites, but **exact absolute GOT address verification failed**. Accordingly the following is high-value *qualified evidence*, not proof of execution or fully validated external linkage. The tooling refuses incomplete or irregular synthetic linkage tables and never republishes original executable code.

| Original function | Structurally attributed reachable OpenCV call sites (counts are static sites, not executions) |
| --- | --- |
| `TileReader::liveProcess` | `getPerspectiveTransform` (2), `warpPerspective` (1), `boundingRect` (1), `cvtColor` (3) |
| `TileReader::getBoardCorners` | `findContours` (2), `boundingRect` (2), `blur` (1), `cvtColor` (1) |
| `TileReader::computeBoard` | `Canny` (2), `GaussianBlur` (1), `findContours` (2), `boundingRect` (2), `cvtColor` (2), `blur` (1) |
| `TileReader::computeMatches` | `cvtColor` (1) |
| `TileReader::removeBoardEdges` | `blur` (1), `cvtColor` (1) |

These relationships justify prioritizing investigations into **perspective rectification, image contours, and actual wall/hole classification** rather than repeatedly adding correction controls. Neither the observed call-site structure nor a binary import inventory establishes image thresholds, line pitch, actual wall lengths, which branches run on a specific photograph, or full-feature parity. The current web classifier remains experimental. Real assembled-board photographs with independently measured grid boundaries and comprehensive labels are still the indispensable accuracy benchmark. The original photographs, binaries and source-level disassembly remain outside this public repository.


## Physical steel marble versus punched-out paper traps (November 28, 2026)

- The [contemporary assembled-board photograph](https://images.vat19.com/covers/x-large/design-your-own-marble-maze.jpg) shows a shiny metal playing marble as well as black paper perforations. The original kit shipped with three loose steel marbles ([retailer feature list](https://www.vat19.com/item/design-your-own-marble-maze-virtual-reality)), so a circular image feature alone does not establish a physical trap.
- The independent web detector now applies an **experimental reflective-interior negative** to candidates after radial-edge voting: an appreciable bright glint embedded in a dark body is treated as a likely physical marble rather than automatically proposed as a hole. This is not a claim about original native scanner logic, a verified marker threshold or real-photo accuracy. Extreme lighting, marble reflections and backlit openings still need real-image evaluation; unknown candidates remain reviewable.


## Historical physical-photo paper-lattice contrast check (November 28, 2026)

The [checksum-pinned Vat19 kit photograph](https://images.vat19.com/covers/x-large/design-your-own-marble-maze.jpg) was tested using the [read-only reference workflow](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/workflows/scan-reference.yml). It shows faint lines behind actual charcoal blocks but has no independently calibrated paper corners or exhaustive physical cell labels.

The newly implemented research-only script, scripts/measure-paper-lattice.mjs, compares potential lattice sites to neighboring paper brightness, excluding obvious wall interiors. It measures the documented 18-cell periodicity at multiple phases and separately at near and far sampling bands, reporting only aggregate contrast and counts. On four approximate insets (0%, 4%, 8%, 12%), **zero of 17 full-band line sites in each axis** exceeded 2.5 grey levels of local contrast; maximum median full-band contrast was 0.13 grey levels. Near/far sub-bands reached one to three candidate lines but never a mutually supported lattice. A lowered-threshold production-scanner experiment and a more elaborate local-contrast scanner experiment each passed synthetic controls but failed to resolve the historical photo; both were **reverted rather than merged**.

This negative finding constrains this *photograph and calibration hypothesis*, not the original Seedling scanner, its physical lattice pitch or native Android thresholds. The next meaningful measurement needs accurately marked paper corners and independently labeled complete wall/hole locations on real assembled Seedling photographs, rather than further threshold tuning of the same uncalibrated reference. No original photograph, source coordinates or proprietary executable were committed.


## Original Android camera-frame handoff and scanner dimensions (November 28, 2026)

A [checksum-pinned original Android Dalvik inspection](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/46129565430) examined `classes.dex` (SHA-256 `1b8439535e8c4e495d213e0e3ba587eb685c5919462782e9f1afc31e69c25e60`) from the same verified Android 1.4 archive as the native-library studies. The read-only `scripts/scanner-dex-geometry.py` reports direct invocation edges and candidate nearby literals, not Dalvik bytecode or decompiled original code.

**Direct Java invocation evidence:** `MazeCaptureActivity.onCameraFrame` contains calls to `rotate90(Mat)`, `processPreview()` and `setupOverlayProcessingThread()`. `onCreate` also calls `setupOverlayProcessingThread`; an activity-generated accessor directly calls `processOverlay()`. `MazeCaptureActivity.processScan` calls `TileReader.stringFromJNI()`, and `TileReader.json()` separately calls `stringFromJNI()`. The original Java `TileReader` declares `processFromJNI(J,J)`, although this bounded scan found **no direct invocation of that method** in the inspected application's three package families. That is not proof it was never invoked: dynamic/native dispatch, other callers and runtime conditions were not resolved.

The Java-facing `TileReader` method inventory does **not** expose the native `TileReader::setBoardDimensions` method. No direct Java invocation establishing physical grid pitch, corner offsets, wall-piece lengths or numeric camera calibration was recovered. This narrows future tracing to the original C++ scanner's dimension-setter dataflow, rather than treating Java constants near a camera method as verified tile geometry. The observed `rotate90` call is evidence for an original orientation-processing stage, **not** proof of orientation conventions for every captured image.

**Checks and limits:** the existing reconstructed-maze tests, static Python checks, synthetic Dalvik-call positive and negative tests, checksum validation of the downloaded archive, and derived-facts-only analysis all passed. Original executable/DEX bytes were removed from the runner and never published. This investigation changes no browser scanner behavior and measures no physical recognition accuracy or real iPhone results.


## Default scanner board initialized to 18 by 18, with bounded argument provenance (November 28, 2026)

A [checksum-pinned native constructor investigation](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/46134266681) examined the original Android 1.4 `libtile_reader.so` (SHA-256 `5e2795b7a9a3db2949464381100cedcafcd2bad0a8b8ee401828d1f987b525f0`). Two original `TileReader::TileReader` constructor variants directly call the **default** `stb::TileBoard::TileBoard()` constructor. In the original default board constructor, a reachable direct call to `stb::TileBoard::init(int, int)` is preceded in its straight-line region by an immediate assignment of **18** to argument register `r1` and a register move propagating the same **18** to `r2`. Under the ARM calling convention, these are the two integer parameters to `init(int,int)`. This is direct, instruction-local evidence that the native **default** board initializes an 18 × 18 cell array, independently corroborating the eight recovered 18 × 18 preset documents and the period retailer's physical 18 × 18 grid specification.

The separate `TileBoard(int,int)` overload receives runtime-supplied dimensions; no local constant pair was resolved at the call from `TileReader::setBoardDimensions`. The bounded reverse-direct-caller survey did not locate a call to that setter, but **does not prove it is unused**. Conditional execution, indirect native calls, runtime overrides and external setup have not been ruled out. A factory default 18 × 18 digital board **does not establish printed-grid pitch, grid origin, perspective inset, wall-block lengths, recognition thresholds, photo-to-cell accuracy or original iPhone behavior**. The bounded provenance analysis stops at unknown register writes, branches and intervening calls and is not a full control/data-flow proof. Synthetic immediate and copied-register positives and overwrite, jump and call-clobber negatives passed. The study never executed or redistributed original code or photos, and no web-scanner behavior was changed.

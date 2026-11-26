# Maze by Seedling: Repropagation

Independent, evidence-led reconstruction of the discontinued **Maze by Seedling** mobile companion for people who still own the original physical marble-maze kit.

**Status:** An early **playable iPhone web prototype** is deployed at https://udeudeude.github.io/Maze-Seedling-Repropagation/. It is not yet historically faithful and the physical-scanning recognizer is experimental.

## What we're restoring

The experience begins with the original wooden maze: arrange walls, choose entrance and exit, and punch traps in the paper floor. The original phone app photographed the physical board, turned its design into a digital maze, allowed editing with riddles, power-ups, hazards, photographs and sounds, and offered ordinary-screen and Google Cardboard exploration, with multiplayer racing.

Our target is an **iPhone-first, offline-capable web app** that preserves this physical-to-virtual workflow and historical visual/interaction character. It should not rely on a discontinued App Store application or third-party account.

## Verified historical evidence

- [Forensic findings](docs/FORENSIC_FINDINGS.md): original mechanics, platform architecture, camera-scanning implementation, four environments and audio/visual assets.
- [Android archive provenance](docs/ORIGINAL_ANDROID_ARCHIVE.md): recovered original package's SHA-256, inspection results and source.
- [Archived iPhone feature list](https://maze-seedling.appstor.io/).
- [Original Seedling demonstration](https://www.youtube.com/watch?v=sNR9Vf7bxe4).

The recovered Android 1.4 package has a native camera scanner using OpenCV and `libtile_reader.so`, a Java maze editor, and Unity 3D exploration. We have identified its actual JSON maze-document structure, all four environments, original class/asset names, and original preset files.

## Try the prototype

Open https://udeudeude.github.io/Maze-Seedling-Repropagation/ on your phone. Use **Build** to edit a digital board and **Explore** for first-person movement. In **Capture**, **Choose or take a photograph** opens the iPhone’s native Photo Library, Camera or Files picker. After aligning the board corners, you can either trace by hand or preview **experimental dark-wall suggestions**, adjust sensitivity, tap mistaken cells to correct them, and approve an undoable batch.

The scanner now **suggests** both dark wall strips and circular floor holes. Walls and holes can be reviewed separately; approved holes are saved as `repropagation.physicalHoles` annotations, displayed on the board and map, and treated as provisional traps in the explorer. The scanner also makes **provisional red and blue-green start/finish sticker suggestions**, which can be corrected or replaced before import. The color-to-marker interpretation is unverified. The scanner does **not** yet reliably discover the board boundaries, infer the physical grid, distinguish individual touching blocks of the three factory lengths, or establish accuracy on diverse unmarked photographs. It is not yet a faithful reimplementation of the original computer-vision system. All processing remains on-device.

See the evidence-led [original feature parity audit](docs/FEATURE_PARITY.md) for the major missing systems.

### Capture and save designs

In **Capture**, a single **Choose or take a photograph** button opens iPhone's native photo library, camera, or file picker. It replaces the redundant dedicated camera button. In **Build**, use the 1×–4× zoom buttons for precise editing and **Pan** to move the zoomed board without drawing. Select **Inspect tile**, tap a tile, then choose **Move tile** or **Copy tile** and tap an empty destination. To make a collectible key, place a **Message / key** tile, inspect it, and give it an identifier; use the same identifier on a Gate. During exploration, collected keys appear in the on-screen inventory and matching gates become passable. These edits are undoable; imported original cell metadata stays intact.

The **Maze files** menu now includes **My mazes**, an offline collection: open, duplicate, rename or delete designs; import a JSON maze as a separate entry; create fresh blank and practice mazes without replacing earlier work. The old single-maze autosave remains available as a local backup. Export is still recommended before clearing browser data or changing devices.

### Cardboard head tracking (experimental)

In **Explore**, tap **Cardboard** and grant motion access if requested. Turn the phone to look around, ideally in landscape, and use **Recenter** to align your current physical direction with the maze's starting direction. The view responds to head yaw and pitch rather than merely splitting the picture. Manual turning remains available without sensors. Viewer lens distortion, gaze/trigger controls and real-hardware calibration remain missing.

## Implemented

- `src/maze-document.mjs`: validates, imports, edits and exports the original maze-document structure. Preserves unknown fields and original numeric-string representations.
- `tests/maze-document.test.mjs`: synthetic-source regression tests, run automatically in GitHub Actions.
- `scripts/forensic_inspect.py`: static, reproducible package, native camera, Android editor, Unity asset, and game-document analysis.
- `scripts/verify-original-presets.mjs`: checks the data model against actual recovered sample documents without publishing those documents.
- [Forensic workflow](.github/workflows/inspect-original.yml): on-demand source inspection and short-lived derived-metadata reports.

Run the core model tests locally with Node.js:

```sh
node --test tests/*.test.mjs
```

## Build order

1. Establish **exact** physical grid/marker geometry and original imaging behavior using source evidence.
2. Implement camera capture, automatic recognition, and manual correction.
3. Build the editor with all original cell types and media/riddle features.
4. Reconstruct the four distinct environments and their visual identity, play controls, sound, and Google Cardboard rendering.
5. Implement local multiplayer and full offline-first support, then test on the physical kit and current iPhones.

## Original software and rights

This project is independent and unaffiliated with Seedling USA. The recovered Android software and its original artwork, music, models, fonts and code remain third-party material. **Do not commit, bundle, or publicly redistribute their unlicensed binaries or assets.** The open repository stores reimplementation and non-copying research metadata only.

The user's private `udeudeude/work-and-research` repository is available for research that genuinely requires private storage. Use its documented isolation/privacy rules and never treat private Git as a place for credentials or large copyrighted binaries.

### Exploration sound (new procedural audio)

Open **Explore → Sound off**, select Music and/or Sound effects, then choose **Turn sound on**. Four different soundscapes and interaction cues are synthesized on the phone without downloads or original proprietary material. Sound is off until intentionally enabled and stops when leaving exploration. Preferences stay on the device. These are modern replacement compositions, not historically faithful Seedling recordings; physical iPhone sound balance still needs testing.


### Photographs on maze messages (experimental)

In **Build**, inspect a **Message / key** tile, choose a photograph, and tap **Save tile**. The image is reduced to a compact JPEG inside the maze JSON; it is never uploaded. Add a caption in the message field. In **Explore**, entering that tile opens the image and pauses the game until Continue. Photos survive export/import, duplication, copying and offline storage. Too many photos can exhaust browser storage, so keep backups. This does not reproduce the original photo-wall placement or selfie system.

### Record a voice message (experimental)

In **Build**, inspect a **Message / key** tile, tap **Record voice** and grant microphone permission. Tap **Stop recording** within 15 seconds, listen to the preview, then **Save tile**. Use Remove recording if desired. Voice notes remain local, are embedded in maze exports, and can accompany captions or photographs. Enter the tile in **Explore** to view the message and press Play explicitly; exploration waits until Continue. The browser chooses MP4 or WebM, so an exported WebM note may not play on older iPhone browsers. Audio storage and permissions still need physical-device testing; this is not a historically verified Seedling voice implementation.

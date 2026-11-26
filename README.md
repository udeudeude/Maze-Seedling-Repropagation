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

Open https://udeudeude.github.io/Maze-Seedling-Repropagation/ on your phone. Use **Build** to edit a digital board and **Explore** for first-person movement. In **Capture**, **Choose or take a photograph** opens the iPhone’s native Photo Library, Camera or Files picker. Optional **Frame with live camera** provides an opt-in rear-camera preview with an approximate framing square and on-device lighting/contrast guidance. Press **Use this frame** to freeze an image for four-corner alignment; closing it or leaving Capture releases the camera, including when a permission request finishes late. The preview can suggest tentative board edges, and **Find board corners** offers a conservative estimate from the captured still; both require checking the four adjustable handles before import. After aligning the board corners, you can either trace by hand or preview **experimental dark-wall suggestions**. In review, adjust **Playable grid margin** if the actual paper grid lies inside a surrounding border, and align the overlaid squares before correcting walls, holes and start/finish markers. Margin changes recalculate suggestions and reset earlier corrections; approval is still required. You can then adjust sensitivity, tap mistaken cells to correct them, and approve an undoable batch. Existing authored tiles are protected from overlapping scanned lethal holes.

The scanner now **suggests** both dark wall strips and circular floor holes. Walls and holes can be reviewed separately; approved holes are saved as `repropagation.physicalHoles` annotations, displayed on the board and map, and treated as provisional traps in the explorer. The scanner also makes **provisional red and blue-green start/finish sticker suggestions**, which can be corrected or replaced before import. The color-to-marker interpretation is unverified. The scanner does **not** yet reliably discover the board boundaries, infer the physical grid, distinguish individual touching blocks of the three factory lengths, or establish accuracy on diverse unmarked photographs. It is not yet a faithful reimplementation of the original computer-vision system. All processing remains on-device.

See the evidence-led [original feature parity audit](docs/FEATURE_PARITY.md) for the major missing systems.

### Capture and save designs

In **Capture**, a single **Choose or take a photograph** button opens iPhone's native photo library, camera, or file picker. It replaces the redundant dedicated camera button. In **Build**, use the 1×–4× zoom buttons for precise editing and **Pan** to move the zoomed board without drawing. Select **Inspect tile**, tap a tile, then choose **Move tile** or **Copy tile** and tap an empty destination. To make a collectible key, place a **Message / key** tile, inspect it, and give it an identifier; use the same identifier on a Gate. During exploration, collected keys appear in the on-screen inventory and matching gates become passable. Drawing with a finger or mouse now fills skipped squares even during a fast stroke; one drag is one Undo action, rather than dozens of separate history entries. Edits are saved after each changed square. These edits are undoable; imported original cell metadata stays intact.

The **Maze files** menu now includes **My mazes**, an offline collection: open, duplicate, rename or delete designs; import a JSON maze as a separate entry; create fresh blank and practice mazes without replacing earlier work. The old single-maze autosave remains available as a local backup. Export is still recommended before clearing browser data or changing devices.

### Four distinct exploratory environments (independent artwork)

The four recovered environments no longer differ only by palette: stone courses in Forbidden Temple, layered foliage in Castle Quest, inlaid marble in Marble Mayhem, and luminous ship bulkheads in Space Race. This procedural Canvas architecture is newly authored and **does not reproduce proprietary original game art**. Performance, fidelity and Cardboard comfort remain unverified on physical devices.

### Cardboard head tracking and viewer trigger (experimental)

In **Explore**, tap **Cardboard** to fill the phone viewport with the two-eye scene and grant motion access if requested. Tap the view or use a compatible headset screen-touch trigger to take a short forward step; drag to turn, and use Exit or Recenter after removing the phone from the viewer. Manual movement buttons remain visible when motion tracking has not started. This is not optically calibrated for any particular headset.  Turn the phone to look around, ideally in landscape, and use **Recenter** to align your current physical direction with the maze's starting direction. The view responds to head yaw and pitch rather than merely splitting the picture. Manual turning remains available without sensors. Viewer lens distortion, gaze/trigger controls and real-hardware calibration remain missing.

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

In **Build**, inspect a **Message / key** tile, choose a photograph, and tap **Save tile**. The image is reduced to a compact JPEG inside the maze JSON; it is never uploaded. Add a caption in the message field. In **Explore**, entering that tile opens the image and pauses the game until Continue. Photos survive export/import, duplication, copying and offline storage. Too many photos can exhaust browser storage, so keep backups. This does not reproduce the original photo-wall placement.

### Record a voice message (experimental)

In **Build**, inspect a **Message / key** tile, tap **Record voice** and grant microphone permission. Tap **Stop recording** within 15 seconds, listen to the preview, then **Save tile**. Use Remove recording if desired. Voice notes remain local, are embedded in maze exports, and can accompany captions or photographs. Enter the tile in **Explore** to view the message and press Play explicitly; exploration waits until Continue. The browser chooses MP4 or WebM, so an exported WebM note may not play on older iPhone browsers. Audio storage and permissions still need physical-device testing; this is not a historically verified Seedling voice implementation.

### Save or share a view

In **Explore**, press **Snapshot** to pause and preview the current first-person scene, including the optional map. Select **Save image** to keep a PNG locally or **Share image** for the native phone sharing menu when supported; **Continue exploring** resumes play. Nothing is uploaded automatically, and no maze data changes. iPhone Safari and home-screen saving still need physical testing. A separate **Player** control lets you name your explorer and add an optional square-cropped selfie. It appears beside Restart, and both name and portrait are saved inside the active maze for export/backup; the native opaque `data.player_avatars` object is not overwritten. The selfie is not composited into first-person screenshots, and the historical multiplayer avatar system remains unimplemented.

### Back up, restore and share the whole collection

Under **Maze files**, **Save or share current maze** exports an individual native-format JSON maze. **Back up all mazes** creates a versioned JSON archive containing every local maze and any personal photograph or voice attachments. On supported iPhones, the native share sheet offers destinations including Save to Files or AirDrop; otherwise the browser downloads the file. A backup is not uploaded automatically. **Restore mazes from a backup** validates each maze and adds only missing designs without replacing or changing the current one, remapping conflicting library identifiers. Restoring the same backup again skips identical designs. Backups are not synchronized across phones; keep a copy outside Safari storage. The original game's live multiplayer remains unimplemented.

### Faster movement without pressure-sensitive hardware

In **Explore**, tap **Run** to move faster using the existing directional controls; tap again to walk. On a keyboard, hold **Shift** while moving for a temporary sprint. The original iPhone app used a stronger screen press for extra speed; modern iPhones no longer require that hardware. Speed pickups and slowdowns change pace independently, with their experimental timings clearly distinguished from verified historical behavior. Running resets when you restart or leave Explore. Fast movement checks every intervening maze tile, so it cannot skip walls, holes, or important interactions.

### Check playable routes, including keys and passages

In **Build**, choose **Check route** to highlight a route that can actually collect the needed Message-tile keys, open the matching gates, and traverse valid pairs of secret passages. It will not route you through annotated physical holes. The result distinguishes a blocked route from a malformed Start/Finish setup or a maze too complex to analyze. This checks possible movement, not a guaranteed win against moving shadows, the countdown or unverified historical game rules. Maze documents are never modified by the check.


### Collectible maps and exploration

**Explore → Map** now opens a chart of rooms you have walked through and the squares immediately beside them. This avoids revealing a maze's distant exit and hazards before exploring. Place a **Map** tile in Build: reaching it reveals the complete layout for that run. Secret-passage destinations also appear on your explored chart. Restarting resets the discovery. This makes the original Map tile category playable, but its reveal behavior is a documented reconstruction choice rather than a claim of historical accuracy.

### Put a player portrait on a snapshot (optional)

Create a local player identity in **Explore → Player**. When taking a **Snapshot**, you can check **Include my player portrait and name in this image** to add an unobtrusive player card to the saved picture. This is **off for every new screenshot**, including screenshots you share; the picture is previewed before saving. You can change the choice without moving your explorer or altering the maze. The card is an independently designed reconstruction feature, not evidence of the original Seedling avatar layout.


### Optional photographed-board border suggestions (November 26, 2026)

In Capture review, expand **Fine-tune individual edges** and choose **Suggest margins from photograph** to estimate visible paper-border cropping separately on each side. This is a conservative color-transition heuristic, not automatic physical-grid calibration; if the image provides insufficient evidence, no suggestion is made. Always inspect and correct all four controls and the refreshed walls, holes and markers before importing. This feature runs locally and leaves original photographs and maze documents untouched.

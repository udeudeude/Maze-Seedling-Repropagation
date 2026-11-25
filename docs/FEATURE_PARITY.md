# Original functionality parity audit

Evidence: original Android 1.4 binary method and asset inventories; archived iOS app description; Seedling's 2016 video; contemporary reviews. The Android build is not automatically identical to iOS. Status refers to the current independent web prototype, not the historical product.

| Original function | Current status | Remaining work |
| --- | --- | --- |
| Photograph-to-maze automatic scanning | **Experimental** continuous dark-wall spans and editable wall-tile suggestions, manually aligned | Automatic board corner finding, true physical grid calibration, actual-photo evaluation |
| Detect physical trap holes and start/finish | **Experimental:** circle and colored-sticker candidates, separate review/correction, marker import, namespaced hole annotations and provisional trap effect | Verify actual marker colors, capture calibration, original hole representation, classification precision on real photos |
| Detect walls of three physical lengths | **Partial:** straight spans and image-space lengths measured | Segment touching blocks individually, recover exact short/medium/long dimensions, calibrate against the physical grid |
| Live camera feedback and overlay | **Missing** | Guided preview, auto-detect boundaries, illumination and tilt advice |
| Edit maze by categories and variants | **Partial** 15 types, paint/erase, undo/redo, magnification and safe tile moving/copying | Original selection gestures, native zoom behavior, object limits, theme-specific variants, device validation |
| Start/end, hazards, moving chasers | Start and finish placeable; time/speed hazards rudimentary; physical holes trigger provisional loss | Recognize markers, correct trap effects, shadow patrol/chase and animations |
| Gates, collectible keys, inventory | **Incomplete** gate collision only | Functional keys, matching gate variants, placement, unlocking and inventory |
| Secret passages | **Not implemented** | Actual traversal/transport and audio/visual treatment |
| Riddles/questions/answers | Riddle tile placement only | Authoring, correct/wrong responses, effects, in-world answer interaction |
| Time and speed power-ups | **Partial** simplified effects | Accurate timing/duration, configuration, sound and notifications |
| Message and photo wall content | Text field only | Recorded audio/text messages, custom pictures/selfies, playback/display |
| Four original environments | Four **palette placeholders** | Rebuild original models, geometry, animation, textures, environmental details, and lighting |
| Original sound/music | **Missing** | Four themed scores/ambient sound, spatial effects, volume/music toggles |
| Flat-screen game | **Partial** raycast corridors and touch controls | Original movement speed, physics, controls, collectibles, map behavior |
| True Google Cardboard mode | Two side-by-side images only | Gyroscope head tracking, eye projection, lens correction, gaze interaction, recentering |
| Race nearby friends | **Missing** | Nearby Wi-Fi/Bluetooth or an equivalent direct peer system, synchronization, races |
| Selfie player avatars and screenshots | **Missing** | Avatar photos, player markers, in-world screenshot and sharing |
| Eight built-in mazes in four themes | One independently created practice maze | Historically accurate tutorial and standard/hard experiences; original distribution rights review |
| Multiple saved mazes / sharing | **Implemented local collection:** separately autosaved mazes, open, duplicate, rename, delete, import as new, independent recovery copy | Device-to-device transfer, indexed backups, sharing, quota recovery and iPhone field tests |
| Original iPhone pressure gestures | **Missing** | Accessible pan and speed equivalents without requiring 3D Touch |
| Original user interface and graphics | **Not faithful** | Reconstruct from original app screenshots, not generic dark controls |
| Offline / modern phone compatibility | **Partial** offline shell | Field testing on current iPhones, storage, orientation, updating, image permissions |

## Scanner-specific evidence

- Original native symbols: TileReader::getBoardCorners, computeBoard, drawGrid, getWalls, setBoardDimensions, removeBoardEdges; native board model can identify start and end.
- The first-hand Toy Insider review explicitly confirms automatic wall, punched-hole, start and finish recognition.
- [Original kit contents photograph](https://www.vat19.com/item/design-your-own-marble-maze-virtual-reality) shows charcoal-black walls, not tan wood. The original kit has 45 wall blocks in three lengths; the 18 × 18 size is VERIFIED FOR THE DIGITAL PRESETS only, not the physical camera scanning grid.
- The experimental classifier uses histogram-based dark segmentation, elongated straight runs, connected-component circularity and radial-edge voting to suggest dark wall strips and hole positions. Hole marks are kept in the `repropagation.physicalHoles` field, **not** a fabricated original cell category. Changing sensitivity reuses cached geometry. Exact short/medium/long wall dimensions and real-photo accuracy are **not established**.

## High-priority order

1. Recover exact physical board calibration, recognize all physical markers, validate against diverse real-world photographs, then remove the provisional label only when justified.
2. Finish original editor mechanics, media attachments, and correct game rules, especially keys/gates, active shadows, riddles, and secrets.
3. Recreate the four original environments with historically faithful geometry, distinctive art and music.
4. Implement actual iPhone Cardboard head tracking and comfortable control.
5. Implement multiplayer, maze library, photo sharing and proper user-experience polish.

## Primary sources

- [Binary findings](FORENSIC_FINDINGS.md)
- [Original iOS description](https://maze-seedling.appstor.io/)
- [Seedling demonstration, 2016](https://www.youtube.com/watch?v=sNR9Vf7bxe4)
- [Contemporary first-hand recognition review](https://thetoyinsider.com/design-your-own-marble-maze-review/)
- [Physical kit and wall-length review](https://www.youtube.com/watch?v=9Os-oESeG1Q)

The original application's proprietary assets and code are not included in this public reconstruction.

## Verified implementation update: November 25, 2026

- Separate photo library and camera controls on iPhone.
- Candidate wall positions and their continuous straight spans, with measured image-space lengths (not inferred official block sizes).
- Circular hole candidates from connected components and radial-edge voting, with the ability to add or remove candidate holes manually.
- Separate review modes for walls, holes, and start/finish stickers. Red and blue-green sticker guesses are editable; the inferred color-to-role association is **not historically verified**. Approving import cannot add a new wall to a selected hole or marker square; unrelated existing maze cells and imported metadata remain untouched.
- Reviewed holes persist in a namespaced extension, show as black circles in the board and map, and end an exploratory run as **provisional** simulated traps.
- Sensitivity slider reuses the photo-analysis result instead of re-running the expensive circle and segment detectors every time it moves.
- Tests cover synthetic wall lengths, isolated/touching holes, correction persistence, data compatibility and collision. **Field validation on unmarked, original-camera photographs remains necessary.**

- Candidate sticker positions can be approved as verified original `entrance` and `exit` cell types, subject to collision checks; the physical-to-digital mapping is still provisional.

### Interpretation caveat

Although the physical kit has three wall lengths and the bundled digital mazes have 18 × 18 coordinate maps, the exact physical grid pitch and mapping are still unknown. A continuous dark span might represent several touching factory pieces. The current code measures image-space straight spans and does **not** assert that each is exactly one factory part.

## November 25, 2026: photo selection and multi-maze library

- Removed the duplicate **Take a photograph** button. A single **Choose or take a photograph** control invokes iPhone's native Photo Library, Take Photo and Choose File menu.
- Added a separately saved local maze collection. Users can open, rename, duplicate and delete individual designs, create a blank or practice design without overwriting the previous one, and import external original-format JSON as another saved maze.
- Migrates the legacy single-maze autosave, preserves unknown document keys and keeps the old key as an independent recovery copy. No photograph or maze is uploaded by this feature.
- Unit tests cover collection creation, switching, copying, deletion, invalid-data recovery, legacy migration and document metadata preservation. Browser-specific storage durability still requires device testing.

## November 25, 2026: magnified editing and lossless tile transfer

- Build board can be zoomed from 1× to 4× with a stable viewport center. **Pan** is a distinct, clearly indicated mode: touch scrolling or mouse dragging moves the enlarged board without painting. Return to drawing by deselecting Pan; normal canvas cell mapping remains based on the displayed board bounds.
- The existing **Inspect tile** sheet now offers **Move tile** and **Copy tile**. Choose an empty destination on the board or cancel. Both operations are undoable; copying a start or finish is disallowed. Occupied squares and photographed physical holes are rejected rather than silently overwritten.
- Tile movement/copying preserves the complete original cell object, coordinate representation, unknown fields and other overlapping imported cells; no new original tile categories are invented. Browser and original-device gesture fidelity are still unverified.
- Coverage: model tests for transfers, import metadata, occupancy and bounds, and an interface-contract test for the zoom/pan and move/copy wiring. Physical iPhone testing remains outstanding.

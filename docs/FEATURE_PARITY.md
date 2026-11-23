# Original functionality parity audit

Evidence: original Android 1.4 binary method and asset inventories; archived iOS app description; Seedling's 2016 video; contemporary reviews. The Android build is not automatically identical to iOS. Status refers to the current independent web prototype, not the historical product.

| Original function | Current status | Remaining work |
| --- | --- | --- |
| Photograph-to-maze automatic scanning | **Experimental** local wooden-wall suggestions after manual corner alignment | Exact board tracking, native grid/marker recognition, actual photo validation |
| Detect physical trap holes and start/finish | **Missing** in camera scanner | Restore these three recognition targets and map to original virtual cells |
| Detect walls of three physical lengths | Partial cell classifier; **no compound-wall detection** | Match three wooden wall lengths and physical grid before translating to 18 × 18 digital cells |
| Live camera feedback and overlay | **Missing** | Guided preview, auto-detect boundaries, illumination and tilt advice |
| Edit maze by categories and variants | **Partial** 15 tile types, paint, erase, undo/redo | Original selection, moving/copying, zoom/pan, object limits, theme-specific variant controls |
| Start/end, hazards, moving chasers | Start and finish placeable; hazards **rudimentary** | Recognize markers, animate holes/traps, shadow patrol, chase and restart |
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
| Multiple saved mazes / sharing | One local autosave plus JSON import/export | Maze library, duplicate, rename, robust backups and sharing |
| Original iPhone pressure gestures | **Missing** | Accessible pan and speed equivalents without requiring 3D Touch |
| Original user interface and graphics | **Not faithful** | Reconstruct from original app screenshots, not generic dark controls |
| Offline / modern phone compatibility | **Partial** offline shell | Field testing on current iPhones, storage, orientation, updating, image permissions |

## Scanner-specific evidence

- Original native symbols: TileReader::getBoardCorners, computeBoard, drawGrid, getWalls, setBoardDimensions, removeBoardEdges; native board model can identify start and end.
- The first-hand Toy Insider review explicitly confirms automatic wall, punched-hole, start and finish recognition.
- The original kit has 45 wall blocks in three lengths; the 18 × 18 size is VERIFIED FOR THE DIGITAL PRESETS only, not the physical camera scanning grid.
- Current classifier is a provisional wood-color heuristic. It preserves existing tiles, allows sensitivity adjustment and manual review, and does not yet recognize all original features. Accuracy on real Seedling photos is NOT independently established.

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

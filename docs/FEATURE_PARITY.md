# Original functionality parity audit

Evidence: original Android 1.4 binary method and asset inventories; archived iOS app description; Seedling's 2016 video; contemporary reviews. The Android build is not automatically identical to iOS. Status refers to the current independent web prototype, not the historical product.

| Original function | Current status | Remaining work |
| --- | --- | --- |
| Photograph-to-maze automatic scanning | **Experimental** continuous dark-wall spans, editable wall-tile suggestions, four-corner estimate and independently adjustable playable-grid edges plus optional, conservative photo-border suggestions | Verify corner recognition on physical boards, true physical pitch and actual-photo evaluation |
| Detect physical trap holes and start/finish | **Experimental:** circle and colored-sticker candidates, separate review/correction, marker import, namespaced hole annotations and provisional trap effect | Verify actual marker colors, capture calibration, original hole representation, classification precision on real photos |
| Detect walls of three physical lengths | **Partial:** straight spans and image-space lengths measured | Segment touching blocks individually, recover exact short/medium/long dimensions, calibrate against the physical grid |
| Live camera feedback and overlay | **Partial:** opt-in live camera, sampled exposure/contrast guidance, conservative live board-outline tracking, still-frame automatic corner suggestion and editable handles | Validate board outlining on actual kit photographs, lighting and perspective feedback, physical calibration and iPhone behavior |
| Edit maze by categories and variants | **Partial** 15 types, paint/erase, undo/redo, magnification and safe tile moving/copying | Original selection gestures, native zoom behavior, object limits, theme-specific variants, device validation |
| Start/end, hazards, moving chasers | Start and finish placeable; time/speed hazards rudimentary; physical holes trigger provisional loss; **experimental moving shadow chasers** | Recognize markers, correct trap effects, original shadow patrol speeds and animations |
| Gates, collectible keys, inventory | **Partial:** opt-in collectible keys on Message tiles, matching gate variants, collision unlocking, visible inventory, and key-aware route diagnostics | Recover historical key representation, original pickup effects, gate behavior and 3D visuals |
| Secret passages | **Partial:** paired variant codes transport in exploration with return-trip latch; route check models paired transport | Verify original linkage rules and add original sound/visual treatment |
| Collectible map | **Experimental:** exploring charts visited rooms and neighbors; collecting the original `map` tile reveals the full layout | Verify historical map reveal rules and appearance from original device evidence |
| Riddles/questions/answers | **Partial:** authored questions and answers with playable, skippable interaction | Recover original answer consequences, scoring and native data mapping |
| Time and speed power-ups | **Partial:** boosts accelerate, slow hazards reduce speed for 12 seconds, time tiles change countdown | Historical timing, effect strength, configuration and device validation |
| Message, photo and voice content | **Partial:** Message tiles accept short personal microphone recordings, portable photographs and notes; authored photos also appear as framed panels in first-person and Cardboard views, and full voice/photo messages pause exploration | Native photo-wall placement, historical presentation, physical microphone tests, device quota and camera testing |
| Four original environments | **Partial:** four distinct newly authored procedural wall architectures and perspective floor/sky cues replace palette-only placeholders | Historically faithful models, textures, animation, lighting, environmental detail, and physical-device validation |
| Original sound/music | **Partial:** four synthesized atmospheres, event cues, directional proximity warnings for moving shadows, opt-in activation, volume and independent music/effects switches | Historically faithful music, environmental occlusion/reverb, authentic spatial calibration, physical iPhone listening tests |
| Flat-screen game | **Partial:** raycast corridors, touch movement and visible depth-scaled interactive tile markers | Original movement speed, physics, recognizable original 3D artwork and device controls |
| True Google Cardboard mode | **Partial:** stereo, permission-based relative head yaw/pitch, recenter, immersive viewport, touch/viewer-trigger stepping and manual-turn fallback | Calibrated optics/lens distortion, historical gaze interactions, actual iPhone headset and trigger tests |
| Race nearby friends | **Missing** | Nearby Wi-Fi/Bluetooth or an equivalent direct peer system, synchronization, races |
| Selfie player avatars and screenshots | **Partial:** optional locally authored selfie portrait and player name in Explore; snapshot preview can explicitly include an independently drawn player name/portrait card | Historical multiplayer avatar representation, player presence in shared 3D scenes, original photo effects, iPhone photo and share verification |
| Eight built-in mazes in four themes | One independently created practice maze | Historically accurate tutorial and standard/hard experiences; original distribution rights review |
| Multiple saved mazes / sharing | **Partial:** local collection, native-format individual maze export, whole-library JSON backups, additive merge restoration and opt-in native file share | Actual nearby multiplayer, comprehensive quota recovery, iPhone share-sheet and download validation |
| Original iPhone pressure gestures | **Partial:** explicit editor Pan mode; Explore Run toggle and Shift-to-run, with swept movement | Verify mobile ergonomics, calibrate historical fast/slow rates, Home screen shortcuts still absent |
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

## November 25, 2026: interactive riddles and paired passages

- The tile inspector now provides distinct question and answer fields for Riddle tiles; answers accept case and whitespace variation. The in-world prompt pauses movement and the countdown until answered or explicitly skipped, offers immediate retry feedback, and records solved riddles for that run. Skipping has no penalty; original scoring, rewards, and wrong-answer consequences are not yet established.
- Newly authored riddle content is in each cell's `repropagation.riddle` extension. Imported, potentially opaque native `riddle` objects and all other original cell fields remain untouched; the new extension is intentionally not claimed to be the historical format.
- **Secret passage** tiles can be linked by the same variant code; a unique, safe pair transports a player in either direction. A latch prevents instant bounce-back. Blank, ambiguous, blocked or physical-hole destinations are rejected. Historical linking behavior, animation and audio are still unknown.
- Unit and interface-contract tests cover modal interaction wiring, answer normalization, replay/skipping, paired passage behavior, invalid links, and original metadata preservation. Actual mobile-browser interaction still needs testing.

## November 25, 2026: collectible keys and functional gates

- A Message (native `info`) tile can optionally carry a **key identifier**, authored in its inspector. This is deliberately a `repropagation.keyId` extension, **not a fabricated original key tile category**: the recovered native tile enumeration does not have a separate key type.
- Exploration collects the key on entry. Matching gate identifiers become passable; the key opens multiple gates, remains in the run's inventory and resets on restart. The raycaster and map recognize unlocked gates; the inventory is visible on-screen.
- This is reconstructed gameplay, not a claim about the historical key data format, gate mechanics, or effects. Existing native `info` fields and unknown metadata are preserved. Tests cover collection, mismatched keys, collision/raycast behavior, repeated gates, restart and source integrity. Physical iPhone testing is outstanding.

## November 25, 2026: moving shadow chasers

- **Shadow tiles now spawn moving chasers**, rather than remaining permanently lethal squares. Shadows appear as projected silhouettes in first-person corridors and moving map markers. No recovered proprietary 3D assets are shipped.
- Chasers follow deterministic four-direction shortest walkable routes toward the player and move continuously. Walls, locked gates and annotated physical trap holes block pursuit; matching collected keys reopen gates. Physical contact ends the run, including when the player approaches a shadow or teleports next to one.
- Riddle prompts and game-over states suspend shadow movement. Restart restores original positions. The original JSON document is not changed. New tests cover pursuit, barriers, gate keys, collisions, resets, paused state and data preservation.
- **Historical limitation:** Recovered code evidence supports following shadows and shortest-path logic, but not exact movement speeds, patrol and detection behavior, original three-dimensional models, sound or scoring. Physical iPhone validation remains necessary.

## November 25, 2026: Cardboard orientation groundwork

- Cardboard previously just drew two side-by-side images. It now requests browser motion permission from the initiating tap, then combines alpha/beta/gamma and screen rotation to track yaw and pitch. Head orientation is relative to the user's direction at activation, not an invented compass bearing. Recenter maps the current physical direction to the maze's starting heading.
- The two-eye scene gains a landscape layout, a clear exit and motion-status feedback. Denied or absent sensors leave manual turning available. Motion listeners are removed on exit; pausing the browser releases held movement controls.
- Added tests for quaternion yaw, pitch, screen rotation, wraparound, invalid readings and browser interface wiring. **Still not calibrated Cardboard:** lens projection/distortion, viewer calibration, gaze trigger, positional tracking and real iPhone validation remain unfinished.

## November 25, 2026: opt-in audio during exploration

- Added four newly composed procedural soundscapes generated locally from browser oscillators, each with different pitch range, rhythm and timbre: low Adventure pulses, Hedge bells, Marble mallet notes and sustained Space drones. These are **not** recovered Seedling music or effects; none of the original copyrighted audio is republished.
- A single Sound control opens accessible settings with separate Music and Sound effects toggles. The engine creates its audio context only after an explicit user action. Playback pauses outside Explore or while the browser is hidden, and can resume on an intentional return to Explore. Preferences remain local, with no external requests or audio asset downloads.
- Added game-state transition cues for collecting keys, opening gates, riddles, secret passages, time and speed changes, winning, timeout, shadow encounters and physical trap holes, without repeating every render frame.
- Unit tests cover four unique musical patterns, audible bounds, transition triggers, opt-in lifecycle, preference switches and offline publication. **Still incomplete:** historical scores, calibrated three-dimensional spatial audio and speaker balance on real devices.


## November 25, 2026: personally authored photograph messages

- The Message / key tile inspector now supports attaching, replacing and removing personal photographs, without a redundant camera control. JPEG encoding and downscaling happen locally, with a maximum embedded data URL length of 110,000 characters (roughly 80 kilobytes).
- The image is embedded in the namespaced cell.repropagation.photo.dataUrl extension, which survives JSON export/import, offline storage, copying and moving. Imported original photoPath and other document metadata are preserved. Remote links, SVG and active HTML are rejected as photo attachments.
- During exploration, entering a Message tile with a personal photograph opens the image and caption in a dismissible dialog and pauses movement, countdown and shadow pursuit. Existing key pickup remains functional. The photograph appears once per tile per run.
- Tests cover safe, bounded input, editing/removal, metadata preservation, portable JSON and paused play. This is a modern approximation, not the original photo-wall or selfie system. Local browser storage quotas and real iPhone image orientation require field testing; users should export backups.

## November 25, 2026: portable recorded voice messages

- Message / key tiles now support **Record voice**, **Stop recording**, local playback preview, **Remove recording** and Save tile. The browser asks for microphone access only when recording. Microphone tracks are released on stop or dialog cancellation; recordings awaiting permission cannot overwrite a subsequent tile.
- Recordings are limited to 15 seconds and 120 kilobytes of compressed data. Browser capability detection selects supported MP4 audio (preferred for iPhone Safari) or WebM. The stored data URL is bounded and allows only embedded MP4/WebM audio, never remote or active content.
- Recordings are stored in `cell.repropagation.voice.dataUrl`, separate from original `audioPath` and other native or unknown metadata. They survive JSON export/import, tile duplication, and offline use. Photo and voice may coexist on one Message tile.
- In exploration, voice-only, photo-only, and combined messages open the same pause dialog. Voice playback requires pressing the native audio player's Play button, and it stops on Continue or when leaving Explore. Movement, countdown and moving shadows stay paused during the message.
- Automated tests cover bounded input, MIME selection, metadata round trips, message pauses and interface wiring. **Actual iPhone microphone permissions, playback, codec compatibility across devices and browser-storage capacity remain unverified.** These recordings are an independent replacement, not the original proprietary voice subsystem.

## November 25, 2026: first-person snapshots

- Explore now has a **Snapshot** control that pauses gameplay and previews the actual rendered first-person scene, including the map overlay when shown. It saves as PNG, not copied historical art or assets.
- **Save image** points to a temporary local image, and **Share image** opens the native file share sheet where supported. No automatic upload or transmission occurs. Unsupported browsers hide the share action; users can still save or open the PNG.
- Export filenames are derived safely from the current maze. Closing the preview releases the object URL and resumes exploration without editing the original document. Encoding failures are reported, not silently treated as valid images.
- Tests cover PNG encoding and failure, filenames, capability fallback, offline caching, and interface wiring. **Not yet verified:** physical iPhone share/download behavior (especially home-screen apps) and historical selfie avatars.

## November 25, 2026: portable library backup and direct file exchange

- A versioned whole-library JSON export preserves user-created and native maze fields, collection names, timestamps, personal photographs and voice messages. Single-maze export remains in original Seedling-compatible format. Library archives are deliberately distinguishable so they cannot be mistaken for original documents.
- A validated restore merges without replacing any existing maze or changing the current maze. Duplicate documents are skipped, incoming colliding library IDs are remapped, and repeat restoration is idempotent. Invalid documents and browser storage quota failures leave the existing library untouched.
- Save or share this maze and whole-library backups invoke the user's native file sharing sheet where supported (Save to Files or AirDrop may be offered). Other browsers receive local downloads. Nothing uploads automatically, and the menu warns that archives include personal media.
- Switching or deleting a maze now saves the collection before changing in-memory active state, avoiding silent data loss when storage is full. New tests cover native data and media preservation, conflict resolution, idempotence, malformed backups, filenames and browser sharing. **Still missing:** live multiplayer, automatic synchronization, device-tested iPhone file sharing, storage quota recovery and accessibility verification.

## November 26, 2026: opt-in live camera framing

- Capture now offers an explicitly initiated rear-camera preview next to the existing single native photograph picker. A square overlaid reference helps frame the physical board; it is a guide, **not** detected board geometry. The selected frame feeds the same four-corner alignment, review and undoable import path as a file photograph.
- A lightweight on-device sample warns about severe darkness, clipped highlights and weak contrast. It does not claim to measure actual recognition accuracy, detect physical grid pitch or distinguish touching factory walls.
- Closing the preview, switching tabs, hiding the page or leaving the app releases the camera tracks. A request granted after cancellation releases its tracks without restoring the camera. No live frames are uploaded, saved automatically or added to maze documents.
- Tests cover exposure guidance, cancel-before-permission races, resource cleanup and interface wiring. **Real iPhone camera permission, exposure guidance, frame orientation and physical scanning quality remain unverified.**

## November 26, 2026: conservative automatic board-edge suggestion

- Capture includes an **Find board corners** action. It examines the selected frame locally for a bright physical board bounded by darker surroundings, samples multiple horizontal and vertical transects, fits four independently slanted edges and proposes a perspective quadrilateral. The proposed handles remain manually adjustable, and no tile is imported without review.
- Uniform images, gradients, missing borders, inconsistent edges and implausible geometry yield no proposal instead of guessed coordinates. It is deliberately conservative: a cropped board, light surroundings, difficult shadows or unusual materials may require entirely manual alignment.
- New synthetic tests exercise trapezoids, portrait orientation, interrupted paper/grid texture and false-positive rejection. **Accuracy on actual Seedling-kit photographs has not yet been validated**; the algorithm does not establish the kit's physical pitch, wall lengths or original scanner calibration.

## November 26, 2026: live board-outline guidance

- The optional rear-camera preview now checks, about once every 1.8 seconds, for a bright board's four outer edges against a darker surrounding surface. A turquoise quadrilateral highlights **possible** detected edges; a dashed square remains the fallback framing guide. This is visual feedback only, never automatic recognition/import of original maze tiles.
- The overlay accounts for aspect-ratio letterboxing from `object-fit: contain`; landscape and portrait camera samples are projected into the displayed video area without stretching. No camera imagery is uploaded or stored.
- Choosing **Use this frame** independently analyzes the **captured still**, not a potentially stale live estimate. If detection passes its conservative geometric checks, the four draggable handles start at that estimate. If not, the existing safe inset handles appear. The editable review and explicit import steps remain mandatory.
- Tests cover landscape and portrait projection, validation, opt-in camera wiring and manual review preservation. **Unverified:** recognition accuracy on the original physical kit, reliability under varied surfaces/lighting, mobile performance and actual iPhone camera orientation. No historical Seedling scanner calibration is claimed.

## November 26, 2026: pressure-free running and safe accelerated movement

- The archived iPhone description documents pressing harder to move faster during flat-screen play, and pressing harder while dragging to pan the editor. Modern phones cannot depend on that hardware. Build already has a deliberate Pan mode; Explore now offers a thumb-accessible Run toggle and a held Shift shortcut. Run resets when restarting or leaving exploration, without modifying the maze document.
- Diagonal movement is speed-normalized. Accelerated motion is collision-tested in short swept steps so it cannot pass through walls, gates, physical holes, collectible keys, puzzles, shadows or the finish without triggering each intervening interaction. This also fixes potential skipped tile effects during ordinary large frame intervals.
- Speed hazards now apply a 12-second slowdown instead of only cancelling an active boost. Speed boosts clear slowdowns; Run combines with the current effect. Countdown, speed effects and moving shadows remain suspended during modal puzzles and photograph/voice messages.
- Automated tests cover acceleration, diagonal movement, fast wall collisions, holes, goal triggers, slowdown timing, reset and controls. The 12/25-second durations and velocity multipliers are **reconstruction choices, not historical measurements**. Physical iPhone control and performance testing is still required. No original licensed assets or document fields were added.


## November 26, 2026: directional pursuer audio and volume

- Opt-in audio now includes quiet distance-scaled pulses from the nearest moving shadow. Left/right stereo balance tracks the explorer's heading (including Cardboard motion); pulse rate increases as a pursuer approaches. Sound is intentionally audible through walls: a proximity cue, **not** physically realistic occlusion.
- Native stereo panning is used where available, falling back to mono. No original proprietary music, samples, or graphics were published.
- A persisted master volume slider adjusts locally generated music and effects without reactivating audio or resetting the music theme. Shadow warnings stop during messages, riddles, pauses, concluded games, or when sound effects are disabled. Slowdown traps receive their own interaction cue.
- New automated tests cover direction, attenuation, distance limits, muted and modal behavior, volume, rate limits, and explicit activation. Actual iPhone playback, headphone spatial quality and original sound fidelity remain unverified.

## Verified implementation update: November 26, 2026 (playable-route validation)

- The editor's **Check route** now searches the actual reconstructed key/gate and paired-secret-passage rules instead of treating all locked gates as permanent walls. It finds a route that collects keys before approaching their gates, and refuses shortcuts via unmatched passages or physical holes.
- Routes are overlaid on the board and report the number of moves, necessary keys and successful passage transfers. Missing or duplicate Start/Finish markers and overlarge search spaces are reported separately rather than misclassified as impossible mazes.
- **Not a win guarantee:** dynamic moving shadows, countdown deadlines, and player motor skills are not simulated. Unknown original native rules also remain unresolved. This is a reconstruction-specific authoring aid, not evidence of an original game's route checker.
- Dedicated tests cover gate-before-key ordering, mismatched identifiers, portal pairing, photographed holes, round-trip data preservation and bounded search.


## November 26, 2026: playable collectible Map tiles

- The original document model includes a real `map` tile type. Previously entering it only displayed “Map discovered” while Explore's map button exposed the entire maze at all times; the pickup had no gameplay effect.
- Explore now maintains a **run-local chart** showing walked squares and their immediate neighboring cells. A Map tile reveals the entire layout, including gates and annotated physical holes, when collected. Prior to pickup, distant hidden cells and pursuing shadows are not disclosed by the map overlay. The player can still open the partial chart at any time.
- Exploration and one-time tile activation are tracked independently, so backtracking does not retrigger power-ups or messages; both ends of a secret-passage transfer count as explored. Restart clears the chart. This does not modify maze JSON or override opaque imported native fields.
- Automated tests cover unexplored exits, floor traversal, pickup/restart, passage transfers and source preservation. **Historical uncertainty:** exactly when and how Seedling revealed maps is not recovered. The explored-chart rule is an explicit reconstruction choice, and mobile readability still needs field testing.

## November 26, 2026: optional selfie player identities

- The original included player selfie avatars. Explore now has a **Player** editor for an optional name and portrait. A selected camera/library photo is cropped to a compact square JPEG locally and displayed by the Player control. A user can replace or remove the portrait while retaining the name.
- The portrait and name live in `maze.repropagation.playerAvatar`, not in the recovered but still opaque `data.player_avatars`. Original avatar records, other unknown fields, maze tiles, and imported asset references survive every edit. Duplicate mazes, individual exports and whole-library backups include the opt-in image. No request or upload occurs automatically. Sharing a maze **does share any embedded selfie**.
- The editor cancels stale image loads, limits local JPEG size, rejects remote/active image URLs, and writes the collection to local storage before claiming a save succeeded. Storage quota failure leaves the current maze untouched. Tests cover name sanitation, bounded JPEGs, replacing/removal, crop geometry, metadata round trips and interface wiring.
- This is a **single local player identity**, not the original avatar interchange format, face detection, multiplayer racing, or a selfie overlaid into the exported first-person snapshot. Physical iPhone photograph-picker behavior, visual design, browser quotas and permission handling still require device verification.

## November 26, 2026: visible first-person interaction tiles

- Interactive original tile categories now have distinct, perspective-scaled procedural signs in Explore: Finish, Map, Message/key, Riddle, secret passage, time and speed bonuses and hazards. Previously only walls, gates, physical holes and shadows were drawn in the scene, making these effects discoverable mainly by accidental collisions. The signs are an explicitly **independent reconstruction**, not original artwork or proof of historically accurate object appearance.
- The new billboards are projected separately for each Cardboard eye, clipped to each eye's view, and hidden behind solid walls and locked gates using the raycast index. Key messages use a key symbol; collected one-shot tiles disappear, while reusable passages and Finish remain landmarks. Restarts restore pickups. No original cell, avatar, image, or document metadata is changed.
- Automated coverage checks occlusion, behind-camera culling, one-time and reusable interactions, key identity, stereo parallax and both canvas render paths. Physical iPhone legibility, original placement and the four historically faithful environments remain unverified.

## November 26, 2026: authored photographs visible during exploration

- Message tiles containing opt-in, locally authored JPEG photographs now display their actual image on a perspective-scaled panel while approaching. Images are letterboxed rather than cropped; an attached key retains a visible key emblem. The original message still opens at full size upon entering its tile, with the timer and moving shadows suspended.
- Wall occlusion and stereo projection are shared with the existing interaction objects. Decoding uses only validated embedded JPEG data, with an on-device, bounded image cache. Unavailable or undecoded images fall back to the ordinary Message icon. Original `photoPath` fields, imported proprietary assets, document metadata, and user content remain unchanged.
- This is an independent reconstruction of photo presentation, **not** a verified original wall-decal layout or historical Seedling graphic. Actual iPhone image decoding, frame legibility, and Cardboard comfort still require device testing.

## November 26, 2026: opt-in player identity on saved snapshots

- Explore snapshots can optionally include an independently drawn player portrait and name, using the locally authored selfie record. The option is presented only for mazes with a player identity and is **unchecked for every new snapshot**, so ordinary screenshots and shares exclude personal identity by default.
- The underlying first-person scene is frozen at capture and preserved unaltered. Toggling the checkbox regenerates an isolated screenshot without changing the game canvas, current run, original document, imported opaque `data.player_avatars`, or other artwork. Previous and cancelled image generations cannot replace a newer choice; stale blob URLs are released and download/share controls remain disabled during regeneration.
- The badge and its layout are new reconstruction artwork, **not** a historically verified Seedling avatar treatment. Tests cover name-only and portrait cards, opt-in behavior, cancellation boundaries and screenshot contracts. On-device visual placement and iPhone sharing still require verification.

## November 26, 2026: usable immersive Cardboard controls

- Entering Cardboard now expands the paired-eye view across the entire phone viewport, instead of leaving the maze as a small stereo strip above ordinary navigation. A visible Exit and Recenter control remains available when the phone is removed from the viewer. The scene's ordinary single-eye countdown and map overlay are hidden to avoid conflicting, unduplicated images between the stereo eyes.
- A short tap on the scene, including a compatible viewer's screen-touch trigger, advances the explorer forward in small, collision-swept increments. Dragging turns without moving; long presses, large drags and secondary fingers do not trigger a step. A trigger cannot move the explorer while a riddle or personal message is open or after the game ends.
- Head motion remains opt-in. Until valid motion readings arrive, the manual movement/turn pad stays available as a fallback. Exiting Cardboard clears held controls; ordinary flat-screen movement and imported maze documents are unchanged.
- This is a new, independent interaction, **not a claim about original Seedling trigger semantics or lens calibration**. Current iPhone Safari/installed-app display, landscape geometry, and physical viewer-button behavior still need real-device testing. Automated tests cover tap-versus-drag, sweep-safe wall/gate/hole/pickup behavior, modal guards, and interface wiring.

## November 26, 2026: four independent procedural environment architectures

- The four recovered identifiers now produce distinct surface geometry and spatial cues instead of simple palette changes. **Forbidden Temple** uses staggered sandstone courses and overhead lintels, **Castle Quest** uses irregular foliage and open sky, **Marble Mayhem** uses veined stone panels and floor inlays, and **Space Race** uses ship bulkheads, lit conduits and projected deck lanes. Gates retain a differentiated barred treatment.
- Perspective features are deterministic, drawn in bounded Canvas operations, and rendered separately for each Cardboard eye. No proprietary Unity textures, models, shaders or other source assets were published. Original document data and user photographs remain untouched.
- These are original replacement designs informed by the verified identities, **not historically verified Seedling scenery**. Real-device performance, visual polish, actual geometry, lighting, animation and Cardboard comfort still require work.


## November 26, 2026: physical-board margin correction and protective scan merge

- Capture review now has a **Playable grid margin** control. Physical boards sometimes have a paper or frame border outside their playable squares; scanning that border as one of the 18 digital columns/rows shifts every proposal. The user can symmetrically crop 0–20% from each edge of the already perspective-aligned photograph, with the overlaid grid, wall strips, hole circles, and colored-marker candidates analyzed and drawn in the corrected coordinate system.
- The source photograph is not mutated or uploaded. Changing margins reuses the expensive original perspective rectification but deliberately clears prior manual tile corrections, because old tile coordinates no longer refer to the same physical locations. The new review must be approved before import. A fresh photograph resets the inset to 0%.
- Import now declines to annotate a newly detected lethal physical hole on top of an existing non-floor native/user tile and reports how many such conflicts were skipped. It retains explicit floor tiles and original unknown metadata. This prevents an overlapping wall, start or other authored object from silently becoming a trap.
- Automated tests cover pixel cropping, source immutability, validation, interface wiring, and conflicting imports. **Limits:** the inset is symmetric, user-chosen, and not the original physical grid calibrator. Unequal margins, independent pitch recovery, touching-block classification, actual Seedling photographs and iPhone camera interaction remain unverified.


## November 26, 2026: independently adjustable playable-grid edges

- The uniform 0–20% playable-grid inset now offers a collapsed **Fine-tune individual edges** section. Top, right, bottom and left can be adjusted separately after correcting the photograph's perspective. This addresses unequal paper borders and off-center placement that a symmetric inset cannot resolve; changing the uniform control restores equal values.
- Per-edge cropping samples only within the bounded playable area, preventing border pixels from being interpolated into the first or last row/column. The original photo is unchanged, and the first perspective rectification is reused. Changing any edge clears wall, hole and marker corrections before a newly aligned review, rather than reassigning old selections to wrong physical squares.
- New synthetic tests exercise nonuniform black borders, input validation, immutability and interface wiring. These are **manual geometric controls**, not automatic grid-pitch inference or validated recognition of physical Seedling kit dimensions. Real-board photographs and physical iPhone operation remain to be tested.


## November 26, 2026: conservative photograph-based border margin suggestions

- After the photographer aligns the board's four corners, **Suggest margins from photograph** can propose individual top/right/bottom/left cropping percentages from the rectified image. It compares robust central color samples with sustained outer bands, accepts green or dark borders, and rejects weak boundaries, paper-grid lines and smooth lighting gradients. It does not presume that the original physical kit uses the digital presets' 18 × 18 pitch.
- Suggestions are optional, never run automatically and cannot import a maze. An explicit click updates manual controls, recalculates the review image and deliberately clears stale wall, hole and marker corrections. No original photograph, native document data or proprietary assets are changed.
- Synthetic tests cover asymmetric dark and green borders, partial borders, printed grid lines, wall clutter, low-evidence rejection, source immutability and control wiring. **Not validated against original Seedling photographs:** visual-border estimates do not establish physical grid pitch, factory-piece lengths, precise wall recognition or marker fidelity. They must be reviewed and corrected by the user.

- If a side lacks a convincing border, its existing hand-calibrated margin is **left unchanged**, not silently reset to zero. A partial suggestion is therefore non-destructive to other individual edge settings.

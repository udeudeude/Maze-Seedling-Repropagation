# Original Android application: archival inspection

## Verified source

- Product: *Maze by Seedling* (Android package `com.seedling.maze`).
- Public download endpoint examined: `https://d.apkpure.com/b/XAPK/com.seedling.maze?version=latest`.
- Download verified by successful GitHub Actions run on 2026-11-22 (Eastern time): [run #1](https://github.com/udeudeude/Maze-Seedling-Repropagation/actions/runs/45102001862).
- Downloaded bytes: **123,053,736**.
- SHA-256: `564117f42b2f6e297ed75ea42b6206a84dce1ca704afed6a0ff751b2e47b6676`.
- Historical version **1.4** is the claimed source version; version metadata has **not yet been independently parsed from the binary Android manifest**.

## Verified package structure

The downloaded file itself is a ZIP-compatible XAPK archive with four entries:

- `com.seedling.maze.apk` (Android application).
- `Android/obb/com.seedling.maze/main.822.com.seedling.maze.obb` (expansion archive).
- One PNG image.
- `manifest.json`.

Static, nonexecuting inventory found:

| Archive | Entries | Uncompressed bytes |
|---|---:|---:|
| Outer XAPK | 4 | 123,053,098 |
| Android APK | 1,354 | 253,172,741 |
| Expansion OBB | 272 | 137,093,792 |
| **Total recorded file entries** | **1,630** | |

Within the APK: **854 PNG**, **21 JPG**, **232 XML**, **24 shared libraries**, and **12 managed DLL** entries, among other types.

## Game-engine findings

The original Android application was built with **Unity**. Confirming evidence includes:

- `assets/bin/Data/globalgamemanagers`, `globalgamemanagers.assets`, `level0`.
- `assets/bin/Data/Managed/Assembly-CSharp.dll` and `Assembly-CSharp-firstpass.dll`.
- `assets/bin/Data/Managed/UnityEngine.dll`, `UnityEngine.UI.dll`, `UnityEngine.Networking.dll`.
- `sharedassets0.assets.split*` asset fragments.

**Implications:** Reconstructing the original behavior may be aided by examining the Unity managed code (without executing it); reconstructing visual identity will require indexing the asset fragments, textures, sounds, and models. Android behavior must not automatically be assumed identical to the iOS edition.

## Research provenance and limits

The GitHub workflow is `.github/workflows/inspect-original.yml`. Its first successful run produced `maze-original-android-inventory`, a text inventory with file names and sizes, available as a run artifact through **2026-11-29 Eastern time**. The workflow does **not** publish the copyrighted application or copied visual assets to the repository.

The above findings are confirmed from **archive metadata only**; no original game assets, code, or behavior have yet been reconstructed or independently verified by running the application.

## Next forensic tasks

1. Parse the outer `manifest.json` and extract version/architecture information from the APK.
2. Index Unity asset types and object names in both APK and OBB, including environment scenes, textures, mesh names, and sounds.
3. Inspect managed type/method names for scanning, board geometry, game modes, and networking.
4. Cross-check findings against surviving iOS screenshots, videos, manuals, and the physical Seedling kit.
5. Implement an original, portable companion, using licensed/independently created assets rather than redistributing proprietary components.

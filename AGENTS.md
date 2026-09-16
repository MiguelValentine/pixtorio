# Pixtorio Project Memory

## Product Goal

Pixtorio is a Windows-first desktop pixel-art and frame-animation editor inspired by Aseprite. The shell is Wails, and the editor surface is rendered with React, TypeScript, Vite and Canvas 2D. The same frontend also runs in a browser for local editing and import/export workflows.

The project has a broad Aseprite-inspired raster, animation, interchange, history, compositing and MCP baseline. Parity work has resumed after the review checkpoint; `PARITY_WORK.md` is authoritative for confirmed remaining differences. The explicit exclusions at the end of this document remain excluded.

## Confirmed Decisions

- Use Wails for the desktop shell and the Go-to-web bridge.
- Keep high-frequency pointer movement, stroke previews, zooming, panning and selection work in the frontend. Do not send every pointer event through Wails.
- Use Go for filesystem access, project persistence, image encoding, autosave, recovery, native dialogs and desktop integration.
- `.pixio` is the only editable project format. The current format is strict `.pixio` v4. Older versions are rejected; there is no migration or compatibility path.
- `.pixio` v4 supports RGBA, grayscale and indexed documents. Cel RGBA pixels are render caches; indexed documents also persist authoritative palette indexes in `.idx` entries.
- v4 supports sparse or missing Cels, integer Cel offsets, partial Cel geometry and linked Cel buffers. Editor-created Cels may start as full-canvas buffers when a tool first needs them.
- Each Cel requires `opacity` (0–1, default 1) and integer `zIndex` (-32768–32767, default 0). These are per-instance properties, never shared link data. Z-index offsets sibling stacking order inside the current group; ties sort by z-index then original order. Background Cels are fixed at opacity 1 and z-index 0. Missing fields are rejected in strict v4.
- Layers support image, group and tilemap kinds; nested parents; standard, background and reference roles; continuous Cels; alpha lock; opacity; and all 19 Aseprite raster blend modes.
- PNG, GIF, sprite sheets, packed atlas metadata, image sequences, GPL and JASC-PAL are interchange or palette formats, never project formats.
- Both the Wails desktop build and the Vite browser build expose project and raster import/export. Browser project saving downloads a `.pixio` file; desktop saving uses native dialogs and atomic replacement.
- Target Windows first and keep platform-specific code isolated. The release artifact is an executable only.
- The approved application icon is the mint pixel P with coral tile from `artifacts/logo-draft/pixtorio-pixel-p.png`; use `frontend/public/appicon.svg` and generate executable assets with `go run ./cmd/iconassets`. Do not reintroduce a topbar logo.

## Core Model

The editor model consists of `Document`, `Layer`, `Frame`, `Cel`, `Palette`, `Tileset`, `TilemapData`, `Slice`, `Guide` and document `Settings` entities. Pixel buffers are authoritative document data; HTML canvases are rendering surfaces. Coordinates are integer document coordinates and display uses nearest-neighbor sampling.

Pixel payloads remain RGBA8. Indexed editing constrains writes to the active palette and keeps the index buffer synchronized with its RGBA render cache. Tilemap cell values and tilesets are authoritative for tilemap layers; rendered RGBA pixels are the tilemap Cel cache. Editing operations use reversible commands. Pixel commands retain bounded before/after dirty-region data; structural changes use document-state commands. The frontend history engine has a configurable 16-2048 MiB limit, defaults to 128 MiB, tracks saved/dirty state and exposes a history list with non-linear state jumps.

## `.pixio v4` Format

The project is a strict ZIP container:

~~~text
project.pixio
|-- manifest.json
|-- thumbnail.png
|-- cels/
|   |-- <cel-id>.png
|   `-- <cel-id>.idx       # indexed documents only
|-- tilesets/
|   `-- <tileset-id>/
|       |-- <tile-id>.png
|       `-- <tile-id>.idx   # indexed documents only
|-- tilemaps/
|   `-- <cel-id>.bin
`-- profiles/
    `-- profile.icc         # when an embedded profile is assigned
~~~

`manifest.json` stores `formatVersion: 4`, canvas dimensions, color mode, palette and transparent index, layers and hierarchy, frames and tags, Cel geometry and links, tilesets and tilemap references, slices, guides, pixel aspect ratio, color profile metadata, settings and active IDs. Go owns decoding, validation, temporary-file writes and atomic replacement. The reader and writer accept v4 only and must not silently repair, migrate, downgrade or open v1-v3 projects.

Color configuration supports RGBA/HSLA editing, embedded profile assignment and persistence, and matrix conversion between the supported sRGB and Display P3 profiles. An arbitrary embedded ICC file can be retained and assigned, but conversion is only offered for profiles with a known conversion matrix.

## Implemented Baseline

- Wails desktop shell, React/Vite browser build, bilingual UI, light/dark themes, recent projects, unsaved-close confirmation, autosave/recovery and file drag/drop import.
- Pixel canvas with integer zoom, pan, transparent checkerboard, custom grid, guides, symmetry axes, tiled preview, nearest-neighbor sampling and dirty-rectangle rendering.
- Pencil, eraser, eyedropper, line, rectangle, ellipse, quadratic curve, polygon, fill, gradient, spray, contour, exact-color replacement and multiline text tools.
- Square, circle, cross, diamond, bitmap, selection-derived and colored pattern brushes with source/canvas/destination alignment, adjustable origin, spacing, pixel-perfect strokes, angle, ink modes, independent pressure/velocity size/opacity/angle/color dynamics, per-channel ranges/thresholds/inversion/response curves, stabilizer support and persistent named presets.
- RGBA, grayscale and indexed editing, alpha-aware RGBA/HSLA color editing, spectrum/wheel/tint-tone-shade color selectors, palette alpha, palette extraction/sorting, GPL/JASC-PAL import/export and indexed conversion dithering.
- Selection rectangle, ellipse, lasso, polygon, magic wand, color and opaque-content selection; add/subtract/intersect operations; reselect, invert, grow, shrink, border, feather, antialiasing, copy/paste/delete, clipping and independent crop.
- Selection and Cel transforms with nearest-neighbor resize, flip and arbitrary-angle rotation. The transform tool has eight edge/corner handles plus scale, perspective and distort modes, numeric controls, rotation handle and draggable pivot.
- Document rotate clockwise/counter-clockwise/180 degrees, horizontal/vertical flip, trim transparent margins, sprite-content resize, canvas resize, anchor controls and pixel-aspect-ratio swap. Sparse, linked, indexed and tilemap Cels are rebuilt consistently by these operations.
- Nested groups and multi-layer selection. Layer create, duplicate, rename, reorder, visibility, lock, opacity, blend mode, role, continuous and alpha-lock changes are undoable. Layer removal is a Delete command, with no delete button.
- Appearance compositing with all 19 blend modes, reference-layer exclusion from exports, background-layer semantics, cached frame composites, dirty-region repair, appearance-preserving merge-down, batch merge and flattening.
- Multi-frame timeline with empty Cels, linked/unlinked Cels, two-dimensional Cel selection, frame duplication/deletion/reordering, reverse selection, durations, tags with forward/reverse/ping-pong playback and repeat counts, loop ranges, FPS playback, configurable multi-frame onion skin and internal or detached animation preview.
- Tilemap authoring with shared tilesets, image-to-tilemap conversion, tile selection, add/delete, pixel and tile-cell editing, flip/rotation flags, linked cache refresh and strict tileset/tilemap validation.
- Text Tool layout with multiline text, built-in and runtime-loaded TTF/OTF/WOFF/WOFF2 fonts, none/slight/full pixel hinting, ligature control, font family/size, line height, bold/italic, alignment, antialias toggle, alpha compositing and selection clipping. External fonts are rasterized at placement and are not project dependencies.
- Effects and adjustments including brightness/contrast, HSL, invert, convolution presets, median/despeckle, curves, HSV/HSL relative or absolute modes, channel masks, outline and shading effects, all with active/selected/all-Cel scope and history commands.
- Strict v4 project load/save, thumbnails, sparse/indexed Cel persistence, tilesets, tilemaps, embedded color profiles, pixel aspect ratio, atomic replacement, cross-tab Cel clipboard operations and native Windows/browser bitmap clipboard interchange.
- PNG import/export, animated GIF export with transparency and loop controls, sprite-sheet layouts and padding, packed atlas export, tag/layer split export, atlas JSON, sprite-sheet import with offsets and padding, image-sequence import/export, and selectable all/selected/loop frame ranges with forward/reverse/ping-pong direction.
- Preferences for theme, language, autosave interval, pixel grid, default pixel-perfect drawing, pressure and brush dynamics, history memory limit, panel dimensions and tool/command shortcuts. Shortcut capture normalizes Ctrl/Meta/Alt/Shift modifiers, removes conflicts and dispatches New/Open/Save/Save As, Undo/Redo, Select All/Deselect, Copy/Cut/Paste and Delete.
- Reversible pixel/document history engine, dirty-state tracking, saved-state tracking, bounded memory eviction, history dialog, non-linear history-state restore, dirty-region repair, 64 MiB per-tab composite LRU caches, retained source image data, offscreen-canvas fallbacks, thumbnail caches and benchmark coverage for measured workloads.
- MCP control for a live desktop instance through `Pixtorio.exe --mcp`, authenticated loopback transport and the official Go MCP SDK. MCP covers metadata, documents, tabs, undo/redo, atomic edit batches, layers, frames, RGBA pixels, indexed indexes, palettes, tilesets, tilemaps, settings, slices, guides, previews and exports.

## Current Parity Status

Parity work has resumed. Recent increments include advanced Edit/Paste Special commands, background clearing, workspace dimension presets, completed default-palette/indexed-color management, transparent-index relocation, multi-point color curves, document-space Outline FX, per-Cel opacity/z-index, pattern brushes with named presets, complete independent brush dynamics, expanded Text options and color-selector variants. Some workflows still need full verification. Complete preferences/workspace commands and full shortcut coverage remain pending. See `PARITY_WORK.md` before planning or claiming completion.

`.pixio v4` remains intentionally breaking and strict. Do not add migrations, backward-compatibility readers or compatibility tests.

## Verification Gates

Before a release, run the consolidated gate once after all changes:

~~~powershell
npm --prefix frontend run check
npm --prefix frontend test
npm --prefix frontend run build
go test ./...
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build
~~~

Verify the resulting `build/bin/Pixtorio.exe`, strict v4 round trips, rejection of v1-v3 projects, RGBA/grayscale/indexed edits, sparse/partial/linked Cels, tilesets and tilemaps, color profiles and pixel aspect ratio, history and non-linear restore, compositing and all blend modes, selection/Cel/document transforms, animation and onion skin, text/effects/dynamics, browser and desktop import/export, sequence workflows, export ranges/directions, preferences, shortcuts, clipboard, recovery and MCP smoke behavior. Also check both themes, both languages and the startup state with no document open.

## Explicit Scope Exclusions

Only these capabilities are explicitly out of scope:

- Automation and CLI interfaces.
- Scripting, plugins and extension APIs.
- Cloud synchronization and cloud-service abstractions.
- Installer creation or installer maintenance.
- `.aseprite` import, export or compatibility.

Do not add compatibility shims, migrations or alternate project readers unless the product decision is explicitly changed.

## Agent Collaboration

When a task contains clear, narrowly scoped, repeatable subtasks that can be completed independently, delegate those subtasks to the `luna_worker` custom agent. Do not delegate work that requires broad architectural judgment or tight coordination with the main task. The main agent remains responsible for planning, integration and final verification.

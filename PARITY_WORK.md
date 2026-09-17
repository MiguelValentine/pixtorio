# Pixtorio Aseprite Parity

This document records the implemented baseline and the remaining in-scope Aseprite differences. It is a review checkpoint, not a parity-complete declaration. The editor model and project format are intentionally breaking: `.pixio` v4 is strict, and older versions are rejected without migration or compatibility paths.

## Data Foundation

- [x] Strict `.pixio` v4 validation and ZIP persistence with atomic replacement.
- [x] RGBA, grayscale and true indexed documents; indexed Cel `.idx` payloads are authoritative and RGBA pixels are render caches.
- [x] Sparse or missing Cels, partial Cel geometry, integer offsets and linked Cel buffers.
- [x] Layer roles, continuous layers, alpha lock, nested groups, image/group/tilemap layer kinds, all 19 Aseprite raster blend modes, frame tags and repeat counts.
- [x] Slices, guides, grid/snap, tiling, symmetry, pixel aspect ratio, color profile metadata and multi-frame onion settings persisted in the manifest.
- [x] Tileset PNG/IDX resources and authoritative tilemap cell binaries persisted and validated in v4.
- [x] Reversible history engine, dirty-state tracking, saved-state tracking, bounded history memory, recovery, thumbnails, compositing caches, application-local Cel clipboard, MCP and export paths updated for v4.

## Drawing, Color And Brush Workflows

- [x] Horizontal/vertical symmetry with adjustable axes and frontend symmetry edits.
- [x] Neighboring-tile preview for X/Y tiling.
- [x] Wrap drawing and editing writes across tiled document boundaries.
- [x] Ink modes, brush angle, spacing, pixel-perfect strokes and pressure mapping.
- [x] Brush dynamics with pressure/velocity sources, threshold, min/max size and opacity, angle dynamics, foreground/background gradient dynamics and stabilizer controls.
- [x] RGBA/HSLA color editing with alpha, palette alpha, palette extraction/sorting, GPL/JASC-PAL import/export and indexed conversion dithering.
- [x] Color configuration with embedded profile assignment and persistence plus supported sRGB/Display P3 conversion.
- [x] Text Tool with live canvas preview, foreground fill, background-color stroke and width, multiline layout, font family/size, line height, bold/italic, alignment, antialiasing, alpha compositing, selection clipping and one-command placement history.
- [x] Effects and adjustments: brightness/contrast, HSL, invert, convolution presets, median, despeckle, curves, HSV/HSL relative and absolute modes, channel masks, outline and shading.
- [x] Tilemap authoring: image-to-tilemap conversion, shared tilesets, tile selection, tile-cell and pixel edits, add/delete, flip/rotation flags, linked cache refresh and validation.

## Layers And Animation

- [x] Background/reference roles, alpha lock, continuous Cels and multi-layer property changes.
- [x] Extended blend modes in compositing, dirty-region repair, cached frame composites and appearance-preserving merge-down operations.
- [x] Empty Cel commands, linked/unlinked Cels, reverse frame selection, timeline duration dragging and two-dimensional Cel selection.
- [x] Multi-frame onion skin with configurable counts, opacity and colors.
- [x] Internal floating animation preview panel and detachable same-origin preview window with popup-policy fallback.
- [x] Batch duplicate/move/merge/flatten operations for arbitrary multi-layer selections and appearance-preserving flattening across all blend modes/groups.
- [x] Frame tags with forward, reverse and ping-pong playback, repeat counts, loop ranges, FPS controls and frame-range selection.

## Selection, Transform And Document Geometry

- [x] Soft selection coverage, feathering and optional antialiasing for selection rasterization and pixel edits.
- [x] Eight corner/edge handles for scale, perspective and distort modes.
- [x] Nearest-neighbor selection/Cel flip, resize and arbitrary-angle rotation, including multi-Cel rotation and integer Cel offsets.
- [x] Interactive rotation handle, draggable transform pivot and numeric position/size/angle/pivot controls.
- [x] Canvas/document rotation clockwise, counter-clockwise and 180 degrees, horizontal/vertical flip and trim transparent margins.
- [x] Canvas resize with anchor controls and sprite-content resize with nearest-neighbor scaling.
- [x] Sparse, linked, indexed and tilemap data rebuilding for document geometry changes.
- [x] Pixel aspect-ratio editing and swap, with persisted document settings.
- [x] Visual slice overlay editing, slice creation from selection, pivots and nine-patch metadata.

## Game Asset And Interchange Workflows

- [x] Sprite-sheet import with Horizontal, Vertical and Matrix layout selection, frame dimensions, offsets and padding; browser and desktop share the same slicing function and preserve frame order, dimensions and import geometry.
- [x] Horizontal, vertical and grid sprite-sheet export with scale and padding.
- [x] Packed atlas export with trimmed frame metadata and optional atlas JSON sidecars.
- [x] Tag/layer split export and browser/desktop atlas metadata.
- [x] PNG import/export, transparent animated GIF export with loop controls, GPL/JASC-PAL palette interchange and native/browser bitmap clipboard interchange.
- [x] Image-sequence import (multi-file PNG), including max-dimension frame placement and desktop native selection dialogs.
- [x] PNG sequence export with numbered filenames and forward, reverse and ping-pong direction.
- [x] Export range and direction controls for GIF and sprite-sheet output: all frames, selected frames or loop range, with forward, reverse and ping-pong direction.

## Workspace, History And Preferences

- [x] Browser `.pixio`/PNG import and downloaded `.pixio`, PNG, GIF, sprite-sheet and sequence exports.
- [x] Desktop native dialogs, atomic project writes, recent projects, drag/drop import, autosave/recovery and unsaved-close confirmation.
- [x] Light/dark themes and English/Chinese UI coverage for the editor surface and workflows.
- [x] Per-tab cached composites, retained canvas buffers, offscreen-canvas fallback, thumbnail caches and measured performance benchmarks.
- [x] History UI with current/saved state markers and non-linear jump-to-history-state restore.
- [x] Configurable history memory limit with bounded eviction and dirty/saved state tracking.
- [x] Preferences for theme, language, autosave interval, pixel grid, default pixel-perfect drawing, pressure, brush dynamics, history memory limit and resizable inspector/timeline panels.
- [x] Conflict-aware tool and command shortcut editor with reset support, Ctrl/Meta normalization, modifier-key dispatch and editable-target protection.
- [x] New/Open/Save/Save As, Undo/Redo, Select All/Deselect, Copy/Cut/Paste and Delete command shortcuts, including layer/frame/Cel/selection delete scope.
- [x] Draggable grid-origin and guide controls alongside numeric fields.
- [x] Native Windows and browser bitmap clipboard interchange. Cel clipboard remains application-local across open documents.

## MCP Surface

- [x] Authenticated loopback MCP transport for a live desktop instance.
- [x] Document metadata, creation/open/save/close, open tabs, atomic edit batches, undo/redo, layers, frames, RGBA pixels, indexed indexes, palettes, tilesets, tilemaps, settings, slices, guides, previews and PNG/GIF/sprite-sheet exports.
- [x] MCP operations are undoable where they mutate the editor document and share the UI history/compositing model.

## Parity Status

Parity work has resumed. The existing checked inventory remains implemented; remaining differences below are not yet a parity-complete declaration. The current checkpoint also contains:

- [x] Independent Move Tool with active-Cel dragging, Ctrl/Cmd topmost-Cel auto-selection, optional persistent auto-select, Shift axis locking, multi-Cel movement and one history command per gesture.
- [x] Background-layer invariants: one background layer, root-bottom placement, fixed normal blend/100% opacity/alpha lock, protected movement/merge behavior and ordinary-role duplicates.
- [x] Zoom supports cursor-anchored left-click zoom in and right-click zoom out; Polyline and Curve use staged point workflows with live previews and Enter/double-click/right-click completion; Blur and Jumble use bounded edits; Slice supports visual creation, direct movement and eight-handle resizing. These workflows share selection clipping, history, theme and bilingual editor behavior.

## Pending Aseprite Differences

The following inventory tracks completed increments and remaining differences:

- [x] Edit operations: Copy Merged, Fill Selection, Stroke Selection, selection-bounded wrapped Shift Pixels, Paste Special (new sprite/new layer/reference layer), and copy/cut selection to a new layer, with sparse/indexed Cel handling and history integration.
- [x] Complete background clearing semantics: erasing, deleting, cutting, moving or transforming background-layer pixels writes the configured opaque background color in canvas, Cel and clipboard command paths, including linked and indexed Cels.
- [x] Per-Cel opacity and z-index: timeline properties dialog with batch/mixed-value editing, independent linked-Cel properties, strict required `.pixio v4` fields, history, clipboard/duplication, frame/region/export/onion compositing, Go thumbnail composition and MCP metadata/edit operations. Opacity multiplies layer/group opacity. Z-index offsets sibling stacking order within the layer group; ties use z-index then original order, and background remains bottommost. Browser apply/reopen/undo and light-Chinese/dark-English control styles are verified; frontend and Go model/serialization/compositing/MCP tests pass. Final desktop live-MCP/release audit remains below.
- [x] Pattern brushes with source/canvas/destination alignment modes, adjustable pattern origin and persistent named brush presets. A selection can be captured as an RGBA texture plus bitmap footprint; transparent texels are no-ops, texture alpha composes with brush dynamics, tiled writes retain phase, indexed/grayscale documents constrain sampled colors, and drawing remains selection-clipped, undoable and index-synchronized. Presets persist the complete brush/pattern/dynamics configuration in strict versioned local storage with save, update, apply and delete workflows.
- [x] Full brush dynamics UI and model: size, opacity, angle and foreground/background color are independent channels with individual enable state, Pressure/Velocity source, minimum/maximum range, threshold, inversion and linear/ease-in/ease-out/S-curve response. Size and angle are grouped as shape dynamics; opacity and color are grouped as paint dynamics. Disabled channels fall back to ordinary brush values, channel settings participate in live strokes and strict v2 named brush presets, and the dynamics resolver/preset storage have focused regression coverage.
- [x] Full Text Tool options: runtime loading for TTF/OTF/WOFF/WOFF2 files, none/slight/full pixel-hinting modes and an explicit ligature toggle. Loaded fonts participate in live preview and are rasterized into ordinary pixels on placement, so project files do not acquire an external font dependency. Ligature-disabled runs are measured and rendered per character; hinting selects unrestricted, half-pixel or integer placement. Fill/stroke alpha, selection clipping and one-command history remain shared with built-in fonts.
- [x] Outline FX exposes inside/outside placement, thickness, square/diamond/circle shapes, eight directions, channel masks, X/Y tiled sampling, active/selected/all editable-Cel scope and isolated before/after preview. Partial Cels expand in document coordinates, retain off-canvas pixels and linked relative offsets, and reject oversized batches before mutation. Feathered edges use premultiplied color interpolation without dark fringes. Kernel, document-space boundaries, selection clipping, linked indexed v4 round trips and undo/redo are tested; browser preview/apply/undo is verified. Desktop release validation remains part of the final gate below.
- [x] Color Curves with independent editable multi-control-point R/G/B/A curves, piecewise-linear LUT interpolation, pointer/keyboard/numeric editing, protected endpoints, interior-point removal and per-channel reset. Applies through existing Cel scope, channel masks, selection clipping and document history; browser point insertion, keyboard adjustment and independent channel retention verified.
- [x] Indexed-color workflow: the color panel offers transparent-slot relocation with appearance-preserving index remapping; the palette menu saves, applies and resets local default palettes with alpha and transparent index, and new documents inherit them. Applying a default palette is one reversible document command. Invalid local data falls back to the built-in palette without repairing project data. Linked-buffer/v4 round trips, shorter-palette remapping, shared indexed tilesets, linked and independent tilemap caches, transparent-index relocation and history restoration are tested. Browser and desktop use the same palette-management UI and storage workflow.
- [x] Aseprite-style color selector choices and controls: a saturation/value spectrum, hue/saturation wheel with value strip, and tint/tone/shade variants. Pointer dragging and keyboard adjustment update the selected foreground or background target without changing its independent Alpha value; the collapsible bilingual panel shares both editor themes.
- [x] Broader Sprite/Edit/Layer/Cel command coverage. Sprite duplication, cross-document frame/layer copy, full-frame and empty-frame semantics, continuous/linked Cel workflows, normal and explicit linked Cel duplication, Tilemap Cel clipboard/delete, timeline drag move/copy/append, per-layer/per-Cel properties, opaque-content selection and multi-slice transforms are user-visible, reversible and tested across sparse, indexed, linked and tilemap data. The command registry covers the complete Pixtorio user-facing command surface; native Aseprite docking and scripting remain outside this product scope.
- [x] Complete Preferences coverage. The strict versioned preference model and grouped bilingual UI cover general, file/recovery, color defaults, alerts, editor, selection, timeline, cursor, background, grid, guides/slices, undo and drawing categories. Runtime wiring applies UI scale, hover menu switching, palette separators, autosave enable/interval, recent-project limits, unsaved/delete/conversion alerts, new-document color/profile/grid/background defaults, wheel/center zoom, fit-on-open, Shift-line preview, eyedropper brush reset, selection retention/edges/transform scope, frame numbering/rewind/selection retention, checker/grid/guide colors, cursor preview, history memory/focus/non-linear jumps/tooltips and drawing defaults. Timeline auto-show, selection-derived/paste-special defaults and Alpha percent/byte display are covered by strict storage/default mapping tests. Browser verification confirmed all 13 preference groups, both light/dark themes and Chinese/English UI states.
- [x] Workspace commands: named inspector/timeline dimension presets have save, update, apply, delete and reset controls with local persistence. The View menu provides persisted inspector/timeline visibility, pixel-grid and onion-skin toggles, canvas-only mode with Tab/Escape exit, Show All Panels recovery, Wails/browser full-screen control, detached animation preview access and a full workspace reset. Browser verification covered save/reset/apply/delete, display state restoration after reload, Chinese/English labels and light/dark themes.
- [x] Complete command shortcut coverage. The editor now registers all 149 user-facing command IDs, including Duplicate Sprite, Copy Selected Frames to Open Document and Copy Selected Layers to Open Document, with unique normalized defaults, bilingual labels, editable/resettable persisted assignments, conflict removal, platform-aware display and editable-target protection. Every registry ID has a dispatch case guarded by an exhaustive TypeScript switch; top-level File/Edit/Sprite/View menu actions use the same dispatcher and display the current assignment, while parameterized dialogs remain opened by their command and retain their own form controls. `commandShortcutCoverage.test.ts` mechanically verifies registry/default/English-Chinese label/dispatch/preference-editor/menu coverage, and `shortcuts.test.ts` verifies normalization, uniqueness, platform formatting, conflict handling and representative dispatch lookup.
- [x] Final official-document audit and cross-surface verification. Animation, timeline, slice, tilemap, import/export and color-management differences identified during the official Aseprite-document review were implemented and regression-tested: full/empty/background frames, linked and Tilemap Cel workflows, tag focus, multi-slice canvas operations, strict SliceKey handling, Tilemap Auto cleanup, Horizontal/Vertical/Matrix sprite-sheet input, pixel-ratio export, cross-platform PNG limits and atlas metadata. Pixtorio deliberately writes documented `pixtorio-atlas-v1` sidecars rather than claiming byte-compatible Aseprite JSON. Browser verification covered Chinese/English and light/dark UI, View/Preferences persistence and canvas-only behavior. The latest Apple Silicon Wails build launched successfully, passed code-sign verification and the live MCP smoke test; frontend, Go, strict-v4 serialization/compositing/history and export regression suites pass.

No pending item should be marked complete until its user-facing workflow, reversible history, document serialization where applicable, compositor/export behavior and tests agree.

## Explicitly Excluded

These are product decisions, not pending parity work:

- Automation and CLI interfaces.
- Scripting, plugins and extension APIs.
- Cloud synchronization and cloud-service abstractions.
- Installer creation or installer maintenance.
- `.aseprite` import, export or compatibility.

No compatibility shim, migration path or legacy `.pixio` reader should be added without an explicit product decision change.

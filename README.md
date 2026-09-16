# Pixtorio

Pixtorio is a Windows-first Go pixel-art and frame-animation editor with a Wails desktop shell and a React, TypeScript and Vite frontend. The same frontend can run in a browser for local editing and browser downloads. It has a broad Aseprite-inspired raster and animation baseline; remaining parity work is tracked in `PARITY_WORK.md`.

## Prerequisites

- Go 1.27 or newer
- Node.js 24 or newer
- WebView2 Runtime for the Windows desktop build

## Development

Install the Wails CLI and frontend dependencies:

~~~powershell
go install github.com/wailsapp/wails/v2/cmd/wails@v2.15.0
Set-Location frontend
npm install
Set-Location ..
~~~

Run the desktop application with live reload:

~~~powershell
wails dev
~~~

Run the browser frontend:

~~~powershell
npm --prefix frontend run dev -- --host 127.0.0.1
~~~

Browser mode supports local `.pixio`, PNG, palette, sprite-sheet and image-sequence import plus downloaded `.pixio`, PNG, GIF, sprite-sheet and image-sequence exports. Desktop-only recent-project paths, native dialogs, atomic file replacement and the live MCP bridge require the Wails application.

Run the consolidated checks and create a production build:

~~~powershell
go test ./...
npm --prefix frontend run check
npm --prefix frontend test
npm --prefix frontend run build
wails build
~~~

The Windows executable is written to `build/bin/Pixtorio.exe`. An installer is intentionally not produced.

## `.pixio v4`

`.pixio` is Pixtorio's only editable project format. The reader accepts strict format v4 only; v1-v3 files are rejected and there is no migration path or compatibility reader. The ZIP container stores a validated manifest, thumbnail, RGBA Cel PNGs, indexed Cel `.idx` payloads, tileset PNG/IDX resources, authoritative tilemap cell binaries and an optional embedded ICC profile.

The manifest persists canvas dimensions, color mode, palette and transparent index, layer hierarchy and roles, all 19 blend modes, frames and tags, sparse/partial/linked Cel geometry, tilesets/tilemaps, slices, guides, pixel aspect ratio, color profile metadata and editor settings. RGBA, grayscale and indexed editing are supported; indexed documents keep palette indexes authoritative and use RGBA pixels as render caches. Palette alpha, GPL/JASC-PAL interchange and indexed conversion dithering are supported.

Color management supports embedded profile assignment/persistence and known sRGB/Display P3 conversion. Arbitrary ICC data can be retained and assigned, but conversion is only offered for profiles with a known conversion matrix.

## Current Features

Workspace layout presets are available under Preferences → Workspace layouts. Set the inspector width and timeline height, enter a name, and save the current layout. Select a saved layout to apply or update it; Reset layout restores the default 228px inspector and 254px timeline. Presets stay in local application/browser storage and do not alter project files or document history.

The palette menu can save the current palette as the local default for new documents, apply that default to the current document, or restore the built-in default. Alpha values and the transparent index are retained. Applying a palette is undoable and remaps indexed artwork to the new colors. In indexed documents, the Transparent index selector relocates the transparent slot and remaps palette indexes together to preserve the artwork's appearance.

The collapsible Color selector offers a saturation/value spectrum, a hue/saturation wheel with a value strip, and tint/tone/shade variants. Pointer dragging and arrow-key adjustment edit the active foreground or background target while retaining that target's Alpha value.

Image → Adjustments and effects → Curves offers independent R/G/B/A control-point curves. Click the graph to add a point, drag to adjust, or use the input/output fields. Arrow keys move the selected point by one (Shift by ten); Delete removes interior points. Changes remain in the dialog until Apply, which uses the selected Cel range and creates one undo step.

The Outline effect opens a settings dialog with inside/outside placement, thickness, square/diamond/circle shape, eight direction toggles, horizontal/vertical tiling, channel masks and Cel scope. Generate preview compares the active Cel before and after without editing the document; changing settings clears that preview. Apply processes the chosen editable image Cels once per linked buffer and records one undo step. Background-layer alpha remains protected.

Outline sampling and selections use document coordinates, including tiling across canvas edges. Partial Cels expand only where new outline pixels require it; existing off-canvas pixels and linked-Cel relative positions are retained. A batch is calculated before committing, so an expansion beyond the 2048-pixel Cel limit rejects the batch without partial edits.

Feathered outline edges interpolate color using premultiplied alpha, so hidden RGB in transparent pixels does not create dark or colored fringes. Disabled channels retain their original values.

The timeline's **Cel properties** button edits the active Cel or the selected Cels in one undo step. Opacity is 0–100%; Z-index is an integer from -32768 to 32767 that shifts the Cel above or below sibling layers for that frame, inside its current group. A blank field preserves each selected Cel's value. Linked Cels share pixels but retain independent opacity and stacking properties. Copying Cels and duplicating frames retain both properties; merge and background conversion bake opacity once. Background Cel properties are fixed at 100% and zero stacking offset.

Every Cel in the strict v4 project manifest and JSON bridge now requires `opacity` (0–1) and `zIndex`. Files missing these fields are rejected; no fallback or migration is provided.

Brush settings can capture the current selection as a colored RGBA pattern and align it to each source stamp, the document canvas or the stroke destination. Pattern X/Y origin is adjustable, transparent pattern texels leave existing pixels untouched, and tiled drawing retains texture phase across document edges. Named brush presets save, update, apply and delete the full shape, bitmap, pattern, alignment, origin, spacing, angle, ink, dynamics and stabilizer configuration in local application/browser storage.

Brush Dynamics separates size, opacity, angle and foreground/background color into independent channels. Each channel can use Pressure or Velocity, its own minimum/maximum range and threshold, inversion, and a linear, ease-in, ease-out or S-curve response. Shape and paint groups can be collapsed independently, and named brush presets persist the complete channel configuration in strict preset format v2.

The Text Tool can load TTF, OTF, WOFF and WOFF2 files for the current application session. None, slight and full hinting align text at subpixel, half-pixel or whole-pixel positions; ligatures can be enabled or disabled independently. Imported fonts are used by the live preview and rasterized on placement, so saved `.pixio` projects contain only the resulting pixels and never depend on an external font file.

- Pixel canvas with integer zoom, pan, transparent checkerboard, custom grid, guides, symmetry axes, tiled preview, nearest-neighbor sampling and cached dirty-region rendering.
- Pencil, eraser, eyedropper, zoom, hand, move, line, rectangle, ellipse, staged quadratic curve and polyline, polygon, fill, gradient, spray, blur, jumble, contour, exact-color replacement, slice and multiline text tools.
- Square, circle, cross, diamond, bitmap, selection-derived and colored pattern brushes with spacing, pixel-perfect drawing, brush angle, ink modes, independent pressure/velocity size/opacity/angle/color dynamics, response curves, stabilizer controls and persistent named presets.
- Rectangle, ellipse, lasso, polygon, magic-wand, color and opaque-content selections with soft coverage, feathering, optional antialiasing, boolean operations, reselect, invert, grow, shrink, border, copy, paste, delete, transforms and independent crop.
- Eight-handle selection/Cel transform editing with scale, perspective and distort modes, nearest-neighbor arbitrary-angle rotation, interactive rotation handle, draggable pivot and numeric transform controls.
- Canvas/document rotate and flip, trim transparent margins, canvas resize with anchors, sprite-content resize and pixel-aspect-ratio editing, including sparse/indexed/linked/tilemap data rebuilding.
- Nested groups, multi-layer selection and batch commands, visibility, lock, opacity, all 19 Aseprite raster blend modes, background/reference roles, continuous Cels, alpha lock, appearance-preserving merge/flatten and Delete-key layer removal.
- Multi-frame timeline with empty and linked Cels, cross-document Cel copy/paste, frame tags, reverse/ping-pong playback, repeat counts, duration editing, loop ranges, FPS controls, onion skin and internal or detached animation preview.
- Tilemap authoring with shared tilesets, image conversion, tile selection, add/delete, tile-cell and pixel editing, flip/rotation flags and cache synchronization.
- Text layout with live canvas preview, built-in or runtime-loaded fonts, hinting and ligature controls, foreground fill, background-color stroke/width, font family/size, line height, bold/italic, alignment, antialiasing, alpha compositing and selection clipping.
- Effects and adjustments including brightness/contrast, HSL, invert, convolution, median/despeckle, curves, HSV/HSL relative or absolute modes, channel masks, outline and shading, with active/selected/all-Cel scope.
- PNG import/export, transparent animated GIF export with loop controls, sprite-sheet layouts/padding, packed atlas export, tag/layer split export, atlas JSON, sprite-sheet import with offsets/padding, image-sequence import/export and selectable frame range/direction.
- Local light/dark themes, English/Chinese UI, spectrum/wheel/tint-tone-shade color selectors, autosave/recovery, recent projects, unsaved-close confirmation, drag/drop import, implemented preference controls, history memory controls, resizable inspector/timeline panels and conflict-aware tool/command shortcut editing.
- Reversible history with bounded dirty-region pixel commands, structural document commands, saved-state tracking, non-linear history-state restore, per-tab composite/thumbnail caches and performance benchmarks.
- Native Windows and browser bitmap clipboard interchange, plus an application-local Cel clipboard shared by open documents.

## Parity Status

Parity work is active. Move/background semantics, advanced edit commands, per-Cel appearance, document-space effects, curves, pattern-brush presets, expanded text options and color-selector variants are implemented; the confirmed remaining differences are recorded in `PARITY_WORK.md`. Complete command, preference and workspace parity is not yet claimed.

## MCP Integration

Keep the desktop application open and configure an MCP client to launch `Pixtorio.exe --mcp` over stdio. Tools operate on the live editor workspace, share UI undo/redo and use Go for v4 project persistence and exports. The protocol covers document metadata, open tabs, document creation/open/save/close, atomic undoable edits, layers, frames, RGBA pixels, indexed indexes, palettes, tilesets, tilemaps, settings, slices, guides, previews and PNG/GIF/sprite-sheet export.

See `MCP.md` for configuration, limits and local security. MCP is a live desktop integration, not a scripting engine, arbitrary code runner or browser-only backend.

## Windows Release

Build the executable with:

~~~powershell
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build
~~~

The release is executable-only. Pixtorio intentionally does not ship automation or CLI interfaces, scripting/plugins/extensions, cloud synchronization, an installer or `.aseprite` compatibility. The live MCP bridge is a desktop integration surface, not a general scripting API.

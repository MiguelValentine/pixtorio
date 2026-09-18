# Windows Release

## Build

Run the consolidated release checks from the project root after all implementation work is complete:

~~~powershell
npm --prefix frontend run check
npm --prefix frontend test
npm --prefix frontend run build
go test ./...
go run github.com/wailsapp/wails/v2/cmd/wails@v2.15.0 build
~~~

The Windows executable is written to `build/bin/Pixtorio.exe`. The release contains the executable only; no installer is built or maintained.

## Release Checks

- Verify `Pixtorio.exe` starts on Windows with WebView2 available and opens with no document until New or Open is chosen.
- Verify a new document defaults to 64x64 and rejects dimensions above 2048x2048.
- Verify a strict v4 `.pixio` project opens, saves and round-trips canvas settings, pixel aspect ratio, RGBA/grayscale/indexed data, palette indexes/alpha, sparse/partial/linked Cels, nested groups, roles, all blend modes, frame tags, tilesets, tilemaps, slices, guides, color-profile metadata and editor settings.
- Verify v1, v2 and v3 projects are rejected with an unsupported-format error. Do not add migration fixtures or compatibility code.
- Verify tiled drawing, soft selections, text placement, brush dynamics, effects/adjustments, outline/shading, pivot/rotation transforms, document rotate/flip/trim, sprite resize, all 19 blend modes, batch layer merge/flatten, undo/redo, history-state jumps, dirty-state tracking, frame editing, linked Cels, tags, loop ranges, FPS playback and onion skin.
- Verify tilemap conversion, tileset editing, tile-cell/pixel editing, flip/rotation flags and tilemap cache regeneration.
- Verify PNG import/export, image-sequence import/export, transparent animated GIF export, regular and packed sprite-sheet export, frame range/direction controls, atlas JSON, tag/layer split export, palette import/export and sprite-sheet import.
- Verify RGBA/HSLA color editing, embedded profile assignment, known sRGB/Display P3 conversion and pixel aspect-ratio persistence.
- Verify both dark and light themes, English and Chinese labels, browser import/export downloads and desktop native dialogs.
- Verify file drag/drop, all preferences, autosave/recovery, history memory limits, unsaved-close confirmation, detached preview, panel resizing, tool/command shortcut editing and modifier-key dispatch.
- Verify cross-tab Cel clipboard, native bitmap clipboard, startup/no-document state and browser sequence downloads.
- Verify the MCP smoke test against a running desktop instance. It creates temporary documents and files, then closes those documents.

~~~powershell
$env:PIXTORIO_MCP_EXE = (Resolve-Path build/bin/Pixtorio.exe).Path
go test . -run '^TestMCPDesktopSmoke$' -count=1 -v
Remove-Item Env:PIXTORIO_MCP_EXE
~~~

Start the executable normally before running the smoke test. MCP client setup and tool contracts are documented in `MCP.md`.

## Parity Release Gate

The project is currently at a parity review checkpoint, not a parity-complete release. Do not publish a release as Aseprite-parity-complete until the feature inventory and verification requirements in `AGENTS.md` have implementation and verification evidence across their document model, history, compositing, serialization, export, UI and MCP surfaces as applicable.

## Format And Scope

Pixtorio projects are local strict `.pixio v4` files. Older versions are intentionally rejected. Releases do not include automation or CLI interfaces, scripting/plugins/extensions, cloud synchronization, an installer or `.aseprite` compatibility. These are explicit product exclusions, not pending parity work. The live MCP bridge is a desktop integration surface, not a general scripting API.

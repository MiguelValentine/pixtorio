# Pixtorio MCP

Pixtorio exposes its live desktop workspace through the Model Context Protocol.
Start the desktop application normally, then let an MCP client launch a second
process with `Pixtorio.exe --mcp`. That process speaks MCP over stdin/stdout;
it does not open another editor window. Go, Node.js and a development server
are not required on the target machine. The desktop still requires WebView2.

Terrain definition IDs are `1..65534`. TerrainMap cells use `0` for unspecified, `65535` for explicit empty, and `1..65534` for a Terrain definition. Reads and writes preserve all three states.

Orthogonal `blob8` uses the 47 canonical Blob masks. Bits run clockwise from N: N, NE, E, SE, S, SW, W, NW. A diagonal bit is valid only when both adjoining cardinal bits are set. Rules with unsupported corners are rejected, not normalized on import; neighbor sampling removes unsupported corners before rule resolution. `edge4` and `edge6` retain their 16 and 64 masks.

## Client Configuration

For clients using the common `mcpServers` JSON format:

```json
{
  "mcpServers": {
    "pixtorio": {
      "command": "C:\\Users\\Cao\\GolandProjects\\pixtorio\\build\\bin\\Pixtorio.exe",
      "args": ["--mcp"]
    }
  }
}
```

Change `command` to the executable's absolute location on your computer.
The configuration format may differ by client, but the transport is always
stdio and the argument is `--mcp`. Keep the desktop application open while
using tools. With multiple desktop instances, clients connect to the most
recently started instance. A browser-only Vite session is not an MCP target.

## Tools

All tool names have the `pixtorio_` prefix. `documentId` is an open tab's ID,
not its filename. Obtain document, layer and frame IDs from the metadata tools.

| Tool | Purpose |
| --- | --- |
| `list_documents` | List open tabs, active tab, dimensions, layers, frames, palette and dirty/history state. |
| `get_document` | Read one document's metadata without its pixel buffers. |
| `create_document` | Create and activate a new unsaved document; defaults to 64x64 RGBA, maximum 2048x2048. |
| `activate_document` | Switch the visible tab. |
| `close_document` | Close a tab; unsaved changes require explicit `discardChanges: true`. |
| `edit_document` | Apply a validated batch of edits as one undoable operation. |
| `read_pixels` | Read a rectangular region as row-major RGBA HEX colors; composited by default or from a specified layer. |
| `read_indexes` | Read row-major palette indexes from a specified Cel in an indexed document. |
| `read_tileset` | Read tileset metadata and authoritative row-major tile colors/indexes. |
| `read_tilemap` | Read a tilemap Cel's row-major tile values, including flip flags, sparse Cel geometry and an optional per-map hex `gridOffset`. |
| `get_preview` | Return the specified or active composited frame as a transparent PNG MCP image. |
| `undo`, `redo` | Use the same history as the editor UI, for the specified tab. |
| `open_project` | Open a local strict `.pixio` v5 file in a tab. Older versions are rejected. |
| `save_project` | Save an open tab to an absolute `.pixio` path. |
| `export_image` | Export active-frame PNG, all-frame animated GIF, or a PNG sprite sheet. |

`save_project` and `export_image` require an explicit absolute local path.
Existing files require `overwrite: true`. They do not open native dialogs.
Parent directories must already exist. Export scale is 1-8; sprite-sheet
columns are optional. Sprite-sheet frame rectangles are returned in the tool
result, without creating a sidecar. Export does not mark a project saved.
GIF uses the existing exporter: full transparency is supported, but GIF cannot
preserve continuous partial alpha. PNG and `.pixio` preserve RGBA.

## Editing

`edit_document` takes `documentId` and `operations`. Supported operation types:

- `set_pixels`: optional `layerId`/`frameId`, plus `pixels` of `{x,y,color}`. A missing image Cel is created lazily; writes obey locking and alpha-lock rules.
- `set_indexes`: indexed-only equivalent with `{x,y,index}`; palette indexes are authoritative and the RGBA render cache is updated.
- `add_tileset`: create an empty tileset with a stable optional `tilesetId`, `name`, `tileWidth`, and `tileHeight`.
- `update_tileset` / `delete_tileset`: rename a tileset or delete an unused tileset.
- `add_tile`: add a row-major tile to a tileset using `pixels` as RGBA HEX values; optional `indexes` and explicit `tileId` are supported.
- `update_tile` / `delete_tile`: replace a tile payload or delete it. Deletion clears references in every tilemap Cel using that tileset.
- `set_tile_cells`: set row-major tile values in a tilemap Cel. Values include the tile ID and optional X/Y/diagonal flip flags. If the target Cel is Terrain-managed, an actual change is rejected unless `detachTerrain: true` is supplied; that option detaches Terrain authority from the complete linked Cel group before writing. A no-op write never detaches Terrain.
- `read_tilemap` and document Cel metadata return `gridOffset` only when a hex map overrides its shared Tileset parity layout. Omission inherits the Tileset offset; linked Cels always share the same override.
- `add_layer`: `name`, optional `parentId`, `kind` (`image`, `group`, or `tilemap`), and `tilesetId` for tilemap layers. Cel-layer properties include `role` (`standard`, `background`, `reference`), `continuous`, `alphaLock`, `opacity`, and any of the 19 blend modes.
- `update_layer`: `layerId`, optional `name`, `visible`, `locked`, `opacity` (0-1), `blendMode`, `role`, `continuous`, and `alphaLock`.
- `delete_layer`: `layerId`.
- `add_frame`: optional `duplicateFromId` and `durationMs`.
- `delete_frame`: `frameId`.
- `set_frame_duration`: `frameId`, `durationMs` (integer milliseconds).
- `set_palette`: `colors`, up to 256 RGBA HEX entries.
- `set_palette` also accepts `name` and `transparentIndex`.
- `rename_document`: `name`.
- `resize_canvas`: `width`, `height`, `anchorX`, `anchorY` (each anchor is 0, 0.5 or 1).
- `update_settings`: bounded grid, offset, snap, tile, symmetry, and onion-skin settings, including previous/next frame counts, opacity, and colors.
- `add_tag` / `update_tag` / `delete_tag`: frame ranges, direction (`forward`, `reverse`, `pingpong`), color, and repeat count.
- `reverse_frames`: reorder a selected frame set.
- `link_cels` / `unlink_cels`: share or detach Cel pixel and indexed buffers for selected frames.
- `set_cel_properties`: required `layerId` and `frameId`, plus at least one of `opacity` (finite number 0–1) or `zIndex` (integer -32768–32767). Applies through the same undoable document batch as UI properties. Metadata includes both values. Linked Cels retain independent values; locked, reference and background Cels are not editable through this operation. Positive z-index raises a Cel within its layer group; negative values lower it.
- `add_slice` / `update_slice` / `delete_slice`: sprite-export rectangles with per-frame keys, nine-slice center, and pivot metadata.
- `add_guide` / `update_guide` / `delete_guide`: horizontal or vertical canvas guides.

Example arguments to `pixtorio_edit_document`:

```json
{
  "documentId": "ID_FROM_LIST_DOCUMENTS",
  "operations": [
    {
      "type": "set_pixels",
      "pixels": [
        {"x": 0, "y": 0, "color": "#ff0000ff"},
        {"x": 1, "y": 0, "color": "#ff000080"}
      ]
    }
  ]
}
```

Coordinates are zero-based integer document coordinates, including for offset
Cels. Colors are `#RRGGBB` or `#RRGGBBAA`, where Alpha is a byte, not a percentage.
Pixel writes replace RGBA rather than compositing a brush stroke. They obey
document color mode, layer locking, reference-layer protection, and alpha lock.
MCP pixel edits target explicit pixels, not the UI selection mask. A successful
edit clears stale UI selections on its target tab. Linked Cels retain the
editor's shared-buffer semantics, including indexed palette indexes.

`get_document` and `list_documents` expose the v5 metadata model without raw
pixel payloads: color profile type/name and embedded profile byte count, pixel
aspect ratio, tileset dimensions/counts, layer roles and flags including
tilemap `tilesetId`, sparse Cel geometry/link IDs, tilemap dimensions and
whether an index buffer exists, frame-tag repeat counts, Slices and keys,
Guides, the palette transparent index, and grid/tiling/symmetry/onion-skin
settings. Use `read_tileset` and `read_tilemap` for authoritative tile data.

An invalid batch changes nothing. A successful batch is one undo step.
Use returned IDs before submitting dependent operations, such as drawing onto
a newly created layer. Limits: 256 operations and 65,536 pixel entries per
batch; 16,384 pixels per read. MCP transfers are capped at 96 MiB serialized
project JSON or 64 MiB unencoded composite frames. Larger projects can still
use the application's normal file menu.

## Local Connection And Safety

The desktop starts an authenticated HTTP bridge on an OS-assigned loopback
port. Connection details and a fresh random token are stored under
`%APPDATA%\Pixtorio\mcp-connection.json`, and removed on normal shutdown if
they still belong to that instance. Do not share that file or its token.
The bridge rejects browser origins and invalid Host/Authorization headers;
the stdio process does not use network proxies or follow redirects. This is
local process integration, not a remotely accessible MCP endpoint or cloud
service. Applications running as the same OS user can access the connection
file, so configure only trusted MCP clients.

MCP requests are serialized. The editor rejects conflicting operations during
pointer gestures, pending multi-point drawings, playback, text input, dialogs,
or UI saves. Finish the interaction and retry. Saving records the captured
history state, so edits made during disk I/O remain dirty. Requests time out
after 30 seconds. Queued cancelled commands cannot begin editing; if a command
already started, cancellation cannot roll back completed edits or file writes.
Inspect state before retrying a timed-out mutation.

The protocol implementation uses the official Go MCP SDK. No scripts, arbitrary
code evaluation, shell execution, cloud sync, `.aseprite` compatibility, or
installer are introduced by this interface. The protocol targets `.pixio` v5
only; it intentionally has no compatibility or migration path for older
project versions.

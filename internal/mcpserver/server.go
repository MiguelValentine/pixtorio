// Package mcpserver exposes Pixtorio's desktop dispatcher through MCP.
package mcpserver

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"path/filepath"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	guideURI = "pixtorio://guide"

	maxCanvasDimension = 2048
	maxOperations      = 256
	maxReadPixels      = 16384
	maxSetPixels       = 65536
	maxExportScale     = 8
)

// New creates an MCP server whose tools forward to dispatch. The command
// passed to dispatch is the tool name without the "pixtorio_" prefix.
func New(dispatch func(context.Context, string, json.RawMessage) (json.RawMessage, error)) *mcp.Server {
	if dispatch == nil {
		dispatch = func(context.Context, string, json.RawMessage) (json.RawMessage, error) {
			return nil, fmt.Errorf("Pixtorio dispatcher is unavailable")
		}
	}

	server := mcp.NewServer(
		&mcp.Implementation{Name: "pixtorio", Title: "Pixtorio", Version: "v5.0.0"},
		&mcp.ServerOptions{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))},
	)

	for _, spec := range toolSpecs() {
		addTool(server, spec, dispatch)
	}
	server.AddResource(&mcp.Resource{
		URI:         guideURI,
		Name:        "guide",
		Title:       "Pixtorio MCP guide",
		Description: "Compact usage notes for the Pixtorio MCP tools.",
		MIMEType:    "text/plain",
	}, func(_ context.Context, _ *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
		return &mcp.ReadResourceResult{Contents: []*mcp.ResourceContents{{
			URI:      guideURI,
			MIMEType: "text/plain",
			Text: "Keep the Pixtorio desktop open; the stdio process forwards requests to its running editor. " +
				"Use list_documents before document operations; documentId values are tab IDs and paths must be absolute. " +
				"Pixtorio projects use strict .pixio v5; read_pixels and read_indexes are bounded to 16384 pixels. " +
				"Use edit_document with an ordered operations array and type discriminators for layers, sparse Cels, tilesets, tilemaps, Terrain rules/maps, tags, slices, guides, and settings. " +
				"get_preview returns a PNG image. Save and export paths are not overwritten unless overwrite is true. " +
				"Edits ignore the UI selection mask and clear stale selections after success. " +
				"Busy pointer gestures, drawing, playback, dialogs, text input, or UI saves are rejected; finish them and retry.",
		}}}, nil
	})
	return server
}

// Run starts a single-session stdio MCP server and blocks until the client
// disconnects or ctx is cancelled.
func Run(ctx context.Context, dispatch func(context.Context, string, json.RawMessage) (json.RawMessage, error)) error {
	return New(dispatch).Run(ctx, &mcp.StdioTransport{})
}

type toolSpec struct {
	command      string
	description  string
	schema       map[string]any
	title        string
	readOnly     bool
	destructive  bool
	idempotent   bool
	validateArgs func(map[string]any) error
	preview      bool
}

func addTool(server *mcp.Server, spec toolSpec, dispatch func(context.Context, string, json.RawMessage) (json.RawMessage, error)) {
	tool := &mcp.Tool{
		Name:        "pixtorio_" + spec.command,
		Title:       spec.title,
		Description: spec.description,
		InputSchema: spec.schema,
		Annotations: &mcp.ToolAnnotations{
			Title:           spec.title,
			ReadOnlyHint:    spec.readOnly,
			DestructiveHint: boolPointer(spec.destructive),
			IdempotentHint:  spec.idempotent,
			OpenWorldHint:   boolPointer(false),
		},
	}

	mcp.AddTool[map[string]any, any](server, tool, func(ctx context.Context, _ *mcp.CallToolRequest, input map[string]any) (*mcp.CallToolResult, any, error) {
		if spec.validateArgs != nil {
			if err := spec.validateArgs(input); err != nil {
				return nil, nil, err
			}
		}
		arguments, err := json.Marshal(input)
		if err != nil {
			return nil, nil, fmt.Errorf("encode tool arguments: %w", err)
		}
		output, err := dispatch(ctx, spec.command, arguments)
		if err != nil {
			return nil, nil, err
		}
		if spec.preview {
			result, err := previewResult(output)
			if err != nil {
				return nil, nil, err
			}
			return result, nil, nil
		}
		text, err := jsonText(output)
		if err != nil {
			return nil, nil, err
		}
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}, nil, nil
	})
}

func previewResult(output json.RawMessage) (*mcp.CallToolResult, error) {
	var preview struct {
		PNGBase64 string `json:"pngBase64"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	}
	if err := json.Unmarshal(output, &preview); err != nil {
		return nil, fmt.Errorf("decode preview result: %w", err)
	}
	if preview.PNGBase64 == "" {
		return nil, fmt.Errorf("preview result has no pngBase64")
	}
	if preview.Width <= 0 || preview.Height <= 0 {
		return nil, fmt.Errorf("preview result has invalid dimensions %dx%d", preview.Width, preview.Height)
	}
	pngData, err := base64.StdEncoding.DecodeString(preview.PNGBase64)
	if err != nil {
		return nil, fmt.Errorf("decode preview PNG: %w", err)
	}
	if len(pngData) == 0 {
		return nil, fmt.Errorf("preview result has empty PNG data")
	}
	return &mcp.CallToolResult{Content: []mcp.Content{
		&mcp.ImageContent{Data: pngData, MIMEType: "image/png"},
		&mcp.TextContent{Text: fmt.Sprintf("%dx%d", preview.Width, preview.Height)},
	}}, nil
}

func jsonText(raw json.RawMessage) (string, error) {
	if len(raw) == 0 {
		return "null", nil
	}
	if !json.Valid(raw) {
		return "", fmt.Errorf("dispatcher returned invalid JSON")
	}
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil {
		return "", fmt.Errorf("compact dispatcher result: %w", err)
	}
	return compact.String(), nil
}

func boolPointer(value bool) *bool { return &value }

func toolSpecs() []toolSpec {
	return []toolSpec{
		{
			command:     "list_documents",
			title:       "List documents",
			description: "List open Pixtorio document tabs and their document metadata.",
			schema:      objectSchema(nil, nil),
			readOnly:    true,
			idempotent:  true,
		},
		{
			command:     "get_document",
			title:       "Get document",
			description: "Return the complete document model for an open tab. documentId is the tab ID.",
			schema:      objectSchema(map[string]any{"documentId": stringSchema("Open document tab ID.")}, []string{"documentId"}),
			readOnly:    true,
			idempotent:  true,
		},
		{
			command:     "create_document",
			title:       "Create document",
			description: "Create a new document tab with a bounded canvas and RGBA, grayscale, or indexed editing mode.",
			schema: objectSchema(map[string]any{
				"name":      stringSchema("Optional document name."),
				"width":     boundedIntegerSchema("Canvas width in pixels.", 1, maxCanvasDimension, 64),
				"height":    boundedIntegerSchema("Canvas height in pixels.", 1, maxCanvasDimension, 64),
				"colorMode": enumSchema("Document editing color mode.", "rgba", "grayscale", "indexed", "bitmap"),
			}, nil),
			destructive: true,
		},
		{
			command:     "activate_document",
			title:       "Activate document",
			description: "Make an open document tab active by its tab ID.",
			schema:      objectSchema(map[string]any{"documentId": stringSchema("Open document tab ID.")}, []string{"documentId"}),
			idempotent:  true,
		},
		{
			command:     "close_document",
			title:       "Close document",
			description: "Close an open document tab. Set discardChanges to true to close a dirty tab without saving.",
			schema: objectSchema(map[string]any{
				"documentId":     stringSchema("Open document tab ID."),
				"discardChanges": booleanSchema("Discard unsaved changes instead of requesting a save."),
			}, []string{"documentId"}),
			destructive: true,
		},
		{
			command:     "edit_document",
			title:       "Edit document",
			description: "Apply an ordered batch of document, layer, Cel, frame, palette, pixel, or canvas operations.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"operations": map[string]any{
					"type":        "array",
					"description": "Ordered edit operations. The batch allows at most 256 operations and 65536 pixel/index entries.",
					"maxItems":    maxOperations,
					"items":       map[string]any{"oneOf": editOperationSchemas()},
				},
			}, []string{"documentId", "operations"}),
			destructive:  true,
			validateArgs: validateEditArguments,
		},
		{
			command:     "read_pixels",
			title:       "Read pixels",
			description: "Read a bounded RGBA pixel rectangle from an open document. width multiplied by height must not exceed 16384.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"layerId":    stringSchema("Optional layer ID; defaults to the active or composited layer according to the dispatcher."),
				"frameId":    stringSchema("Optional frame ID; defaults to the active frame."),
				"x":          integerSchema("Left document coordinate."),
				"y":          integerSchema("Top document coordinate."),
				"width":      boundedIntegerSchema("Rectangle width in pixels.", 1, maxReadPixels, nil),
				"height":     boundedIntegerSchema("Rectangle height in pixels.", 1, maxReadPixels, nil),
			}, []string{"documentId", "x", "y", "width", "height"}),
			readOnly:     true,
			idempotent:   true,
			validateArgs: validateReadPixelsArguments,
		},
		{
			command:     "read_indexes",
			title:       "Read indexed pixels",
			description: "Read a bounded palette-index rectangle from an indexed document. width multiplied by height must not exceed 16384.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"layerId":    stringSchema("Optional image layer ID; defaults to the active layer."),
				"frameId":    stringSchema("Optional frame ID; defaults to the active frame."),
				"x":          integerSchema("Left document coordinate."),
				"y":          integerSchema("Top document coordinate."),
				"width":      boundedIntegerSchema("Rectangle width in pixels.", 1, maxReadPixels, nil),
				"height":     boundedIntegerSchema("Rectangle height in pixels.", 1, maxReadPixels, nil),
			}, []string{"documentId", "x", "y", "width", "height"}),
			readOnly:     true,
			idempotent:   true,
			validateArgs: validateReadPixelsArguments,
		},
		{
			command:     "read_tileset",
			title:       "Read tileset",
			description: "Read tileset metadata and authoritative RGBA tile payloads from an open document.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"tilesetId":  stringSchema("Tileset ID."),
				"tileId":     boundedIntegerSchema("Optional tile ID; omit to read all tiles.", 1, 0x1fffffff, nil),
			}, []string{"documentId", "tilesetId"}),
			readOnly:   true,
			idempotent: true,
		},
		{
			command:     "read_tilemap",
			title:       "Read tilemap",
			description: "Read the authoritative row-major tile values for a tilemap Cel.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"layerId":    stringSchema("Optional tilemap layer ID; defaults to the active layer."),
				"frameId":    stringSchema("Optional frame ID; defaults to the active frame."),
			}, []string{"documentId"}),
			readOnly:   true,
			idempotent: true,
		},
		{
			command:     "get_preview",
			title:       "Get preview",
			description: "Return the current or requested frame as a PNG image with text dimensions.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"frameId":    stringSchema("Optional frame ID; defaults to the active frame."),
			}, []string{"documentId"}),
			readOnly:   true,
			idempotent: true,
			preview:    true,
		},
		{
			command:     "undo",
			title:       "Undo",
			description: "Undo the most recent reversible change in an open document tab.",
			schema:      objectSchema(map[string]any{"documentId": stringSchema("Open document tab ID.")}, []string{"documentId"}),
			destructive: true,
		},
		{
			command:     "redo",
			title:       "Redo",
			description: "Redo the most recently undone reversible change in an open document tab.",
			schema:      objectSchema(map[string]any{"documentId": stringSchema("Open document tab ID.")}, []string{"documentId"}),
			destructive: true,
		},
		{
			command:     "open_project",
			title:       "Open project",
			description: "Open a .pixio project from an absolute filesystem path as a new document tab.",
			schema:      objectSchema(map[string]any{"path": pathSchema("Absolute .pixio project path.")}, []string{"path"}),
			destructive: true,
			validateArgs: func(input map[string]any) error {
				return validateAbsolutePath(input, "path")
			},
		},
		{
			command:     "save_project",
			title:       "Save project",
			description: "Save an open document as a .pixio project at an absolute path; existing files require overwrite=true.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"path":       pathSchema("Absolute .pixio destination path."),
				"overwrite":  booleanSchema("Allow replacing an existing file."),
			}, []string{"documentId", "path"}),
			destructive: true,
			validateArgs: func(input map[string]any) error {
				return validateAbsolutePath(input, "path")
			},
		},
		{
			command:     "export_image",
			title:       "Export image",
			description: "Export an open document to an absolute PNG, GIF, or sprite-sheet path; existing files require overwrite=true.",
			schema: objectSchema(map[string]any{
				"documentId": stringSchema("Open document tab ID."),
				"path":       pathSchema("Absolute export destination path."),
				"format":     enumSchema("Export format.", "png", "gif", "spritesheet"),
				"scale":      boundedIntegerSchema("Integer export scale.", 1, maxExportScale, nil),
				"columns":    boundedIntegerSchema("Sprite-sheet column count.", 1, 256, nil),
				"overwrite":  booleanSchema("Allow replacing an existing file."),
			}, []string{"documentId", "path", "format"}),
			destructive: true,
			validateArgs: func(input map[string]any) error {
				return validateAbsolutePath(input, "path")
			},
		},
	}
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	schema := map[string]any{
		"type":                 "object",
		"additionalProperties": false,
	}
	if properties != nil {
		schema["properties"] = properties
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}

func stringSchema(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

func pathSchema(description string) map[string]any {
	return map[string]any{"type": "string", "description": description, "minLength": 1}
}

func booleanSchema(description string) map[string]any {
	return map[string]any{"type": "boolean", "description": description}
}

func integerSchema(description string) map[string]any {
	return map[string]any{"type": "integer", "description": description}
}

func boundedIntegerSchema(description string, minimum, maximum int, defaultValue any) map[string]any {
	schema := map[string]any{
		"type":        "integer",
		"description": description,
		"minimum":     minimum,
		"maximum":     maximum,
	}
	if defaultValue != nil {
		schema["default"] = defaultValue
	}
	return schema
}

func enumSchema(description string, values ...string) map[string]any {
	enum := make([]any, 0, len(values))
	for _, value := range values {
		enum = append(enum, value)
	}
	return map[string]any{"type": "string", "description": description, "enum": enum}
}

func constStringSchema(value, description string) map[string]any {
	return map[string]any{"type": "string", "const": value, "description": description}
}

func colorSchema() map[string]any {
	return map[string]any{
		"type":        "string",
		"description": "Hex color in #RRGGBB or #RRGGBBAA form.",
		"pattern":     `^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$`,
	}
}

func colorArraySchema(description string) map[string]any {
	return map[string]any{
		"type":        "array",
		"description": description,
		"minItems":    1,
		"maxItems":    maxCanvasDimension * maxCanvasDimension,
		"items":       colorSchema(),
	}
}

func indexArraySchema(description string) map[string]any {
	return map[string]any{
		"type":        "array",
		"description": description,
		"minItems":    1,
		"maxItems":    maxCanvasDimension * maxCanvasDimension,
		"items":       boundedIntegerSchema("Palette index.", 0, 255, nil),
	}
}

func sliceRectSchema(description string) map[string]any {
	return objectSchema(map[string]any{
		"x":      integerSchema(description + " X coordinate."),
		"y":      integerSchema(description + " Y coordinate."),
		"width":  boundedIntegerSchema(description+" width.", 1, maxCanvasDimension, nil),
		"height": boundedIntegerSchema(description+" height.", 1, maxCanvasDimension, nil),
	}, []string{"x", "y", "width", "height"})
}

func pointSchema(description string) map[string]any {
	return objectSchema(map[string]any{
		"x": integerSchema(description + " X coordinate."),
		"y": integerSchema(description + " Y coordinate."),
	}, []string{"x", "y"})
}

func sliceKeySchema() map[string]any {
	return objectSchema(map[string]any{
		"frameId": stringSchema("Key frame ID."),
		"x":       integerSchema("Slice key X coordinate."), "y": integerSchema("Slice key Y coordinate."),
		"width":  boundedIntegerSchema("Slice key width.", 1, maxCanvasDimension, nil),
		"height": boundedIntegerSchema("Slice key height.", 1, maxCanvasDimension, nil),
		"center": sliceRectSchema("Nine-slice center rectangle."), "pivot": pointSchema("Slice pivot."),
	}, []string{"frameId", "x", "y", "width", "height"})
}

func editOperationSchemas() []any {
	return []any{
		objectSchema(map[string]any{
			"type":    constStringSchema("set_pixels", "Operation type: set pixel colors."),
			"layerId": stringSchema("Optional target layer ID."),
			"frameId": stringSchema("Optional target frame ID."),
			"pixels": map[string]any{
				"type":     "array",
				"maxItems": maxSetPixels,
				"items": objectSchema(map[string]any{
					"x":     integerSchema("Pixel x coordinate."),
					"y":     integerSchema("Pixel y coordinate."),
					"color": colorSchema(),
				}, []string{"x", "y", "color"}),
			},
		}, []string{"type", "pixels"}),
		objectSchema(map[string]any{
			"type":    constStringSchema("set_indexes", "Operation type: set palette indexes in an indexed Cel."),
			"layerId": stringSchema("Optional target image layer ID."),
			"frameId": stringSchema("Optional target frame ID."),
			"pixels": map[string]any{
				"type": "array", "maxItems": maxSetPixels,
				"items": objectSchema(map[string]any{
					"x": integerSchema("Pixel x coordinate."), "y": integerSchema("Pixel y coordinate."),
					"index": boundedIntegerSchema("Palette index.", 0, 255, nil),
				}, []string{"x", "y", "index"}),
			},
		}, []string{"type", "pixels"}),
		setCelPropertiesOperationSchema(),
		objectSchema(map[string]any{
			"type":       constStringSchema("add_tileset", "Operation type: add an empty tile set."),
			"tilesetId":  stringSchema("Optional stable tileset ID."),
			"name":       stringSchema("Tileset name."),
			"tileWidth":  boundedIntegerSchema("Tile width in pixels.", 1, maxCanvasDimension, nil),
			"tileHeight": boundedIntegerSchema("Tile height in pixels.", 1, maxCanvasDimension, nil),
		}, []string{"type", "name", "tileWidth", "tileHeight"}),
		objectSchema(map[string]any{
			"type":      constStringSchema("update_tileset", "Operation type: update tileset metadata."),
			"tilesetId": stringSchema("Tileset ID."),
			"name":      stringSchema("New tileset name."),
		}, []string{"type", "tilesetId"}),
		objectSchema(map[string]any{
			"type":      constStringSchema("delete_tileset", "Operation type: delete an unused tileset."),
			"tilesetId": stringSchema("Tileset ID."),
		}, []string{"type", "tilesetId"}),
		objectSchema(map[string]any{
			"type":      constStringSchema("add_tile", "Operation type: add a tile to a tileset."),
			"tilesetId": stringSchema("Tileset ID."),
			"tileId":    boundedIntegerSchema("Optional tile ID.", 1, 0x1fffffff, nil),
			"pixels":    colorArraySchema("Row-major tile RGBA colors."),
			"indexes":   indexArraySchema("Optional row-major tile palette indexes."),
		}, []string{"type", "tilesetId", "pixels"}),
		objectSchema(map[string]any{
			"type":      constStringSchema("update_tile", "Operation type: replace a tile payload."),
			"tilesetId": stringSchema("Tileset ID."),
			"tileId":    boundedIntegerSchema("Tile ID.", 1, 0x1fffffff, nil),
			"pixels":    colorArraySchema("Optional row-major tile RGBA colors."),
			"indexes":   indexArraySchema("Optional row-major tile palette indexes."),
		}, []string{"type", "tilesetId", "tileId"}),
		objectSchema(map[string]any{
			"type":      constStringSchema("delete_tile", "Operation type: delete a tile and clear its references."),
			"tilesetId": stringSchema("Tileset ID."),
			"tileId":    boundedIntegerSchema("Tile ID.", 1, 0x1fffffff, nil),
		}, []string{"type", "tilesetId", "tileId"}),
		objectSchema(map[string]any{
			"type":          constStringSchema("set_tile_cells", "Operation type: replace tilemap cell values."),
			"layerId":       stringSchema("Optional tilemap layer ID."),
			"frameId":       stringSchema("Optional frame ID."),
			"detachTerrain": booleanSchema("Detach Terrain authority from the complete linked Cel group before changing cells."),
			"cells": map[string]any{
				"type": "array", "minItems": 1, "maxItems": maxSetPixels,
				"items": objectSchema(map[string]any{
					"x": integerSchema("Tile cell X."), "y": integerSchema("Tile cell Y."),
					"value": map[string]any{"type": "integer", "minimum": -2147483648, "maximum": 4294967295, "description": "Tile ID with optional flip flags."},
				}, []string{"x", "y", "value"}),
			},
		}, []string{"type", "cells"}),
		objectSchema(map[string]any{
			"type":       constStringSchema("add_layer", "Operation type: add a layer or group."),
			"name":       stringSchema("Layer name."),
			"parentId":   stringSchema("Optional parent group ID."),
			"kind":       enumSchema("Layer kind.", "image", "group", "tilemap"),
			"tilesetId":  stringSchema("Tileset ID required for tilemap layers."),
			"role":       enumSchema("Image layer role.", "standard", "background", "reference"),
			"continuous": booleanSchema("Whether new frames inherit the preceding Cel."),
			"alphaLock":  booleanSchema("Lock transparent pixels for painting."),
			"opacity":    boundedNumberSchema("Layer opacity.", 0, 1),
			"blendMode":  enumSchema("Layer blend mode.", "normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide"),
		}, []string{"type", "name"}),
		objectSchema(map[string]any{
			"type":       constStringSchema("update_layer", "Operation type: update layer properties."),
			"layerId":    stringSchema("Layer ID."),
			"name":       stringSchema("Optional new layer name."),
			"visible":    booleanSchema("Optional visibility state."),
			"locked":     booleanSchema("Optional lock state."),
			"opacity":    boundedNumberSchema("Optional layer opacity.", 0, 1),
			"blendMode":  enumSchema("Optional layer blend mode.", "normal", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "overlay", "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity", "addition", "subtract", "divide"),
			"role":       enumSchema("Optional image layer role.", "standard", "background", "reference"),
			"continuous": booleanSchema("Optional continuous-layer state."),
			"alphaLock":  booleanSchema("Optional alpha-lock state."),
		}, []string{"type", "layerId"}),
		objectSchema(map[string]any{
			"type":    constStringSchema("delete_layer", "Operation type: delete a layer."),
			"layerId": stringSchema("Layer ID."),
		}, []string{"type", "layerId"}),
		objectSchema(map[string]any{
			"type":            constStringSchema("add_frame", "Operation type: add an animation frame."),
			"duplicateFromId": stringSchema("Optional source frame ID to duplicate."),
			"durationMs":      boundedIntegerSchema("Optional frame duration in milliseconds.", 1, 60000, nil),
		}, []string{"type"}),
		objectSchema(map[string]any{
			"type":    constStringSchema("delete_frame", "Operation type: delete an animation frame."),
			"frameId": stringSchema("Frame ID."),
		}, []string{"type", "frameId"}),
		objectSchema(map[string]any{
			"type":       constStringSchema("set_frame_duration", "Operation type: set an animation frame duration."),
			"frameId":    stringSchema("Frame ID."),
			"durationMs": boundedIntegerSchema("Frame duration in milliseconds.", 1, 60000, nil),
		}, []string{"type", "frameId", "durationMs"}),
		objectSchema(map[string]any{
			"type":             constStringSchema("set_palette", "Operation type: replace the active palette."),
			"colors":           map[string]any{"type": "array", "maxItems": 256, "items": colorSchema()},
			"name":             stringSchema("Optional palette name."),
			"transparentIndex": boundedIntegerSchema("Optional transparent palette entry.", 0, 255, nil),
		}, []string{"type", "colors"}),
		objectSchema(map[string]any{
			"type": constStringSchema("rename_document", "Operation type: rename the document."),
			"name": stringSchema("New document name."),
		}, []string{"type", "name"}),
		objectSchema(map[string]any{
			"type":    constStringSchema("resize_canvas", "Operation type: resize the document canvas."),
			"width":   boundedIntegerSchema("New canvas width.", 1, maxCanvasDimension, nil),
			"height":  boundedIntegerSchema("New canvas height.", 1, maxCanvasDimension, nil),
			"anchorX": map[string]any{"type": "number", "enum": []any{0, 0.5, 1}},
			"anchorY": map[string]any{"type": "number", "enum": []any{0, 0.5, 1}},
		}, []string{"type", "width", "height", "anchorX", "anchorY"}),
		objectSchema(map[string]any{
			"type":      constStringSchema("update_settings", "Operation type: update grid, tiling, symmetry, or onion-skin settings."),
			"gridWidth": boundedIntegerSchema("Grid cell width.", 1, maxCanvasDimension, nil), "gridHeight": boundedIntegerSchema("Grid cell height.", 1, maxCanvasDimension, nil),
			"gridOffsetX": integerSchema("Grid horizontal offset."), "gridOffsetY": integerSchema("Grid vertical offset."),
			"snapToGrid": booleanSchema("Snap edits to the grid."), "tiledX": booleanSchema("Repeat horizontally."), "tiledY": booleanSchema("Repeat vertically."),
			"symmetryX": booleanSchema("Enable horizontal-axis symmetry."), "symmetryY": booleanSchema("Enable vertical-axis symmetry."),
			"symmetryAxisX": boundedNumberSchema("Horizontal symmetry axis.", 0, maxCanvasDimension), "symmetryAxisY": boundedNumberSchema("Vertical symmetry axis.", 0, maxCanvasDimension),
			"onionPreviousFrames": boundedIntegerSchema("Previous onion-skin frame count.", 0, 16, nil), "onionNextFrames": boundedIntegerSchema("Next onion-skin frame count.", 0, 16, nil),
			"onionOpacity": boundedNumberSchema("Onion-skin opacity.", 0, 1), "onionPreviousColor": colorSchema(), "onionNextColor": colorSchema(),
		}, []string{"type"}),
		objectSchema(map[string]any{
			"type": constStringSchema("add_tag", "Operation type: add a frame tag."), "name": stringSchema("Tag name."), "fromFrameId": stringSchema("First frame ID."), "toFrameId": stringSchema("Last frame ID."),
			"direction": enumSchema("Playback direction.", "forward", "reverse", "pingpong"), "color": colorSchema(), "repeat": boundedIntegerSchema("Repeat count.", 0, 65535, nil),
		}, []string{"type", "name", "fromFrameId", "toFrameId"}),
		objectSchema(map[string]any{
			"type": constStringSchema("update_tag", "Operation type: update a frame tag."), "tagId": stringSchema("Tag ID."), "name": stringSchema("Tag name."), "fromFrameId": stringSchema("First frame ID."), "toFrameId": stringSchema("Last frame ID."),
			"direction": enumSchema("Playback direction.", "forward", "reverse", "pingpong"), "color": colorSchema(), "repeat": boundedIntegerSchema("Repeat count.", 0, 65535, nil),
		}, []string{"type", "tagId"}),
		objectSchema(map[string]any{"type": constStringSchema("delete_tag", "Operation type: delete a frame tag."), "tagId": stringSchema("Tag ID.")}, []string{"type", "tagId"}),
		objectSchema(map[string]any{"type": constStringSchema("reverse_frames", "Operation type: reverse selected frames."), "frameIds": map[string]any{"type": "array", "minItems": 2, "items": stringSchema("Frame ID.")}}, []string{"type", "frameIds"}),
		objectSchema(map[string]any{"type": constStringSchema("link_cels", "Operation type: link selected Cels."), "layerId": stringSchema("Image layer ID."), "frameIds": map[string]any{"type": "array", "minItems": 2, "items": stringSchema("Frame ID.")}, "sourceFrameId": stringSchema("Optional source frame ID.")}, []string{"type", "layerId", "frameIds"}),
		objectSchema(map[string]any{"type": constStringSchema("unlink_cels", "Operation type: unlink selected Cels."), "layerId": stringSchema("Image layer ID."), "frameIds": map[string]any{"type": "array", "minItems": 1, "items": stringSchema("Frame ID.")}}, []string{"type", "layerId", "frameIds"}),
		objectSchema(map[string]any{
			"type": constStringSchema("add_slice", "Operation type: add a sprite-export slice."), "name": stringSchema("Slice name."), "color": colorSchema(), "frameId": stringSchema("Optional key frame ID."),
			"x": integerSchema("Slice x."), "y": integerSchema("Slice y."), "width": boundedIntegerSchema("Slice width.", 1, maxCanvasDimension, nil), "height": boundedIntegerSchema("Slice height.", 1, maxCanvasDimension, nil),
			"center": sliceRectSchema("Nine-slice center rectangle."), "pivot": pointSchema("Slice pivot."),
		}, []string{"type", "name", "x", "y", "width", "height"}),
		objectSchema(map[string]any{"type": constStringSchema("update_slice", "Operation type: update a sprite-export slice."), "sliceId": stringSchema("Slice ID."), "name": stringSchema("Slice name."), "color": colorSchema(), "keys": map[string]any{"type": "array", "minItems": 1, "items": sliceKeySchema()}}, []string{"type", "sliceId"}),
		objectSchema(map[string]any{"type": constStringSchema("delete_slice", "Operation type: delete a slice."), "sliceId": stringSchema("Slice ID.")}, []string{"type", "sliceId"}),
		objectSchema(map[string]any{"type": constStringSchema("add_guide", "Operation type: add a canvas guide."), "axis": enumSchema("Guide axis.", "horizontal", "vertical"), "position": boundedNumberSchema("Guide position.", 0, maxCanvasDimension)}, []string{"type", "axis", "position"}),
		objectSchema(map[string]any{"type": constStringSchema("update_guide", "Operation type: update a canvas guide."), "guideId": stringSchema("Guide ID."), "axis": enumSchema("Guide axis.", "horizontal", "vertical"), "position": boundedNumberSchema("Guide position.", 0, maxCanvasDimension)}, []string{"type", "guideId"}),
		objectSchema(map[string]any{"type": constStringSchema("delete_guide", "Operation type: delete a canvas guide."), "guideId": stringSchema("Guide ID.")}, []string{"type", "guideId"}),
	}
}

func setCelPropertiesOperationSchema() map[string]any {
	schema := objectSchema(map[string]any{
		"type":    constStringSchema("set_cel_properties", "Operation type: set per-Cel opacity and stacking index."),
		"layerId": stringSchema("Target image or tilemap layer ID."),
		"frameId": stringSchema("Target frame ID."),
		"opacity": boundedNumberSchema("Optional Cel opacity.", 0, 1),
		"zIndex":  boundedIntegerSchema("Optional Cel stacking index.", -32768, 32767, nil),
	}, []string{"type", "layerId", "frameId"})
	schema["anyOf"] = []any{
		map[string]any{"required": []string{"opacity"}},
		map[string]any{"required": []string{"zIndex"}},
	}
	return schema
}

func boundedNumberSchema(description string, minimum, maximum float64) map[string]any {
	return map[string]any{
		"type":        "number",
		"description": description,
		"minimum":     minimum,
		"maximum":     maximum,
	}
}

func validateReadPixelsArguments(input map[string]any) error {
	width, err := integerValue(input, "width")
	if err != nil {
		return err
	}
	height, err := integerValue(input, "height")
	if err != nil {
		return err
	}
	if width > 0 && height > maxReadPixels/width {
		return fmt.Errorf("read_pixels area exceeds %d pixels", maxReadPixels)
	}
	return nil
}

func validateEditArguments(input map[string]any) error {
	operations, ok := input["operations"].([]any)
	if !ok {
		return fmt.Errorf("operations must be an array")
	}
	totalPixels := 0
	for _, rawOperation := range operations {
		operation, ok := rawOperation.(map[string]any)
		if !ok || (operation["type"] != "set_pixels" && operation["type"] != "set_indexes") {
			continue
		}
		pixels, ok := operation["pixels"].([]any)
		if !ok {
			return fmt.Errorf("pixel write pixels must be an array")
		}
		if len(pixels) > maxSetPixels-totalPixels {
			return fmt.Errorf("set_pixels contains more than %d pixels across the edit batch", maxSetPixels)
		}
		totalPixels += len(pixels)
	}
	return nil
}

func integerValue(input map[string]any, field string) (int, error) {
	value, ok := input[field]
	if !ok {
		return 0, fmt.Errorf("%s is required", field)
	}
	switch value := value.(type) {
	case int:
		return value, nil
	case int8:
		return int(value), nil
	case int16:
		return int(value), nil
	case int32:
		return int(value), nil
	case int64:
		if int64(int(value)) != value {
			return 0, fmt.Errorf("%s is out of range", field)
		}
		return int(value), nil
	case float64:
		if math.IsNaN(value) || math.IsInf(value, 0) || math.Trunc(value) != value || value < float64(-int(^uint(0)>>1)-1) || value > float64(int(^uint(0)>>1)) {
			return 0, fmt.Errorf("%s must be an integer", field)
		}
		return int(value), nil
	case json.Number:
		parsed, err := value.Int64()
		if err != nil || int64(int(parsed)) != parsed {
			return 0, fmt.Errorf("%s must be an integer", field)
		}
		return int(parsed), nil
	default:
		return 0, fmt.Errorf("%s must be an integer", field)
	}
}

func validateAbsolutePath(input map[string]any, field string) error {
	value, ok := input[field].(string)
	if !ok || value == "" {
		return fmt.Errorf("%s must be a non-empty absolute path", field)
	}
	if !filepath.IsAbs(value) {
		return fmt.Errorf("%s must be an absolute path", field)
	}
	return nil
}

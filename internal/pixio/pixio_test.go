package pixio

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestWriteReadRoundTrip(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "sprite.pixio")
	document := testDocument()
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}
	loaded, thumbnail, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !validPNG(thumbnail) {
		t.Fatal("missing or invalid generated thumbnail")
	}
	preview, err := png.Decode(bytes.NewReader(thumbnail))
	if err != nil {
		t.Fatal(err)
	}
	if preview.Bounds().Dx() != 2 || preview.Bounds().Dy() != 2 {
		t.Fatalf("thumbnail dimensions = %v, want 2x2", preview.Bounds())
	}
	if got := color.NRGBAModel.Convert(preview.At(0, 0)).(color.NRGBA); got != (color.NRGBA{R: 255, A: 128}) {
		t.Fatalf("thumbnail first pixel = %#v, want half-transparent red", got)
	}
	if loaded.Name != document.Name || loaded.Width != 2 || loaded.Height != 2 || len(loaded.Cels) != 1 || loaded.Tags == nil {
		t.Fatalf("unexpected document: %#v", loaded)
	}
	if !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatal("pixels did not round trip")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatal(err)
	}
}

func TestHexTilemapGridOffsetRoundTripAndStrictValidation(t *testing.T) {
	document := terrainTestDocument(
		TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"},
		TerrainNeighborEdge6,
	)
	cel := &document.Cels[0]
	cel.Tilemap.GridOffset = "even-r"
	effective := tilesetForTilemap(document.Tilesets[0], *cel.Tilemap)
	cel.Width, cel.Height = tilemapPixelSize(effective, cel.Tilemap.Columns, cel.Tilemap.Rows)
	document.Width, document.Height = cel.Width, cel.Height
	cel.Tilemap.Tiles = renderTerrainTilemap(*cel.TerrainMap, effective)
	cel.Pixels = renderTilemapCache(cel.Width, cel.Height, *cel.Tilemap, document.Tilesets[0])

	path := filepath.Join(t.TempDir(), "hex-offset.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatalf("WriteFile() rejected local hex offset: %v", err)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() rejected local hex offset: %v", err)
	}
	if loaded.Cels[0].Tilemap.GridOffset != "even-r" || !bytes.Equal(loaded.Cels[0].Pixels, cel.Pixels) {
		t.Fatalf("local hex offset did not round trip: %+v", loaded.Cels[0].Tilemap)
	}

	for name, value := range map[string]json.RawMessage{
		"wrong-axis": json.RawMessage(`"odd-q"`),
		"empty":      json.RawMessage(`""`),
		"null":       json.RawMessage(`null`),
		"number":     json.RawMessage(`1`),
	} {
		t.Run(name, func(t *testing.T) {
			corrupt := filepath.Join(t.TempDir(), name+".pixio")
			rewriteCelManifest(t, path, corrupt, func(raw map[string]json.RawMessage) {
				raw["tilemapGridOffset"] = value
			})
			if _, _, err := ReadFile(corrupt); err == nil {
				t.Fatal("ReadFile() accepted an invalid tilemapGridOffset")
			}
		})
	}

	invalid := document
	invalid.Tilesets = append([]Tileset(nil), document.Tilesets...)
	invalid.Tilesets[0].Grid = TilesetGrid{Kind: TileGridOrthogonal}
	if err := Validate(invalid); err == nil {
		t.Fatal("Validate() accepted a local hex offset on an orthogonal Tileset")
	}
}

func TestV4RoundTripPreservesGroupsTagsLinksAndOffsets(t *testing.T) {
	document := Document{
		FormatVersion:    FormatVersion,
		Name:             "v4.pixio",
		Width:            3,
		Height:           2,
		ColorMode:        "rgba",
		ColorProfile:     ColorProfile{Type: ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: PixelAspectRatio{Width: 1, Height: 1},
		Palette:          Palette{ID: "palette", Name: "Default", Colors: []string{"#000000", "#ffffff"}, TransparentIndex: 0},
		Tilesets:         []Tileset{},
		Layers: []Layer{
			{ID: "background", Name: "Background", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: BlendModeNormal, Role: LayerRoleBackground},
			{ID: "group", Name: "Effects", Visible: true, Opacity: 0.75, Kind: LayerKindGroup, BlendMode: BlendModeScreen, Role: LayerRoleStandard},
			{ID: "child", Name: "Child", Visible: true, Opacity: 0.5, Kind: LayerKindImage, ParentID: "group", BlendMode: BlendModeMultiply, Role: LayerRoleStandard, Continuous: true, AlphaLock: true},
		},
		Frames:        []Frame{{ID: "frame-1", DurationMS: 100}, {ID: "frame-2", DurationMS: 240}},
		Tags:          []FrameTag{{ID: "tag", Name: "Loop", FromFrameID: "frame-1", ToFrameID: "frame-2", Direction: TagDirectionPingPong, Color: "#ef476f", Repeat: 2}},
		Slices:        []Slice{{ID: "slice", Name: "Sprite", Color: "#ef476fff", Keys: []SliceKey{{FrameID: "frame-1", X: 0, Y: 0, Width: 2, Height: 2, Center: &SliceRect{X: 0, Y: 0, Width: 1, Height: 1}, Pivot: &Point{X: 1, Y: 1}}}}},
		Guides:        []Guide{{ID: "guide", Axis: "vertical", Position: 1}},
		Settings:      DocumentSettings{GridWidth: 8, GridHeight: 8, GridOffsetX: 0, GridOffsetY: 0, SnapToGrid: true, TiledX: true, TiledY: false, SymmetryX: true, SymmetryY: false, SymmetryAxisX: 1.5, SymmetryAxisY: 1, OnionPreviousFrames: 3, OnionNextFrames: 4, OnionOpacity: 0.45, OnionPreviousColor: "#f25b5bff", OnionNextColor: "#4ea3ffff"},
		ActiveLayerID: "child",
		ActiveFrameID: "frame-2",
	}
	backgroundPixels := []byte{
		255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
		255, 255, 0, 255, 255, 0, 255, 255, 255, 0, 255, 255,
	}
	childPixels := []byte{
		16, 32, 48, 255, 64, 80, 96, 255, 0, 0, 0, 0,
		112, 128, 144, 255, 160, 176, 192, 255, 0, 0, 0, 0,
	}
	document.Cels = []Cel{
		{ID: "background-1", LinkID: "background-link-1", LayerID: "background", FrameID: "frame-1", Width: 3, Height: 2, Opacity: 1, Pixels: backgroundPixels},
		{ID: "background-2", LinkID: "background-link-2", LayerID: "background", FrameID: "frame-2", Width: 3, Height: 2, Opacity: 1, Pixels: append([]byte(nil), backgroundPixels...)},
		{ID: "child-1", LinkID: "child-link", LayerID: "child", FrameID: "frame-1", Width: 3, Height: 2, Opacity: 1, Pixels: childPixels},
		{ID: "child-2", LinkID: "child-link", LayerID: "child", FrameID: "frame-2", X: -1, Y: 1, Width: 3, Height: 2, Opacity: 1, Pixels: append([]byte(nil), childPixels...)},
	}

	path := filepath.Join(t.TempDir(), "v4.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.FormatVersion != FormatVersion || len(loaded.Layers) != 3 || len(loaded.Frames) != 2 || len(loaded.Tags) != 1 || len(loaded.Cels) != 4 {
		t.Fatalf("unexpected v4 metadata: %#v", loaded)
	}
	if loaded.Layers[1].Kind != LayerKindGroup || loaded.Layers[1].BlendMode != BlendModeScreen || loaded.Layers[2].ParentID != "group" || loaded.Layers[2].BlendMode != BlendModeMultiply {
		t.Fatalf("group metadata did not round trip: %#v", loaded.Layers)
	}
	if loaded.Tags[0] != document.Tags[0] {
		t.Fatalf("frame tag did not round trip: %#v", loaded.Tags)
	}
	if loaded.Layers[0].Role != LayerRoleBackground || !loaded.Layers[2].Continuous || !loaded.Layers[2].AlphaLock || loaded.Slices[0].Keys[0].Pivot.X != 1 || !loaded.Settings.SnapToGrid || loaded.Settings.OnionPreviousFrames != 3 || loaded.Settings.OnionNextFrames != 4 || loaded.Settings.OnionOpacity != 0.45 || loaded.Settings.OnionPreviousColor != "#f25b5bff" || loaded.Settings.OnionNextColor != "#4ea3ffff" {
		t.Fatalf("v4 metadata did not round trip: %#v", loaded)
	}
	for _, want := range document.Cels {
		var got *Cel
		for index := range loaded.Cels {
			if loaded.Cels[index].ID == want.ID {
				got = &loaded.Cels[index]
				break
			}
		}
		if got == nil || got.LinkID != want.LinkID || got.LayerID != want.LayerID || got.FrameID != want.FrameID || got.X != want.X || got.Y != want.Y || got.Width != want.Width || got.Height != want.Height || !bytes.Equal(got.Pixels, want.Pixels) {
			t.Fatalf("cel %q did not round trip: got %#v, want %#v", want.ID, got, want)
		}
	}
}

func TestV4RoundTripAcceptsPartialAndOffsetCels(t *testing.T) {
	document := testDocument()
	document.Width = 4
	document.Height = 3
	document.Cels[0].X = -1
	document.Cels[0].Y = 2
	document.Cels[0].Width = 2
	document.Cels[0].Height = 1
	document.Cels[0].Pixels = []byte{255, 0, 0, 255, 0, 255, 0, 255}

	path := filepath.Join(t.TempDir(), "partial-offset.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatalf("WriteFile() rejected partial/offset cel: %v", err)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() rejected partial/offset cel: %v", err)
	}
	cel := loaded.Cels[0]
	if cel.X != -1 || cel.Y != 2 || cel.Width != 2 || cel.Height != 1 || !bytes.Equal(cel.Pixels, document.Cels[0].Pixels) {
		t.Fatalf("partial/offset cel did not round trip: got %#v, want %#v", cel, document.Cels[0])
	}
}

func TestV4RoundTripPreservesLinkedCelPropertiesIndependently(t *testing.T) {
	document := testDocument()
	document.Cels[0].Opacity = 0.25
	document.Cels[0].ZIndex = -17
	document.Frames = append(document.Frames, Frame{ID: "frame-2", DurationMS: 100})
	document.Cels = append(document.Cels, Cel{
		ID:      "cel-2",
		LinkID:  document.Cels[0].LinkID,
		LayerID: "layer",
		FrameID: "frame-2",
		Width:   document.Cels[0].Width,
		Height:  document.Cels[0].Height,
		Opacity: 0.75,
		ZIndex:  23,
		Pixels:  append([]byte(nil), document.Cels[0].Pixels...),
	})

	path := filepath.Join(t.TempDir(), "linked-properties.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range document.Cels {
		var got *Cel
		for index := range loaded.Cels {
			if loaded.Cels[index].ID == want.ID {
				got = &loaded.Cels[index]
				break
			}
		}
		if got == nil || got.LinkID != want.LinkID || got.Opacity != want.Opacity || got.ZIndex != want.ZIndex {
			t.Fatalf("cel %q properties did not round trip: got %#v, want %#v", want.ID, got, want)
		}
	}

	archive, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	for _, file := range archive.File {
		if file.Name != "manifest.json" {
			continue
		}
		manifestData, readErr := readZipFile(file, maxManifestBytes)
		if readErr != nil {
			t.Fatal(readErr)
		}
		var stored manifest
		if err := json.Unmarshal(manifestData, &stored); err != nil {
			t.Fatal(err)
		}
		for _, want := range document.Cels {
			for _, got := range stored.Cels {
				if got.ID == want.ID && (got.Opacity != want.Opacity || got.ZIndex != want.ZIndex) {
					t.Fatalf("manifest cel %q properties = (%v, %d), want (%v, %d)", got.ID, got.Opacity, got.ZIndex, want.Opacity, want.ZIndex)
				}
			}
		}
		return
	}
	t.Fatal("manifest.json was not written")
}

func TestV4RejectsMissingCelPropertiesInManifest(t *testing.T) {
	for _, property := range []string{"opacity", "zIndex"} {
		t.Run(property, func(t *testing.T) {
			sourcePath := filepath.Join(t.TempDir(), "source.pixio")
			if err := WriteFile(sourcePath, testDocument(), nil); err != nil {
				t.Fatal(err)
			}
			archive, err := zip.OpenReader(sourcePath)
			if err != nil {
				t.Fatal(err)
			}
			entries := make([]zipTestEntry, 0, len(archive.File))
			for _, file := range archive.File {
				data, readErr := readZipFile(file, maxManifestBytes)
				if readErr != nil {
					_ = archive.Close()
					t.Fatal(readErr)
				}
				if file.Name == "manifest.json" {
					var raw map[string]json.RawMessage
					if err := json.Unmarshal(data, &raw); err != nil {
						_ = archive.Close()
						t.Fatal(err)
					}
					var cels []map[string]json.RawMessage
					if err := json.Unmarshal(raw["cels"], &cels); err != nil {
						_ = archive.Close()
						t.Fatal(err)
					}
					delete(cels[0], property)
					raw["cels"], err = json.Marshal(cels)
					if err != nil {
						_ = archive.Close()
						t.Fatal(err)
					}
					data, err = json.Marshal(raw)
					if err != nil {
						_ = archive.Close()
						t.Fatal(err)
					}
				}
				entries = append(entries, zipTestEntry{name: file.Name, data: data})
			}
			if err := archive.Close(); err != nil {
				t.Fatal(err)
			}

			path := filepath.Join(t.TempDir(), "missing-property.pixio")
			writeZipEntries(t, path, entries)
			if _, _, err := ReadFile(path); err == nil || !strings.Contains(err.Error(), "invalid cel") {
				t.Fatalf("ReadFile() error = %v, want invalid cel", err)
			}
		})
	}
}

func TestJSONDecodeRejectsMissingCelProperties(t *testing.T) {
	for _, property := range []string{"opacity", "zIndex"} {
		t.Run(property, func(t *testing.T) {
			data, err := json.Marshal(testDocument())
			if err != nil {
				t.Fatal(err)
			}
			var raw map[string]json.RawMessage
			if err := json.Unmarshal(data, &raw); err != nil {
				t.Fatal(err)
			}
			var cels []map[string]json.RawMessage
			if err := json.Unmarshal(raw["cels"], &cels); err != nil {
				t.Fatal(err)
			}
			delete(cels[0], property)
			raw["cels"], err = json.Marshal(cels)
			if err != nil {
				t.Fatal(err)
			}
			data, err = json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
			var decoded Document
			if err := json.Unmarshal(data, &decoded); err == nil || !strings.Contains(err.Error(), "invalid cel") {
				t.Fatalf("json.Unmarshal() error = %v, want invalid cel", err)
			}
		})
	}
}

func TestValidationAcceptsExplicitZeroCelOpacity(t *testing.T) {
	document := testDocument()
	document.Cels[0].Opacity = 0
	if err := Validate(document); err != nil {
		t.Fatalf("Validate() rejected explicit zero cel opacity: %v", err)
	}
}

func TestValidationRejectsBackgroundCelProperties(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(*Cel)
	}{
		{name: "non-opaque opacity", mutate: func(cel *Cel) { cel.Opacity = 0.5 }},
		{name: "non-zero z-index", mutate: func(cel *Cel) { cel.ZIndex = 1 }},
	} {
		t.Run(test.name, func(t *testing.T) {
			document := testDocument()
			document.Layers[0].Role = LayerRoleBackground
			test.mutate(&document.Cels[0])
			if err := Validate(document); err == nil || err.Error() != "invalid cel" {
				t.Fatalf("Validate() error = %v, want invalid cel", err)
			}
		})
	}
}

func TestReadRejectsInvalidBackgroundCelProperties(t *testing.T) {
	for _, test := range []struct {
		name   string
		mutate func(map[string]json.RawMessage)
	}{
		{name: "non-opaque opacity", mutate: func(cel map[string]json.RawMessage) { cel["opacity"] = json.RawMessage("0.5") }},
		{name: "non-zero z-index", mutate: func(cel map[string]json.RawMessage) { cel["zIndex"] = json.RawMessage("1") }},
	} {
		t.Run(test.name, func(t *testing.T) {
			document := testDocument()
			document.Layers[0].Role = LayerRoleBackground
			sourcePath := filepath.Join(t.TempDir(), "source.pixio")
			if err := WriteFile(sourcePath, document, nil); err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(t.TempDir(), "invalid-background.pixio")
			rewriteCelManifest(t, sourcePath, path, test.mutate)
			if _, _, err := ReadFile(path); err == nil || !strings.Contains(err.Error(), "invalid cel") {
				t.Fatalf("ReadFile() error = %v, want invalid cel", err)
			}
		})
	}
}

func TestValidationRejectsInvalidCelOpacityAndZIndex(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Document)
	}{
		{name: "opacity below zero", mutate: func(document *Document) { document.Cels[0].Opacity = -0.01 }},
		{name: "opacity above one", mutate: func(document *Document) { document.Cels[0].Opacity = 1.01 }},
		{name: "opacity NaN", mutate: func(document *Document) { document.Cels[0].Opacity = math.NaN() }},
		{name: "opacity positive infinity", mutate: func(document *Document) { document.Cels[0].Opacity = math.Inf(1) }},
		{name: "opacity negative infinity", mutate: func(document *Document) { document.Cels[0].Opacity = math.Inf(-1) }},
		{name: "z-index below minimum", mutate: func(document *Document) { document.Cels[0].ZIndex = minCelZIndex - 1 }},
		{name: "z-index above maximum", mutate: func(document *Document) { document.Cels[0].ZIndex = maxCelZIndex + 1 }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := testDocument()
			test.mutate(&document)
			if err := Validate(document); err == nil || err.Error() != "invalid cel" {
				t.Fatalf("Validate() error = %v, want invalid cel", err)
			}
		})
	}
}

func TestV4AcceptsAllColorModes(t *testing.T) {
	for _, mode := range []string{ColorModeRGBA, ColorModeIndexed, ColorModeGrayscale} {
		t.Run(mode, func(t *testing.T) {
			document := testDocument()
			document.ColorMode = mode
			if mode == ColorModeIndexed {
				document.Palette = Palette{ID: "palette", Name: "Indexed", Colors: []string{"#00000000", "#ff000080", "#040506ff", "#070809ff"}, TransparentIndex: 0}
				document.Cels[0].Indexes = []byte{1, 2, 3, 0}
				document.Cels[0].Pixels = indexedPixelsForTest(document.Cels[0].Indexes, document.Palette)
			}
			path := filepath.Join(t.TempDir(), mode+".pixio")
			if err := WriteFile(path, document, nil); err != nil {
				t.Fatalf("WriteFile() rejected %s mode: %v", mode, err)
			}
			loaded, _, err := ReadFile(path)
			if err != nil {
				t.Fatalf("ReadFile() rejected %s mode: %v", mode, err)
			}
			if loaded.ColorMode != mode {
				t.Fatalf("color mode = %q, want %q", loaded.ColorMode, mode)
			}
		})
	}
}

func TestV4IndexedRoundTripWritesIndexesAndAllowsSparseCels(t *testing.T) {
	document := testDocument()
	document.ColorMode = ColorModeIndexed
	document.Palette = Palette{ID: "palette", Name: "Indexed", Colors: []string{"#00000000", "#ff0000ff"}, TransparentIndex: 0}
	document.Cels[0].Indexes = []byte{0, 1, 1, 0}
	document.Cels[0].Pixels = indexedPixelsForTest(document.Cels[0].Indexes, document.Palette)
	document.Frames = append(document.Frames, Frame{ID: "frame-2", DurationMS: 200})
	path := filepath.Join(t.TempDir(), "indexed.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatalf("WriteFile() rejected indexed sparse document: %v", err)
	}
	archive, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	entries := make(map[string]bool, len(archive.File))
	for _, file := range archive.File {
		entries[file.Name] = true
	}
	if !entries["cels/cel.idx"] {
		t.Fatalf("indexed archive entries = %v, want cels/cel.idx", entries)
	}
	var stored manifest
	for _, file := range archive.File {
		if file.Name != "manifest.json" {
			continue
		}
		data, readErr := readZipFile(file, maxManifestBytes)
		if readErr != nil {
			t.Fatal(readErr)
		}
		if err := json.Unmarshal(data, &stored); err != nil {
			t.Fatal(err)
		}
		break
	}
	if len(stored.Cels) != 1 || stored.Cels[0].IndexPath != "cels/cel.idx" {
		t.Fatalf("indexed cel manifest = %#v, want indexPath", stored.Cels)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Cels) != 1 || !bytes.Equal(loaded.Cels[0].Indexes, document.Cels[0].Indexes) {
		t.Fatalf("indexed cel did not round trip: %#v", loaded.Cels)
	}
}

func TestV4TilemapRoundTripStoresReferencedBinaryResources(t *testing.T) {
	tilePixels := []byte{
		255, 0, 0, 255, 0, 255, 0, 255,
		0, 0, 255, 255, 255, 255, 0, 255,
	}
	tileset := Tileset{ID: "terrain", Name: "Terrain", TileWidth: 2, TileHeight: 2, Grid: TilesetGrid{Kind: TileGridOrthogonal}, Terrains: []TerrainDefinition{}, Tiles: []Tile{{ID: 1, Pixels: tilePixels, Indexes: []byte{1, 2, 3, 4}}}}
	tilemap := &TilemapData{Columns: 2, Rows: 2, Tiles: make([]byte, 16)}
	for index, value := range []uint32{1, 1 | tileFlipX, 0, 1 | tileFlipY} {
		binary.LittleEndian.PutUint32(tilemap.Tiles[index*4:], value)
	}
	document := Document{
		FormatVersion: FormatVersion,
		Name:          "tilemap.pixio", Width: 4, Height: 4, ColorMode: ColorModeIndexed,
		ColorProfile:     ColorProfile{Type: ColorProfileEmbedded, Name: "Embedded Test", Data: []byte{0, 1, 2, 3}},
		PixelAspectRatio: PixelAspectRatio{Width: 3, Height: 2},
		Palette:          Palette{ID: "palette", Name: "Default", Colors: []string{"#00000000", "#ff0000ff", "#00ff00ff", "#0000ffff", "#ffff00ff"}, TransparentIndex: 0},
		Tilesets:         []Tileset{tileset},
		Layers:           []Layer{{ID: "tile-layer", Name: "Tiles", Visible: true, Opacity: 1, Kind: LayerKindTilemap, TilesetID: "terrain", BlendMode: BlendModeNormal, Role: LayerRoleStandard}},
		Frames:           []Frame{{ID: "frame", DurationMS: 100}}, Tags: []FrameTag{}, Slices: []Slice{}, Guides: []Guide{},
		Settings:      DocumentSettings{GridWidth: 8, GridHeight: 8, SymmetryAxisX: 2, SymmetryAxisY: 2, OnionOpacity: 0.35, OnionPreviousColor: "#f25b5bff", OnionNextColor: "#4ea3ffff"},
		ActiveLayerID: "tile-layer", ActiveFrameID: "frame",
	}
	cache := renderTilemapCache(4, 4, *tilemap, tileset)
	document.Cels = []Cel{{ID: "tile-cel", LinkID: "tile-link", LayerID: "tile-layer", FrameID: "frame", Width: 4, Height: 4, Opacity: 1, Pixels: cache, Indexes: indexesForExactPixelsTest(cache, document.Palette), Tilemap: tilemap}}
	path := filepath.Join(t.TempDir(), "tilemap.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}
	archive, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	entries := make(map[string]bool, len(archive.File))
	var manifestData []byte
	for _, file := range archive.File {
		entries[file.Name] = true
		if file.Name == "manifest.json" {
			manifestData, err = readZipFile(file, maxManifestBytes)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, name := range []string{"profiles/profile.icc", "tilesets/terrain/1.png", "tilesets/terrain/1.idx", "tilemaps/tile-cel.bin"} {
		if !entries[name] {
			t.Fatalf("archive is missing %q: %v", name, entries)
		}
	}
	if bytes.Contains(manifestData, []byte(`"data"`)) || !bytes.Contains(manifestData, []byte(`"path":"profiles/profile.icc"`)) {
		t.Fatalf("manifest inlines binary data or omits profile path: %s", manifestData)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.ColorProfile.Type != ColorProfileEmbedded || !bytes.Equal(loaded.ColorProfile.Data, document.ColorProfile.Data) || loaded.PixelAspectRatio != document.PixelAspectRatio {
		t.Fatalf("profile/aspect ratio did not round trip: %#v", loaded)
	}
	if len(loaded.Tilesets) != 1 || len(loaded.Tilesets[0].Tiles) != 1 || !bytes.Equal(loaded.Tilesets[0].Tiles[0].Pixels, tilePixels) || !bytes.Equal(loaded.Tilesets[0].Tiles[0].Indexes, tileset.Tiles[0].Indexes) {
		t.Fatalf("tileset did not round trip: %#v", loaded.Tilesets)
	}
	if loaded.Cels[0].Tilemap == nil || !bytes.Equal(loaded.Cels[0].Tilemap.Tiles, tilemap.Tiles) || !bytes.Equal(loaded.Cels[0].Pixels, cache) {
		t.Fatalf("tilemap cel did not round trip: %#v", loaded.Cels[0])
	}
}

func TestV4RejectsInvalidTilemapReferencesAndCaches(t *testing.T) {
	document := testDocument()
	document.Width, document.Height = 2, 2
	document.Tilesets = []Tileset{{ID: "tileset", Name: "Tiles", TileWidth: 2, TileHeight: 2, Grid: TilesetGrid{Kind: TileGridOrthogonal}, Terrains: []TerrainDefinition{}, Tiles: []Tile{{ID: 1, Pixels: make([]byte, 16)}}}}
	document.Layers[0].Kind = LayerKindTilemap
	document.Layers[0].TilesetID = "tileset"
	tilemap := &TilemapData{Columns: 1, Rows: 1, Tiles: make([]byte, 4)}
	binary.LittleEndian.PutUint32(tilemap.Tiles, 2)
	document.Cels[0].Tilemap = tilemap
	document.Cels[0].Pixels = make([]byte, 16)
	if err := Validate(document); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("unknown tile reference error = %v, want invalid cel", err)
	}
	binary.LittleEndian.PutUint32(tilemap.Tiles, 1)
	document.Cels[0].Pixels[3] = 255
	if err := Validate(document); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("stale tilemap cache error = %v, want invalid cel", err)
	}
}

func TestV5TerrainEngineMatchesFrontendSemantics(t *testing.T) {
	orthogonal := TilesetGrid{Kind: TileGridOrthogonal}
	isometric := TilesetGrid{Kind: TileGridIsometric, CellWidth: 1, CellHeight: 1, AnchorX: 0, AnchorY: 1}
	pointyHexagonal := TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"}
	flatHexagonal := TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "odd-q"}

	orthogonalMap := terrainMapFromIDs(3, 3, []uint16{1, 1, 1, 1, 1, 1, 1, 1, 1})
	orthogonalMap.Terrains[2] = 0
	orthogonalMap.Terrains[10] = 0
	orthogonalMap.Terrains[14] = 0
	orthogonalMap.Terrains[6] = 0
	edge4 := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundaryEmpty, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
	if got := terrainMaskAt(orthogonalMap, edge4, orthogonal, 1, 1); got != 0 {
		t.Fatalf("orthogonal edge4 mask = %d, want 0", got)
	}

	blobMap := terrainMapFromIDs(3, 3, []uint16{0, 1, 1, 1, 1, 1, 1, 1, 1})
	blob := testTerrainDefinition(TerrainNeighborBlob8, TerrainBoundaryEmpty, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
	if got := terrainMaskAt(blobMap, blob, orthogonal, 1, 1); got != 0b01111111 {
		t.Fatalf("orthogonal blob8 mask = %08b, want 01111111", got)
	}

	isometricMap := terrainMapFromIDs(2, 2, []uint16{1, 1, 0, 1})
	if got := terrainMaskAt(isometricMap, edge4, isometric, 0, 0); got != 0b0010 {
		t.Fatalf("isometric edge4 mask = %04b, want 0010", got)
	}

	for _, grid := range []TilesetGrid{
		pointyHexagonal,
		{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "even-r"},
		flatHexagonal,
		{Kind: TileGridHexagonal, Orientation: "flat", Offset: "even-q"},
	} {
		hexMap := terrainMapFromIDs(3, 3, make([]uint16, 9))
		for index := 0; index < len(hexMap.Terrains); index += 2 {
			binary.LittleEndian.PutUint16(hexMap.Terrains[index:index+2], 1)
		}
		hex := testTerrainDefinition(TerrainNeighborEdge6, TerrainBoundaryEmpty, TerrainRule{Mask: 0x3f, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
		if got := terrainMaskAt(hexMap, hex, grid, 1, 1); got != 0x3f {
			t.Fatalf("hex %s/%s mask = %02x, want 3f", grid.Orientation, grid.Offset, got)
		}
	}

	emptyMap := terrainMapFromIDs(2, 2, []uint16{1, 1, 1, 1})
	empty := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundaryEmpty, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
	if got := terrainMaskAt(emptyMap, empty, orthogonal, 0, 0); got != 0b0110 {
		t.Fatalf("empty boundary mask = %04b, want 0110", got)
	}
	same := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundarySame, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
	if got := terrainMaskAt(emptyMap, same, orthogonal, 0, 0); got != 0b1111 {
		t.Fatalf("same boundary mask = %04b, want 1111", got)
	}
	wrapMap := terrainMapFromIDs(2, 1, []uint16{1, 0})
	wrap := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundaryWrap, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
	if got := terrainMaskAt(wrapMap, wrap, orthogonal, 0, 0); got != 0b0101 {
		t.Fatalf("wrap boundary mask = %04b, want 0101", got)
	}

	weighted := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundaryEmpty, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 30, Weight: 1}, {TileID: 31, Flags: int64(tileFlipX), Weight: 3}}})
	first := terrainMapFromIDs(8, 4, make([]uint16, 32))
	second := terrainMapFromIDs(8, 4, make([]uint16, 32))
	differentSeed := terrainMapFromIDs(8, 4, make([]uint16, 32))
	first.Seed, second.Seed, differentSeed.Seed = 12345, 12345, 54321
	firstValues := make([]uint32, 0, 32)
	secondValues := make([]uint32, 0, 32)
	differentValues := make([]uint32, 0, 32)
	for row := 0; row < first.Rows; row++ {
		for column := 0; column < first.Columns; column++ {
			firstValues = append(firstValues, resolveTerrainTile(first, []TerrainDefinition{weighted}, orthogonal, column, row, 1))
			secondValues = append(secondValues, resolveTerrainTile(second, []TerrainDefinition{weighted}, orthogonal, column, row, 1))
			differentValues = append(differentValues, resolveTerrainTile(differentSeed, []TerrainDefinition{weighted}, orthogonal, column, row, 1))
		}
	}
	if !bytes.Equal(uint32SliceBytes(firstValues), uint32SliceBytes(secondValues)) {
		t.Fatal("same Terrain seed produced different weighted candidates")
	}
	if bytes.Equal(uint32SliceBytes(firstValues), uint32SliceBytes(differentValues)) {
		t.Fatal("different Terrain seed produced the same weighted candidates")
	}
	for _, value := range firstValues {
		if value != 30 && value != uint32(31)|tileFlipX {
			t.Fatalf("weighted candidate = %#x, want tile 30 or tile 31 with flip X", value)
		}
	}

	fallback := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundaryEmpty,
		TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 40, Weight: 1}}},
		TerrainRule{Mask: 0b0100, Candidates: []TerrainCandidate{{TileID: 41, Weight: 1}}})
	fallbackMap := terrainMapFromIDs(3, 3, []uint16{0, 1, 1, 1, 1, 1, 1, 1, 1})
	if got := resolveTerrainTile(fallbackMap, []TerrainDefinition{fallback}, orthogonal, 1, 1, 1); got != 40 {
		t.Fatalf("missing Terrain mask fallback = %d, want 40", got)
	}
	noRules := testTerrainDefinition(TerrainNeighborEdge4, TerrainBoundaryEmpty)
	if got := resolveTerrainTile(fallbackMap, []TerrainDefinition{noRules}, orthogonal, 1, 1, 1); got != 0 {
		t.Fatalf("empty Terrain rules fallback = %d, want 0", got)
	}
}

func TestV5Blob8MaskNormalizationEnumerates47CanonicalMasks(t *testing.T) {
	canonicalCount := 0
	normalizedMasks := make(map[uint32]bool)
	for mask := uint32(0); mask <= 0xff; mask++ {
		normalized := normalizeBlobMask(mask)
		if normalizeBlobMask(normalized) != normalized {
			t.Fatalf("normalized blob8 mask %#02x is not canonical: %#02x", mask, normalized)
		}
		if normalized == mask {
			canonicalCount++
		}
		normalizedMasks[normalized] = true
	}
	if canonicalCount != 47 {
		t.Fatalf("canonical blob8 mask count = %d, want 47", canonicalCount)
	}
	if len(normalizedMasks) != 47 {
		t.Fatalf("normalized blob8 mask image size = %d, want 47", len(normalizedMasks))
	}
}

func TestV5Blob8TerrainMaskClearsUnsupportedCorners(t *testing.T) {
	definition := testTerrainDefinition(TerrainNeighborBlob8, TerrainBoundaryEmpty, TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}})
	corners := []struct {
		name   string
		column int
		row    int
	}{
		{name: "NE", column: 2, row: 0},
		{name: "SE", column: 2, row: 2},
		{name: "SW", column: 0, row: 2},
		{name: "NW", column: 0, row: 0},
	}
	for _, corner := range corners {
		t.Run(corner.name, func(t *testing.T) {
			ids := make([]uint16, 9)
			ids[4] = 1
			ids[corner.row*3+corner.column] = 1
			if got := terrainMaskAt(terrainMapFromIDs(3, 3, ids), definition, TilesetGrid{Kind: TileGridOrthogonal}, 1, 1); got != 0 {
				t.Fatalf("isolated %s mask = %08b, want 00000000", corner.name, got)
			}
		})
	}

	supported := terrainMapFromIDs(3, 3, []uint16{0, 1, 1, 0, 1, 1, 0, 0, 0})
	if got := terrainMaskAt(supported, definition, TilesetGrid{Kind: TileGridOrthogonal}, 1, 1); got != 0b00000111 {
		t.Fatalf("supported NE mask = %08b, want 00000111", got)
	}
}

func TestV5Blob8StrictRuleAndCacheValidation(t *testing.T) {
	document := blob8CacheDocument()
	if err := Validate(document); err != nil {
		t.Fatalf("Validate() rejected canonical blob8 document: %v", err)
	}

	invalid := blob8CacheDocument()
	invalid.Tilesets[0].Terrains[0].Rules[0].Mask = 0b00000010
	if err := Validate(invalid); err == nil || err.Error() != "invalid tileset" {
		t.Fatalf("Validate() error = %v, want invalid tileset for noncanonical blob8 mask", err)
	}

	stale := blob8CacheDocument()
	centerOffset := (1*stale.Cels[0].Tilemap.Columns + 1) * 4
	binary.LittleEndian.PutUint32(stale.Cels[0].Tilemap.Tiles[centerOffset:], 2)
	stale.Cels[0].Pixels = renderTilemapCache(stale.Cels[0].Width, stale.Cels[0].Height, *stale.Cels[0].Tilemap, stale.Tilesets[0])
	if err := Validate(stale); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("Validate() error = %v, want invalid cel for stale normalized blob8 cache", err)
	}

	source := filepath.Join(t.TempDir(), "blob8.pixio")
	if err := WriteFile(source, document, nil); err != nil {
		t.Fatal(err)
	}
	loaded, _, err := ReadFile(source)
	if err != nil {
		t.Fatalf("ReadFile() rejected canonical blob8 document: %v", err)
	}
	if !bytes.Equal(loaded.Cels[0].TerrainMap.Terrains, document.Cels[0].TerrainMap.Terrains) || !bytes.Equal(loaded.Cels[0].Tilemap.Tiles, document.Cels[0].Tilemap.Tiles) || !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatal("canonical blob8 document did not round trip")
	}

	entries := readZipEntries(t, source)
	rewriteManifestEntries(t, entries, func(raw map[string]json.RawMessage) {
		var tilesets []map[string]json.RawMessage
		if err := json.Unmarshal(raw["tilesets"], &tilesets); err != nil {
			t.Fatal(err)
		}
		var terrains []map[string]json.RawMessage
		if err := json.Unmarshal(tilesets[0]["terrains"], &terrains); err != nil {
			t.Fatal(err)
		}
		var rules []map[string]json.RawMessage
		if err := json.Unmarshal(terrains[0]["rules"], &rules); err != nil {
			t.Fatal(err)
		}
		rules[0]["mask"] = json.RawMessage("2")
		var err error
		terrains[0]["rules"], err = json.Marshal(rules)
		if err != nil {
			t.Fatal(err)
		}
		tilesets[0]["terrains"], err = json.Marshal(terrains)
		if err != nil {
			t.Fatal(err)
		}
		raw["tilesets"], err = json.Marshal(tilesets)
		if err != nil {
			t.Fatal(err)
		}
	})
	invalidPath := filepath.Join(t.TempDir(), "invalid-blob8.pixio")
	writeZipEntries(t, invalidPath, entries)
	if _, _, err := ReadFile(invalidPath); err == nil {
		t.Fatal("ReadFile() accepted noncanonical blob8 rule mask")
	}
}

func TestV5TerrainCellsDistinguishUnspecifiedExplicitEmptyAndDefinitions(t *testing.T) {
	grid := TilesetGrid{Kind: TileGridOrthogonal}
	definition := testTerrainDefinition(
		TerrainNeighborEdge4,
		TerrainBoundaryEmpty,
		TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 7, Weight: 1}}},
	)
	terrainMap := terrainMapFromIDs(3, 1, []uint16{terrainUnspecifiedID, terrainEmptyID, 1})
	if got := resolveTerrainTile(terrainMap, []TerrainDefinition{definition}, grid, 0, 0, terrainUnspecifiedID); got != 0 {
		t.Fatalf("unspecified Terrain resolved to %d, want 0", got)
	}
	if got := resolveTerrainTile(terrainMap, []TerrainDefinition{definition}, grid, 1, 0, terrainEmptyID); got != 0 {
		t.Fatalf("explicit empty Terrain resolved to %d, want 0", got)
	}
	if got := resolveTerrainTile(terrainMap, []TerrainDefinition{definition}, grid, 2, 0, 1); got != 7 {
		t.Fatalf("defined Terrain resolved to %d, want 7", got)
	}

	document := terrainTestDocument(grid, TerrainNeighborEdge4)
	document.Tilesets[0].Terrains[0].ID = terrainEmptyID
	if err := Validate(document); err == nil || err.Error() != "invalid tileset" {
		t.Fatalf("Validate() error = %v, want reserved Terrain definition id rejection", err)
	}
	document = terrainTestDocument(grid, TerrainNeighborEdge4)
	binary.LittleEndian.PutUint16(document.Cels[0].TerrainMap.Terrains[0:2], terrainEmptyID)
	document.Cels[0].Tilemap.Tiles = renderTerrainTilemap(*document.Cels[0].TerrainMap, document.Tilesets[0])
	document.Cels[0].Pixels = renderTilemapCache(document.Cels[0].Width, document.Cels[0].Height, *document.Cels[0].Tilemap, document.Tilesets[0])
	if err := Validate(document); err != nil {
		t.Fatalf("Validate() rejected explicit empty Terrain cell: %v", err)
	}
}

func TestV5TerrainRoundTripCoversAllGridFamilies(t *testing.T) {
	cases := []struct {
		name string
		grid TilesetGrid
		mode TerrainNeighborMode
	}{
		{name: "orthogonal", grid: TilesetGrid{Kind: TileGridOrthogonal}, mode: TerrainNeighborEdge4},
		{name: "blob8", grid: TilesetGrid{Kind: TileGridOrthogonal}, mode: TerrainNeighborBlob8},
		{name: "isometric", grid: TilesetGrid{Kind: TileGridIsometric, CellWidth: 1, CellHeight: 1, AnchorX: 0, AnchorY: 1}, mode: TerrainNeighborEdge4},
		{name: "pointy odd-r", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"}, mode: TerrainNeighborEdge6},
		{name: "pointy even-r", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "even-r"}, mode: TerrainNeighborEdge6},
		{name: "flat odd-q", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "odd-q"}, mode: TerrainNeighborEdge6},
		{name: "flat even-q", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "even-q"}, mode: TerrainNeighborEdge6},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			document := terrainTestDocument(test.grid, test.mode)
			path := filepath.Join(t.TempDir(), "terrain.pixio")
			if err := WriteFile(path, document, nil); err != nil {
				t.Fatalf("WriteFile() rejected %s Terrain project: %v", test.name, err)
			}
			archive, err := zip.OpenReader(path)
			if err != nil {
				t.Fatal(err)
			}
			entries := make(map[string]bool, len(archive.File))
			var manifestData []byte
			for _, file := range archive.File {
				entries[file.Name] = true
				if file.Name == "manifest.json" {
					manifestData, err = readZipFile(file, maxManifestBytes)
					if err != nil {
						_ = archive.Close()
						t.Fatal(err)
					}
				}
			}
			if err := archive.Close(); err != nil {
				t.Fatal(err)
			}
			if !entries["terrainmaps/terrain-cel.bin"] {
				t.Fatalf("Terrain map resource is missing: %v", entries)
			}
			var stored manifest
			if err := json.Unmarshal(manifestData, &stored); err != nil {
				t.Fatal(err)
			}
			if len(stored.Tilesets) != 1 || len(stored.Tilesets[0].Terrains) != 1 || stored.Tilesets[0].Grid != test.grid {
				t.Fatalf("Terrain definitions/grid did not persist: %#v", stored.Tilesets)
			}
			if len(stored.Cels) != 1 || stored.Cels[0].TerrainMapPath != "terrainmaps/terrain-cel.bin" || stored.Cels[0].TerrainMapColumns != 4 || stored.Cels[0].TerrainMapRows != 4 || stored.Cels[0].TerrainMapSeed != 73 || !stored.Cels[0].terrainMapSeedPresent {
				t.Fatalf("Terrain map manifest metadata did not persist: %#v", stored.Cels)
			}
			loaded, _, err := ReadFile(path)
			if err != nil {
				t.Fatalf("ReadFile() rejected %s Terrain project: %v", test.name, err)
			}
			if loaded.Tilesets[0].Grid != document.Tilesets[0].Grid || len(loaded.Tilesets[0].Terrains) != 1 || loaded.Tilesets[0].Terrains[0].ID != 1 {
				t.Fatalf("Tileset Terrain data did not round trip: %#v", loaded.Tilesets[0])
			}
			if loaded.Cels[0].TerrainMap == nil || !bytes.Equal(loaded.Cels[0].TerrainMap.Terrains, document.Cels[0].TerrainMap.Terrains) || loaded.Cels[0].TerrainMap.Seed != document.Cels[0].TerrainMap.Seed || !bytes.Equal(loaded.Cels[0].Tilemap.Tiles, document.Cels[0].Tilemap.Tiles) || !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
				t.Fatalf("Terrain map/cache did not round trip: %#v", loaded.Cels[0])
			}
		})
	}
}

func TestV5NonOrthogonalTilemapUsesAuthoritativeDimensions(t *testing.T) {
	tileset := Tileset{
		ID:         "iso-tileset",
		Name:       "Isometric",
		TileWidth:  4,
		TileHeight: 2,
		Grid:       TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 2, AnchorX: 2, AnchorY: 2},
		Terrains:   []TerrainDefinition{},
		Tiles:      []Tile{{ID: 1, Pixels: []byte{255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255}}},
	}
	tilemap := &TilemapData{Columns: 3, Rows: 2, Tiles: make([]byte, 3*2*4)}
	for index := 0; index < len(tilemap.Tiles); index += 4 {
		binary.LittleEndian.PutUint32(tilemap.Tiles[index:], 1)
	}
	width, height := tilemapPixelSize(tileset, tilemap.Columns, tilemap.Rows)
	if width != 10 || height != 5 {
		t.Fatalf("isometric tilemap pixel size = %dx%d, want 10x5", width, height)
	}
	document := testDocument()
	document.Width, document.Height = width, height
	document.Tilesets = []Tileset{tileset}
	document.Layers[0] = Layer{ID: "iso-layer", Name: "Isometric", Visible: true, Opacity: 1, Kind: LayerKindTilemap, TilesetID: tileset.ID, BlendMode: BlendModeNormal, Role: LayerRoleStandard}
	document.ActiveLayerID = "iso-layer"
	document.Cels[0] = Cel{ID: "iso-cel", LinkID: "iso-link", LayerID: "iso-layer", FrameID: document.Frames[0].ID, Width: width, Height: height, Opacity: 1, Pixels: renderTilemapCache(width, height, *tilemap, tileset), Tilemap: tilemap}
	if err := Validate(document); err != nil {
		t.Fatalf("Validate() rejected authoritative non-orthogonal dimensions: %v", err)
	}
	path := filepath.Join(t.TempDir(), "isometric.pixio")
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatalf("WriteFile() rejected authoritative non-orthogonal dimensions: %v", err)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile() rejected authoritative non-orthogonal dimensions: %v", err)
	}
	if loaded.Cels[0].Tilemap.Columns != 3 || loaded.Cels[0].Tilemap.Rows != 2 || loaded.Cels[0].Width != width || loaded.Cels[0].Height != height || loaded.Tilesets[0].Grid != tileset.Grid {
		t.Fatalf("non-orthogonal Tilemap dimensions changed: %#v", loaded.Cels[0])
	}
}

func TestHexagonalTilemapBoundsCoverEveryCell(t *testing.T) {
	cases := []struct {
		name string
		grid TilesetGrid
	}{
		{name: "pointy odd-r", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"}},
		{name: "pointy even-r", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "even-r"}},
		{name: "flat odd-q", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "odd-q"}},
		{name: "flat even-q", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "even-q"}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			expectedSizes := map[string]map[int][2]int{
				"pointy": {1: {8, 6}, 2: {20, 11}, 3: {28, 15}, 5: {44, 24}},
				"flat":   {1: {8, 6}, 2: {14, 15}, 3: {20, 21}, 5: {32, 33}},
			}
			for _, size := range []int{1, 2, 3, 5} {
				tileset := Tileset{TileWidth: 8, TileHeight: 6, Grid: test.grid}
				width, height := tilemapPixelSize(tileset, size, size)
				layout := tilemapLayoutFor(tileset, size, size)
				const epsilon = 1e-9
				wantSize := expectedSizes[test.grid.Orientation][size]
				if width != wantSize[0] || height != wantSize[1] {
					t.Fatalf("%s %dx%d pixel size = %dx%d, want %dx%d", test.name, size, size, width, height, wantSize[0], wantSize[1])
				}

				for row := 0; row < size; row++ {
					for column := 0; column < size; column++ {
						cell := terrainCell{column: column, row: row}
						originX, originY := tilemapImageOrigin(tileset, layout, cell)
						if originX < -epsilon || originY < -epsilon {
							t.Fatalf("%s %dx%d image origin = (%v, %v), outside 0,0", test.name, size, size, originX, originY)
						}
						if originX+float64(tileset.TileWidth) > float64(width)+epsilon || originY+float64(tileset.TileHeight) > float64(height)+epsilon {
							t.Fatalf("%s %dx%d image bounds = (%v, %v)-(%v, %v), outside %dx%d", test.name, size, size, originX, originY, originX+float64(tileset.TileWidth), originY+float64(tileset.TileHeight), width, height)
						}

						for _, point := range hexagonalCellPolygonForTest(tileset, layout, cell) {
							if point[0] < -epsilon || point[1] < -epsilon || point[0] > float64(width)+epsilon || point[1] > float64(height)+epsilon {
								t.Fatalf("%s %dx%d polygon point = (%v, %v), outside %dx%d", test.name, size, size, point[0], point[1], width, height)
							}
						}
					}
				}
			}
		})
	}
}

func TestHexagonalTilemapLargeBoundsUseConstantCandidates(t *testing.T) {
	cases := []struct {
		name string
		grid TilesetGrid
		want [2]int
	}{
		{name: "pointy odd-r", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"}, want: [2]int{4100, 2306}},
		{name: "pointy even-r", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "even-r"}, want: [2]int{4100, 2306}},
		{name: "flat odd-q", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "odd-q"}, want: [2]int{3074, 3075}},
		{name: "flat even-q", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "even-q"}, want: [2]int{3074, 3075}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			const size = 512
			tileset := Tileset{TileWidth: 8, TileHeight: 6, Grid: test.grid}
			width, height := tilemapPixelSize(tileset, size, size)
			if [2]int{width, height} != test.want {
				t.Fatalf("%s pixel size = %dx%d, want %dx%d", test.name, width, height, test.want[0], test.want[1])
			}
			candidates := tilemapBoundsCells(tileset, size, size)
			if len(candidates) > 16 {
				t.Fatalf("%s candidate count = %d, want at most 16", test.name, len(candidates))
			}
			layout := tilemapLayoutFor(tileset, size, size)
			for _, cell := range candidates {
				originX, originY := tilemapImageOrigin(tileset, layout, cell)
				if originX < 0 || originY < 0 || originX+float64(tileset.TileWidth) > float64(width) || originY+float64(tileset.TileHeight) > float64(height) {
					t.Fatalf("%s candidate cell %#v image bounds exceed %dx%d: (%v, %v)", test.name, cell, width, height, originX, originY)
				}
			}
		})
	}
}

func hexagonalCellPolygonForTest(tileset Tileset, layout tilemapLayout, cell terrainCell) [][2]float64 {
	originX, originY := tilemapImageOrigin(tileset, layout, cell)
	centerX := originX + float64(tileset.TileWidth)/2
	centerY := originY + float64(tileset.TileHeight)/2
	halfWidth := float64(tileset.TileWidth) / 2
	halfHeight := float64(tileset.TileHeight) / 2
	if tileset.Grid.Orientation == "pointy" {
		return [][2]float64{
			{centerX, centerY - halfHeight},
			{centerX + halfWidth, centerY - halfHeight/2},
			{centerX + halfWidth, centerY + halfHeight/2},
			{centerX, centerY + halfHeight},
			{centerX - halfWidth, centerY + halfHeight/2},
			{centerX - halfWidth, centerY - halfHeight/2},
		}
	}
	return [][2]float64{
		{centerX + halfWidth, centerY},
		{centerX + halfWidth/2, centerY + halfHeight},
		{centerX - halfWidth/2, centerY + halfHeight},
		{centerX - halfWidth, centerY},
		{centerX - halfWidth/2, centerY - halfHeight},
		{centerX + halfWidth/2, centerY - halfHeight},
	}
}

func TestV5IsometricTilesetGridJSONIsStrict(t *testing.T) {
	valid := []byte(`{"kind":"isometric","cellWidth":4,"cellHeight":2,"anchorX":3,"anchorY":2}`)
	var grid TilesetGrid
	if err := json.Unmarshal(valid, &grid); err != nil {
		t.Fatalf("json.Unmarshal() rejected valid isometric grid: %v", err)
	}
	if grid != (TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 2, AnchorX: 3, AnchorY: 2}) {
		t.Fatalf("decoded isometric grid = %#v", grid)
	}
	encoded, err := json.Marshal(grid)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	if !exactJSONFields(fields, "kind", "cellWidth", "cellHeight", "anchorX", "anchorY") {
		t.Fatalf("encoded isometric grid fields = %s", encoded)
	}

	for _, test := range []struct {
		name string
		json string
	}{
		{name: "missing cellWidth", json: `{"kind":"isometric","cellHeight":2,"anchorX":3,"anchorY":2}`},
		{name: "missing anchorY", json: `{"kind":"isometric","cellWidth":4,"cellHeight":2,"anchorX":3}`},
		{name: "fractional cellWidth", json: `{"kind":"isometric","cellWidth":4.5,"cellHeight":2,"anchorX":3,"anchorY":2}`},
		{name: "negative cellHeight", json: `{"kind":"isometric","cellWidth":4,"cellHeight":-1,"anchorX":3,"anchorY":2}`},
		{name: "oversized cellWidth", json: `{"kind":"isometric","cellWidth":4097,"cellHeight":2,"anchorX":3,"anchorY":2}`},
		{name: "null anchorX", json: `{"kind":"isometric","cellWidth":4,"cellHeight":2,"anchorX":null,"anchorY":2}`},
		{name: "extra field", json: `{"kind":"isometric","cellWidth":4,"cellHeight":2,"anchorX":3,"anchorY":2,"offset":"odd-r"}`},
		{name: "legacy shape", json: `{"kind":"isometric"}`},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := json.Unmarshal([]byte(test.json), &grid); err == nil {
				t.Fatalf("json.Unmarshal() accepted %s", test.json)
			}
		})
	}
}

func TestV5IsometricTilemapUsesLogicalCellAndBottomAnchor(t *testing.T) {
	document := isometricOverflowDocument()
	if document.Width != 5 || document.Height != 4 {
		t.Fatalf("isometric tilemap pixel size = %dx%d, want 5x4", document.Width, document.Height)
	}
	if err := Validate(document); err != nil {
		t.Fatalf("Validate() rejected isometric overflow tilemap: %v", err)
	}

	pixels := document.Cels[0].Pixels
	if got := pixels[(0*document.Width+0)*4 : (0*document.Width+0)*4+4]; !bytes.Equal(got, []byte{255, 0, 0, 255}) {
		t.Fatalf("top-left rendered pixel = %v, want red", got)
	}
	if got := pixels[(1*document.Width+1)*4 : (1*document.Width+1)*4+4]; !bytes.Equal(got, []byte{0, 0, 255, 255}) {
		t.Fatalf("overlap rendered pixel = %v, want blue tile on top", got)
	}
	if got := pixels[(3*document.Width+4)*4 : (3*document.Width+4)*4+4]; !bytes.Equal(got, []byte{0, 0, 255, 255}) {
		t.Fatalf("overflow rendered pixel = %v, want blue tile", got)
	}
}

func TestV5NonOrthogonalTilemapCacheCompositesTransparentAndSemiTransparentPixels(t *testing.T) {
	cases := []struct {
		name string
		grid TilesetGrid
	}{
		{name: "isometric", grid: TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 4, AnchorX: 2, AnchorY: 4}},
		{name: "pointy hexagonal", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"}},
		{name: "flat hexagonal", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "odd-q"}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			fixture := nonOrthogonalTilemapFixture(test.grid, ColorModeRGBA)
			cache := fixture.document.Cels[0].Pixels
			if got := pixelAt(cache, fixture.partialX, fixture.partialY, fixture.document.Width); !bytes.Equal(got, []byte{110, 50, 140, 255}) {
				t.Fatalf("semi-transparent overlap pixel = %v, want [110 50 140 255]", got)
			}
			if got := pixelAt(cache, fixture.transparentX, fixture.transparentY, fixture.document.Width); !bytes.Equal(got, []byte{20, 60, 200, 255}) {
				t.Fatalf("transparent overlap pixel = %v, want background [20 60 200 255]", got)
			}
		})
	}
}

func TestV5NonOrthogonalIndexedTilemapCacheKeepsDiscreteAlpha(t *testing.T) {
	fixture := nonOrthogonalTilemapFixture(TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 4, AnchorX: 2, AnchorY: 4}, ColorModeIndexed)
	cache := fixture.document.Cels[0].Pixels
	if got := pixelAt(cache, fixture.partialX, fixture.partialY, fixture.document.Width); !bytes.Equal(got, []byte{200, 40, 80, 128}) {
		t.Fatalf("indexed semi-transparent overlap pixel = %v, want source [200 40 80 128]", got)
	}
	if got := pixelAt(cache, fixture.transparentX, fixture.transparentY, fixture.document.Width); !bytes.Equal(got, []byte{20, 60, 200, 255}) {
		t.Fatalf("indexed transparent overlap pixel = %v, want background [20 60 200 255]", got)
	}
}

func TestV5RejectsIndexedRGBADataThatDoesNotMatchAuthoritativeIndexes(t *testing.T) {
	document := testDocument()
	document.ColorMode = ColorModeIndexed
	document.Palette = Palette{ID: "palette", Name: "Indexed", Colors: []string{"#00000000", "#ff0000ff"}, TransparentIndex: 0}
	document.Cels[0].Indexes = []byte{1, 0, 0, 0}
	document.Cels[0].Pixels = indexedPixelsForTest(document.Cels[0].Indexes, document.Palette)
	document.Cels[0].Pixels[0] = 0
	if err := Validate(document); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("Validate() error = %v, want invalid cel for stale indexed cache", err)
	}

	fixture := nonOrthogonalTilemapFixture(
		TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 4, AnchorX: 2, AnchorY: 4},
		ColorModeIndexed,
	)
	fixture.document.Tilesets[0].Tiles[0].Pixels[0] ^= 0xff
	if err := Validate(fixture.document); err == nil || err.Error() != "invalid tileset" {
		t.Fatalf("Validate() error = %v, want invalid tileset for stale indexed cache", err)
	}
}

func TestV5IndexedTransparentSlotAllowsHiddenRGBWithoutAllowingOpaquePixels(t *testing.T) {
	document := testDocument()
	document.ColorMode = ColorModeIndexed
	document.Palette.Colors = []string{"#1f2024ff"}
	document.Cels[0].Indexes = make([]byte, 4)
	document.Cels[0].Pixels = make([]byte, 16)
	if err := Validate(document); err != nil {
		t.Fatalf("blank indexed document rejected: %v", err)
	}
	document.Cels[0].Pixels[3] = 255
	if err := Validate(document); err == nil {
		t.Fatal("accepted an opaque cache for the transparent palette index")
	}
}

func TestV5NonOrthogonalTilemapCacheRoundTripPreservesStrictV5Cache(t *testing.T) {
	cases := []struct {
		name      string
		grid      TilesetGrid
		colorMode string
	}{
		{name: "isometric rgba", grid: TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 4, AnchorX: 2, AnchorY: 4}, colorMode: ColorModeRGBA},
		{name: "isometric grayscale", grid: TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 4, AnchorX: 2, AnchorY: 4}, colorMode: ColorModeGrayscale},
		{name: "isometric indexed", grid: TilesetGrid{Kind: TileGridIsometric, CellWidth: 4, CellHeight: 4, AnchorX: 2, AnchorY: 4}, colorMode: ColorModeIndexed},
		{name: "pointy hexagonal", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "pointy", Offset: "odd-r"}, colorMode: ColorModeRGBA},
		{name: "flat hexagonal", grid: TilesetGrid{Kind: TileGridHexagonal, Orientation: "flat", Offset: "odd-q"}, colorMode: ColorModeRGBA},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			fixture := nonOrthogonalTilemapFixture(test.grid, test.colorMode)
			expected := append([]byte(nil), fixture.document.Cels[0].Pixels...)
			if err := Validate(fixture.document); err != nil {
				t.Fatalf("Validate() rejected strict v5 fixture: %v", err)
			}
			path := filepath.Join(t.TempDir(), "non-orthogonal.pixio")
			if err := WriteFile(path, fixture.document, nil); err != nil {
				t.Fatalf("WriteFile() rejected strict v5 fixture: %v", err)
			}
			loaded, _, err := ReadFile(path)
			if err != nil {
				t.Fatalf("ReadFile() rejected strict v5 fixture: %v", err)
			}
			if loaded.FormatVersion != FormatVersion {
				t.Fatalf("loaded format version = %d, want %d", loaded.FormatVersion, FormatVersion)
			}
			if loaded.Tilesets[0].Grid != test.grid {
				t.Fatalf("loaded tileset grid = %#v, want %#v", loaded.Tilesets[0].Grid, test.grid)
			}
			if !bytes.Equal(loaded.Cels[0].Pixels, expected) {
				t.Fatalf("tilemap cache changed across strict v5 write/read: got %v, want %v", loaded.Cels[0].Pixels, expected)
			}
			recomputed := renderTilemapCache(loaded.Width, loaded.Height, *loaded.Cels[0].Tilemap, loaded.Tilesets[0])
			if !bytes.Equal(loaded.Cels[0].Pixels, recomputed) {
				t.Fatalf("loaded tilemap cache does not match strict v5 render: got %v, want %v", loaded.Cels[0].Pixels, recomputed)
			}
		})
	}
}

func TestV5ReadRejectsCorruptIsometricGrid(t *testing.T) {
	source := filepath.Join(t.TempDir(), "source.pixio")
	if err := WriteFile(source, isometricOverflowDocument(), nil); err != nil {
		t.Fatal(err)
	}
	mutateGrid := func(t *testing.T, entries []zipTestEntry, mutate func(map[string]json.RawMessage)) {
		t.Helper()
		rewriteManifestEntries(t, entries, func(raw map[string]json.RawMessage) {
			var tilesets []map[string]json.RawMessage
			if err := json.Unmarshal(raw["tilesets"], &tilesets); err != nil {
				t.Fatal(err)
			}
			var grid map[string]json.RawMessage
			if err := json.Unmarshal(tilesets[0]["grid"], &grid); err != nil {
				t.Fatal(err)
			}
			mutate(grid)
			var err error
			tilesets[0]["grid"], err = json.Marshal(grid)
			if err != nil {
				t.Fatal(err)
			}
			raw["tilesets"], err = json.Marshal(tilesets)
			if err != nil {
				t.Fatal(err)
			}
		})
	}

	tests := []struct {
		name   string
		mutate func(map[string]json.RawMessage)
	}{
		{name: "missing cellHeight", mutate: func(grid map[string]json.RawMessage) { delete(grid, "cellHeight") }},
		{name: "fractional cellWidth", mutate: func(grid map[string]json.RawMessage) { grid["cellWidth"] = json.RawMessage("4.5") }},
		{name: "anchor outside tile", mutate: func(grid map[string]json.RawMessage) { grid["anchorX"] = json.RawMessage("5") }},
		{name: "extra field", mutate: func(grid map[string]json.RawMessage) { grid["offset"] = json.RawMessage(`"odd-r"`) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			entries := readZipEntries(t, source)
			mutateGrid(t, entries, test.mutate)
			path := filepath.Join(t.TempDir(), test.name+".pixio")
			writeZipEntries(t, path, entries)
			if _, _, err := ReadFile(path); err == nil {
				t.Fatal("ReadFile() accepted a corrupt isometric grid")
			}
		})
	}
}

func TestV5TerrainValidationRejectsInvalidDefinitionsAndCaches(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Document)
	}{
		{name: "terrain id", mutate: func(document *Document) { document.Tilesets[0].Terrains[0].ID = 0 }},
		{name: "duplicate terrain id", mutate: func(document *Document) {
			document.Tilesets[0].Terrains = append(document.Tilesets[0].Terrains, document.Tilesets[0].Terrains[0])
		}},
		{name: "grid mode", mutate: func(document *Document) { document.Tilesets[0].Terrains[0].NeighborMode = TerrainNeighborEdge6 }},
		{name: "mask", mutate: func(document *Document) { document.Tilesets[0].Terrains[0].Rules[0].Mask = 16 }},
		{name: "duplicate mask", mutate: func(document *Document) {
			document.Tilesets[0].Terrains[0].Rules = append(document.Tilesets[0].Terrains[0].Rules, document.Tilesets[0].Terrains[0].Rules[0])
		}},
		{name: "tile reference", mutate: func(document *Document) { document.Tilesets[0].Terrains[0].Rules[0].Candidates[0].TileID = 99 }},
		{name: "flags", mutate: func(document *Document) { document.Tilesets[0].Terrains[0].Rules[0].Candidates[0].Flags = 0x10000000 }},
		{name: "weight", mutate: func(document *Document) { document.Tilesets[0].Terrains[0].Rules[0].Candidates[0].Weight = 0 }},
		{name: "terrain id in map", mutate: func(document *Document) { binary.LittleEndian.PutUint16(document.Cels[0].TerrainMap.Terrains, 2) }},
		{name: "tile cache", mutate: func(document *Document) { document.Cels[0].Tilemap.Tiles[0] ^= 1 }},
		{name: "rgba cache", mutate: func(document *Document) { document.Cels[0].Pixels[0] ^= 1 }},
		{name: "non-tilemap Terrain map", mutate: func(document *Document) { document.Cels[0].Tilemap = nil }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := terrainTestDocument(TilesetGrid{Kind: TileGridOrthogonal}, TerrainNeighborEdge4)
			test.mutate(&document)
			if err := Validate(document); err == nil {
				t.Fatal("Validate() accepted invalid Terrain document")
			}
		})
	}

	linked := terrainTestDocument(TilesetGrid{Kind: TileGridOrthogonal}, TerrainNeighborEdge4)
	linked.Frames = append(linked.Frames, Frame{ID: "frame-2", DurationMS: 100})
	second := linked.Cels[0]
	second.ID = "terrain-cel-2"
	second.FrameID = "frame-2"
	second.TerrainMap = &TerrainMapData{Columns: 4, Rows: 4, Seed: 74, Terrains: make([]byte, 4*4*2)}
	second.Tilemap = &TilemapData{Columns: 4, Rows: 4, Tiles: make([]byte, 4*4*4)}
	second.Pixels = renderTilemapCache(4, 4, *second.Tilemap, linked.Tilesets[0])
	linked.Cels = append(linked.Cels, second)
	if err := Validate(linked); err == nil {
		t.Fatal("Validate() accepted linked Cels with different Terrain data")
	}
}

func TestV5ReadRejectsCorruptTerrainMapEntries(t *testing.T) {
	source := filepath.Join(t.TempDir(), "source.pixio")
	if err := WriteFile(source, terrainTestDocument(TilesetGrid{Kind: TileGridOrthogonal}, TerrainNeighborEdge4), nil); err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name   string
		mutate func(t *testing.T, entries []zipTestEntry)
	}{
		{name: "terrain id", mutate: func(t *testing.T, entries []zipTestEntry) {
			for index := range entries {
				if entries[index].name == "terrainmaps/terrain-cel.bin" {
					binary.LittleEndian.PutUint16(entries[index].data, 2)
				}
			}
		}},
		{name: "terrain path", mutate: func(t *testing.T, entries []zipTestEntry) {
			rewriteManifestEntries(t, entries, func(raw map[string]json.RawMessage) {
				var cels []map[string]json.RawMessage
				if err := json.Unmarshal(raw["cels"], &cels); err != nil {
					t.Fatal(err)
				}
				cels[0]["terrainmapPath"] = json.RawMessage(`"terrainmaps/wrong.bin"`)
				encoded, err := json.Marshal(cels)
				if err != nil {
					t.Fatal(err)
				}
				raw["cels"] = encoded
			})
		}},
		{name: "terrain cache", mutate: func(t *testing.T, entries []zipTestEntry) {
			for index := range entries {
				if entries[index].name == "tilemaps/terrain-cel.bin" {
					binary.LittleEndian.PutUint32(entries[index].data, 0)
				}
			}
		}},
		{name: "rgba cache", mutate: func(t *testing.T, entries []zipTestEntry) {
			for index := range entries {
				if entries[index].name == "cels/terrain-cel.png" {
					entries[index].data = encodePNG(t, image.NewUniform(color.RGBA{0, 0, 0, 255}), 4, 4)
				}
			}
		}},
		{name: "terrain map size", mutate: func(t *testing.T, entries []zipTestEntry) {
			for index := range entries {
				if entries[index].name == "terrainmaps/terrain-cel.bin" {
					entries[index].data = entries[index].data[:1]
				}
			}
		}},
		{name: "missing seed", mutate: func(t *testing.T, entries []zipTestEntry) {
			rewriteManifestEntries(t, entries, func(raw map[string]json.RawMessage) {
				var cels []map[string]json.RawMessage
				if err := json.Unmarshal(raw["cels"], &cels); err != nil {
					t.Fatal(err)
				}
				delete(cels[0], "terrainmapSeed")
				encoded, err := json.Marshal(cels)
				if err != nil {
					t.Fatal(err)
				}
				raw["cels"] = encoded
			})
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			entries := readZipEntries(t, source)
			test.mutate(t, entries)
			path := filepath.Join(t.TempDir(), test.name+".pixio")
			writeZipEntries(t, path, entries)
			if _, _, err := ReadFile(path); err == nil {
				t.Fatal("ReadFile() accepted a corrupt Terrain project")
			}
		})
	}
	entries := readZipEntries(t, source)
	entries = append(entries, zipTestEntry{name: "terrainmaps/unused.bin", data: []byte{0, 0}})
	path := filepath.Join(t.TempDir(), "unreferenced.pixio")
	writeZipEntries(t, path, entries)
	if _, _, err := ReadFile(path); err == nil || !strings.Contains(err.Error(), "invalid project entry") {
		t.Fatalf("ReadFile() error = %v, want invalid project entry", err)
	}
}

func TestV4RejectsLinkedIndexedCelMismatch(t *testing.T) {
	document := testDocument()
	document.ColorMode = ColorModeIndexed
	document.Cels[0].Indexes = []byte{0, 0, 0, 0}
	document.Frames = append(document.Frames, Frame{ID: "frame-2", DurationMS: 100})
	document.Cels = append(document.Cels, Cel{
		ID: "cel-2", LinkID: document.Cels[0].LinkID, LayerID: "layer", FrameID: "frame-2", Width: 2, Height: 2,
		Opacity: 1, Pixels: append([]byte(nil), document.Cels[0].Pixels...), Indexes: []byte{1, 1, 1, 1},
	})
	if err := WriteFile(filepath.Join(t.TempDir(), "mismatched-indexes.pixio"), document, nil); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("WriteFile() error = %v, want invalid cel", err)
	}
}

func TestV5RejectsV4Documents(t *testing.T) {
	document := testDocument()
	document.FormatVersion = 4
	if err := WriteFile(filepath.Join(t.TempDir(), "v4.pixio"), document, nil); err == nil || err.Error() != "unsupported .pixio format version 4" {
		t.Fatalf("WriteFile() error = %v, want v4 rejection", err)
	}
}

func TestWriteRejectsV3Documents(t *testing.T) {
	document := testDocument()
	document.FormatVersion = 3
	if err := WriteFile(filepath.Join(t.TempDir(), "v3.pixio"), document, nil); err == nil || err.Error() != "unsupported .pixio format version 3" {
		t.Fatalf("WriteFile() error = %v, want v3 rejection", err)
	}
}

func TestWriteRejectsV1Documents(t *testing.T) {
	document := testDocument()
	document.FormatVersion = 1
	if err := WriteFile(filepath.Join(t.TempDir(), "v1.pixio"), document, nil); err == nil || err.Error() != "unsupported .pixio format version 1" {
		t.Fatalf("WriteFile() error = %v, want v1 rejection", err)
	}
}

func TestWriteRejectsV2Documents(t *testing.T) {
	document := testDocument()
	document.FormatVersion = 2
	if err := WriteFile(filepath.Join(t.TempDir(), "v2.pixio"), document, nil); err == nil || err.Error() != "unsupported .pixio format version 2" {
		t.Fatalf("WriteFile() error = %v, want v2 rejection", err)
	}
}

func TestReadRejectsV1Manifest(t *testing.T) {
	document := testDocument()
	stored := manifest{
		FormatVersion:    1,
		Name:             document.Name,
		Width:            document.Width,
		Height:           document.Height,
		ColorMode:        document.ColorMode,
		ColorProfile:     manifestColorProfile{Type: document.ColorProfile.Type, Name: document.ColorProfile.Name},
		PixelAspectRatio: document.PixelAspectRatio,
		Palette:          document.Palette,
		Tilesets:         []manifestTileset{},
		Layers:           document.Layers,
		Frames:           document.Frames,
		Tags:             document.Tags,
		Slices:           document.Slices,
		Guides:           document.Guides,
		Settings:         document.Settings,
		Cels: []manifestCel{{
			ID: document.Cels[0].ID, LinkID: document.Cels[0].LinkID, LayerID: document.Cels[0].LayerID, FrameID: document.Cels[0].FrameID,
			Width: document.Cels[0].Width, Height: document.Cels[0].Height, Opacity: document.Cels[0].Opacity, ZIndex: document.Cels[0].ZIndex, Path: "cels/" + document.Cels[0].ID + ".png",
		}},
		ActiveLayerID: document.ActiveLayerID,
		ActiveFrameID: document.ActiveFrameID,
	}
	manifestData, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "v1.pixio")
	writeZipEntries(t, path, []zipTestEntry{{name: "manifest.json", data: manifestData}})
	if _, _, err := ReadFile(path); err == nil || err.Error() != "unsupported .pixio format version 1" {
		t.Fatalf("ReadFile() error = %v, want v1 rejection", err)
	}
}

func TestReadRejectsV2Manifest(t *testing.T) {
	document := testDocument()
	stored := manifest{
		FormatVersion:    2,
		Name:             document.Name,
		Width:            document.Width,
		Height:           document.Height,
		ColorMode:        document.ColorMode,
		ColorProfile:     manifestColorProfile{Type: document.ColorProfile.Type, Name: document.ColorProfile.Name},
		PixelAspectRatio: document.PixelAspectRatio,
		Palette:          document.Palette,
		Tilesets:         []manifestTileset{},
		Layers:           document.Layers,
		Frames:           document.Frames,
		Tags:             document.Tags,
		Slices:           document.Slices,
		Guides:           document.Guides,
		Settings:         document.Settings,
		Cels: []manifestCel{{
			ID: document.Cels[0].ID, LinkID: document.Cels[0].LinkID, LayerID: document.Cels[0].LayerID, FrameID: document.Cels[0].FrameID,
			Width: document.Cels[0].Width, Height: document.Cels[0].Height, Opacity: document.Cels[0].Opacity, ZIndex: document.Cels[0].ZIndex, Path: "cels/" + document.Cels[0].ID + ".png",
		}},
		ActiveLayerID: document.ActiveLayerID,
		ActiveFrameID: document.ActiveFrameID,
	}
	manifestData, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "v2.pixio")
	writeZipEntries(t, path, []zipTestEntry{{name: "manifest.json", data: manifestData}})
	if _, _, err := ReadFile(path); err == nil || err.Error() != "unsupported .pixio format version 2" {
		t.Fatalf("ReadFile() error = %v, want v2 rejection", err)
	}
}

func TestGeneratedThumbnailRespectsGroupVisibilityAndOpacity(t *testing.T) {
	document := Document{
		FormatVersion:    FormatVersion,
		Name:             "group-thumbnail.pixio",
		Width:            1,
		Height:           1,
		ColorMode:        "rgba",
		ColorProfile:     ColorProfile{Type: ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: PixelAspectRatio{Width: 1, Height: 1},
		Tilesets:         []Tileset{},
		Layers: []Layer{

			{ID: "bottom", Name: "Bottom", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: BlendModeNormal},
			{ID: "group", Name: "Group", Visible: true, Opacity: 0.5, Kind: LayerKindGroup, BlendMode: BlendModeNormal},
			{ID: "child", Name: "Child", Visible: true, Opacity: 1, Kind: LayerKindImage, ParentID: "group", BlendMode: BlendModeNormal},
		},
		Frames:        []Frame{{ID: "frame", DurationMS: 100}},
		ActiveLayerID: "child",
		ActiveFrameID: "frame",
		Cels: []Cel{
			{ID: "bottom-cel", LinkID: "bottom-link", LayerID: "bottom", FrameID: "frame", Width: 1, Height: 1, Opacity: 1, Pixels: []byte{255, 0, 0, 255}},
			{ID: "child-cel", LinkID: "child-link", LayerID: "child", FrameID: "frame", Width: 1, Height: 1, Opacity: 1, Pixels: []byte{0, 0, 255, 255}},
		},
	}

	thumbnail := decodeThumbnail(t, mustRenderThumbnail(t, document))
	if got := color.NRGBAModel.Convert(thumbnail.At(0, 0)).(color.NRGBA); got != (color.NRGBA{R: 128, B: 128, A: 255}) {
		t.Fatalf("visible group thumbnail pixel = %#v, want half-blue over red", got)
	}
	document.Layers[1].Visible = false
	thumbnail = decodeThumbnail(t, mustRenderThumbnail(t, document))
	if got := color.NRGBAModel.Convert(thumbnail.At(0, 0)).(color.NRGBA); got != (color.NRGBA{R: 255, A: 255}) {
		t.Fatalf("hidden group thumbnail pixel = %#v, want red", got)
	}
}

func TestGeneratedThumbnailClipsPartialAndOffsetCels(t *testing.T) {
	document := testDocument()
	document.Width = 4
	document.Height = 3
	document.Cels[0].X = -1
	document.Cels[0].Y = 2
	document.Cels[0].Width = 2
	document.Cels[0].Height = 1
	document.Cels[0].Pixels = []byte{
		255, 0, 0, 255,
		0, 255, 0, 255,
	}

	thumbnail := decodeThumbnail(t, mustRenderThumbnail(t, document))
	if got := color.NRGBAModel.Convert(thumbnail.At(0, 2)).(color.NRGBA); got != (color.NRGBA{G: 255, A: 255}) {
		t.Fatalf("visible clipped pixel = %#v, want green", got)
	}
	if got := color.NRGBAModel.Convert(thumbnail.At(1, 2)).(color.NRGBA); got != (color.NRGBA{}) {
		t.Fatalf("unpainted thumbnail pixel = %#v, want transparent", got)
	}
}

func TestGeneratedThumbnailSupportsBlendModes(t *testing.T) {
	for _, test := range []struct {
		mode BlendMode
		want color.NRGBA
	}{
		{mode: BlendModeNormal, want: color.NRGBA{R: 192, G: 160, B: 224, A: 255}},
		{mode: BlendModeMultiply, want: color.NRGBA{R: 48, G: 60, B: 112, A: 255}},
		{mode: BlendModeScreen, want: color.NRGBA{R: 208, G: 196, B: 240, A: 255}},
		{mode: BlendModeOverlay, want: color.NRGBA{R: 96, G: 120, B: 224, A: 255}},
	} {
		t.Run(string(test.mode), func(t *testing.T) {
			document := singlePixelBlendDocument(test.mode)
			thumbnail := decodeThumbnail(t, mustRenderThumbnail(t, document))
			if got := color.NRGBAModel.Convert(thumbnail.At(0, 0)).(color.NRGBA); got != test.want {
				t.Fatalf("%s thumbnail pixel = %#v, want %#v", test.mode, got, test.want)
			}
		})
	}
}

func TestGeneratedThumbnailSupportsNonSeparableBlendModes(t *testing.T) {
	for _, test := range []struct {
		mode BlendMode
		want color.NRGBA
	}{
		{mode: BlendModeHue, want: color.NRGBA{R: 77, G: 77, B: 77, A: 255}},
		{mode: BlendModeSaturation, want: color.NRGBA{R: 77, G: 77, B: 77, A: 255}},
		{mode: BlendModeColor, want: color.NRGBA{R: 77, G: 77, B: 77, A: 255}},
		{mode: BlendModeLuminosity, want: color.NRGBA{R: 255, G: 74, B: 74, A: 255}},
	} {
		t.Run(string(test.mode), func(t *testing.T) {
			document := singlePixelBlendDocument(test.mode)
			document.Cels[0].Pixels = []byte{255, 0, 0, 255}
			document.Cels[1].Pixels = []byte{128, 128, 128, 255}
			thumbnail := decodeThumbnail(t, mustRenderThumbnail(t, document))
			if got := color.NRGBAModel.Convert(thumbnail.At(0, 0)).(color.NRGBA); got != test.want {
				t.Fatalf("%s thumbnail pixel = %#v, want %#v", test.mode, got, test.want)
			}
		})
	}
}

func TestValidationRejectsGroupCelsAndCountsOnlyImageLayers(t *testing.T) {
	document := testDocument()
	document.Layers = append(document.Layers, Layer{ID: "group", Name: "Group", Visible: true, Opacity: 1, Kind: LayerKindGroup, BlendMode: BlendModeNormal, Role: LayerRoleStandard})
	if err := WriteFile(filepath.Join(t.TempDir(), "group.pixio"), document, nil); err != nil {
		t.Fatalf("group without cel should be valid: %v", err)
	}

	document.Cels = append(document.Cels, Cel{ID: "group-cel", LinkID: "group-link", LayerID: "group", FrameID: "frame", Width: 2, Height: 2, Opacity: 1, Pixels: make([]byte, 16)})
	if err := WriteFile(filepath.Join(t.TempDir(), "group-cel.pixio"), document, nil); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("group cel error = %v, want invalid cel", err)
	}
}

func TestValidationRejectsInvalidLayerParentsAndCycles(t *testing.T) {
	parents := []struct {
		name   string
		layers []Layer
	}{
		{
			name: "image parent",
			layers: []Layer{
				{ID: "image", Name: "Image", Visible: true, Opacity: 1, Kind: LayerKindImage, ParentID: "other", BlendMode: BlendModeNormal},
				{ID: "other", Name: "Other", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: BlendModeNormal},
			},
		},
		{
			name:   "unknown parent",
			layers: []Layer{{ID: "image", Name: "Image", Visible: true, Opacity: 1, Kind: LayerKindImage, ParentID: "missing", BlendMode: BlendModeNormal}},
		},
		{
			name:   "self parent",
			layers: []Layer{{ID: "group", Name: "Group", Visible: true, Opacity: 1, Kind: LayerKindGroup, ParentID: "group", BlendMode: BlendModeNormal}},
		},
		{
			name: "cycle",
			layers: []Layer{
				{ID: "group-a", Name: "A", Visible: true, Opacity: 1, Kind: LayerKindGroup, ParentID: "group-b", BlendMode: BlendModeNormal},
				{ID: "group-b", Name: "B", Visible: true, Opacity: 1, Kind: LayerKindGroup, ParentID: "group-a", BlendMode: BlendModeNormal},
			},
		},
	}
	for _, test := range parents {
		t.Run(test.name, func(t *testing.T) {
			document := hierarchyDocument(test.layers)
			if err := WriteFile(filepath.Join(t.TempDir(), "invalid-parent.pixio"), document, nil); err == nil || err.Error() != "invalid layer" {
				t.Fatalf("WriteFile() error = %v, want invalid layer", err)
			}
		})
	}
}

func TestValidationRejectsInvalidTagsAndLinkedCelMismatches(t *testing.T) {
	document := testDocument()
	document.Tags = []FrameTag{{ID: "tag", Name: "Bad", FromFrameID: "missing", ToFrameID: "frame", Direction: TagDirectionForward, Color: "#fff"}}
	if err := WriteFile(filepath.Join(t.TempDir(), "bad-tag.pixio"), document, nil); err == nil || err.Error() != "invalid frame tag" {
		t.Fatalf("invalid tag error = %v, want invalid frame tag", err)
	}

	document = testDocument()
	document.Frames = append(document.Frames, Frame{ID: "frame-2", DurationMS: 100})
	document.Cels = append(document.Cels, Cel{ID: "cel-2", LinkID: "link", LayerID: "layer", FrameID: "frame-2", Width: 2, Height: 2, Opacity: 1, Pixels: []byte{0, 0, 255, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 0}})
	if err := WriteFile(filepath.Join(t.TempDir(), "bad-link.pixio"), document, nil); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("linked cel error = %v, want invalid cel", err)
	}
}

func TestValidationRejectsInvalidCurrentFormatMetadata(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Document)
		wantErr string
	}{
		{
			name: "blank layer name",
			mutate: func(document *Document) {
				document.Layers[0].Name = " \t\n"
			},
			wantErr: "invalid layer",
		},
		{
			name: "blank tag name",
			mutate: func(document *Document) {
				document.Tags = []FrameTag{{ID: "tag", Name: "  ", FromFrameID: "frame", ToFrameID: "frame", Direction: TagDirectionForward, Color: "#123456"}}
			},
			wantErr: "invalid frame tag",
		},
		{
			name: "invalid tag color",
			mutate: func(document *Document) {
				document.Tags = []FrameTag{{ID: "tag", Name: "Loop", FromFrameID: "frame", ToFrameID: "frame", Direction: TagDirectionForward, Color: "#12345g"}}
			},
			wantErr: "invalid frame tag",
		},
		{
			name: "null palette colors",
			mutate: func(document *Document) {
				document.Palette.Colors = nil
			},
			wantErr: "invalid palette",
		},
		{
			name: "null frame tags",
			mutate: func(document *Document) {
				document.Tags = nil
			},
			wantErr: "invalid project document",
		},
		{
			name: "too many palette colors",
			mutate: func(document *Document) {
				document.Palette.Colors = make([]string, 257)
				for index := range document.Palette.Colors {
					document.Palette.Colors[index] = "#000000"
				}
			},
			wantErr: "invalid palette",
		},
		{
			name: "invalid palette color",
			mutate: func(document *Document) {
				document.Palette.Colors = []string{"#000000", "transparent"}
			},
			wantErr: "invalid palette",
		},
		{
			name: "invalid tag repeat",
			mutate: func(document *Document) {
				document.Tags = []FrameTag{{ID: "tag", Name: "Loop", FromFrameID: "frame", ToFrameID: "frame", Direction: TagDirectionForward, Color: "#123456", Repeat: 65536}}
			},
			wantErr: "invalid frame tag",
		},
		{
			name: "invalid onion frame count",
			mutate: func(document *Document) {
				document.Settings.OnionNextFrames = 17
			},
			wantErr: "invalid settings",
		},
		{
			name: "invalid onion opacity",
			mutate: func(document *Document) {
				document.Settings.OnionOpacity = 1.1
			},
			wantErr: "invalid settings",
		},
		{
			name: "invalid onion color",
			mutate: func(document *Document) {
				document.Settings.OnionPreviousColor = "#12345g"
			},
			wantErr: "invalid settings",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			document := testDocument()
			test.mutate(&document)
			if err := WriteFile(filepath.Join(t.TempDir(), "invalid.pixio"), document, nil); err == nil || err.Error() != test.wantErr {
				t.Fatalf("WriteFile() error = %v, want %q", err, test.wantErr)
			}
		})
	}
}

func TestWriteReadRoundTripAcceptsUppercaseExtension(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sprite.PIXIO")
	document := testDocument()
	if err := WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}
	loaded, _, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatal("pixels did not round trip")
	}
}

func TestWriteReadPreservesExplicitThumbnail(t *testing.T) {
	path := filepath.Join(t.TempDir(), "thumbnail.pixio")
	thumbnail := encodePNG(t, image.NewUniform(color.NRGBA{B: 255, A: 255}), 3, 2)
	if err := WriteFile(path, testDocument(), thumbnail); err != nil {
		t.Fatal(err)
	}
	_, loadedThumbnail, err := ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(loadedThumbnail, thumbnail) {
		t.Fatal("explicit thumbnail did not round trip unchanged")
	}
}

func TestGeneratedThumbnailScalesAndCompositesActiveFrame(t *testing.T) {
	document := Document{
		FormatVersion:    FormatVersion,
		Name:             "thumbnail.pixio",
		Width:            512,
		Height:           256,
		ColorMode:        "rgba",
		ColorProfile:     ColorProfile{Type: ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: PixelAspectRatio{Width: 1, Height: 1},
		Tilesets:         []Tileset{},
		Layers: []Layer{
			{ID: "bottom", Name: "Bottom", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: BlendModeNormal},
			{ID: "top", Name: "Top", Visible: true, Opacity: 0.5, Kind: LayerKindImage, BlendMode: BlendModeNormal},
		},
		Frames:        []Frame{{ID: "frame", DurationMS: 100}},
		ActiveLayerID: "top",
		ActiveFrameID: "frame",
	}
	pixelCount := document.Width * document.Height
	bottom := make([]byte, pixelCount*4)
	top := make([]byte, pixelCount*4)
	for index := 0; index < pixelCount; index++ {
		bottom[index*4] = 255
		bottom[index*4+3] = 255
		top[index*4+2] = 255
		top[index*4+3] = 255
	}
	document.Cels = []Cel{
		{ID: "bottom-cel", LinkID: "bottom-link", LayerID: "bottom", FrameID: "frame", Width: document.Width, Height: document.Height, Opacity: 1, Pixels: bottom},
		{ID: "top-cel", LinkID: "top-link", LayerID: "top", FrameID: "frame", Width: document.Width, Height: document.Height, Opacity: 1, Pixels: top},
	}

	encoded, err := renderThumbnail(document)
	if err != nil {
		t.Fatal(err)
	}
	preview, err := png.Decode(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	if preview.Bounds().Dx() != 256 || preview.Bounds().Dy() != 128 {
		t.Fatalf("thumbnail dimensions = %dx%d, want 256x128", preview.Bounds().Dx(), preview.Bounds().Dy())
	}
	if got := color.NRGBAModel.Convert(preview.At(0, 0)).(color.NRGBA); got != (color.NRGBA{R: 128, B: 128, A: 255}) {
		t.Fatalf("composited thumbnail pixel = %#v, want half-blue over red", got)
	}
}

func TestReadRejectsMissingManifest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.pixio")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	entry, err := archive.Create("other.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if _, _, err := ReadFile(path); err == nil {
		t.Fatal("expected malformed project error")
	}
}

func TestReadRejectsUnsafeArchiveEntries(t *testing.T) {
	for _, name := range []string{
		"../manifest.json",
		"cels/../cel.png",
		"cels\\cel.png",
		"/manifest.json",
	} {
		t.Run(name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "unsafe.pixio")
			writeZipEntries(t, path, []zipTestEntry{{name: name, data: []byte("x")}})

			if _, _, err := ReadFile(path); err == nil || !strings.Contains(err.Error(), "invalid project entry") {
				t.Fatalf("ReadFile() error = %v, want invalid project entry", err)
			}
		})
	}
}

func TestReadRejectsDuplicateArchiveEntries(t *testing.T) {
	path := filepath.Join(t.TempDir(), "duplicate.pixio")
	writeZipEntries(t, path, []zipTestEntry{
		{name: "manifest.json", data: []byte("{}")},
		{name: "manifest.json", data: []byte("{}")},
	})

	if _, _, err := ReadFile(path); err == nil || !strings.Contains(err.Error(), "duplicate project entry") {
		t.Fatalf("ReadFile() error = %v, want duplicate project entry", err)
	}
}

func TestReadRejectsMissingCelImageReference(t *testing.T) {
	document := testDocument()
	manifestData, err := json.Marshal(manifest{
		FormatVersion:    document.FormatVersion,
		Name:             document.Name,
		Width:            document.Width,
		Height:           document.Height,
		ColorMode:        document.ColorMode,
		ColorProfile:     manifestColorProfile{Type: document.ColorProfile.Type, Name: document.ColorProfile.Name},
		PixelAspectRatio: document.PixelAspectRatio,
		Palette:          document.Palette,
		Tilesets:         []manifestTileset{},
		Layers:           document.Layers,
		Frames:           document.Frames,
		Tags:             document.Tags,
		Slices:           document.Slices,
		Guides:           document.Guides,
		Settings:         document.Settings,
		Cels: []manifestCel{{
			ID:      document.Cels[0].ID,
			LinkID:  document.Cels[0].LinkID,
			LayerID: document.Cels[0].LayerID,
			FrameID: document.Cels[0].FrameID,
			Width:   document.Cels[0].Width,
			Height:  document.Cels[0].Height,
			Opacity: document.Cels[0].Opacity,
			ZIndex:  document.Cels[0].ZIndex,
			Path:    "cels/" + document.Cels[0].ID + ".png",
		}},
		ActiveLayerID: document.ActiveLayerID,
		ActiveFrameID: document.ActiveFrameID,
	})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "missing-cel.pixio")
	writeZipEntries(t, path, []zipTestEntry{{name: "manifest.json", data: manifestData}})

	if _, _, err := ReadFile(path); err == nil || !strings.Contains(err.Error(), "missing cel image") {
		t.Fatalf("ReadFile() error = %v, want missing cel image", err)
	}
}

func TestReadValidatesManifestBeforeDecodingCel(t *testing.T) {
	document := testDocument()
	stored := manifest{
		FormatVersion:    document.FormatVersion,
		Name:             document.Name,
		Width:            maxCanvasDimension + 1,
		Height:           1,
		ColorMode:        document.ColorMode,
		ColorProfile:     manifestColorProfile{Type: document.ColorProfile.Type, Name: document.ColorProfile.Name},
		PixelAspectRatio: document.PixelAspectRatio,
		Palette:          document.Palette,
		Tilesets:         []manifestTileset{},
		Layers:           document.Layers,
		Frames:           document.Frames,
		Tags:             document.Tags,
		Slices:           document.Slices,
		Guides:           document.Guides,
		Settings:         document.Settings,
		Cels: []manifestCel{{
			ID: document.Cels[0].ID, LayerID: document.Cels[0].LayerID, FrameID: document.Cels[0].FrameID,
			Width: maxCanvasDimension + 1, Height: 1, Opacity: document.Cels[0].Opacity, ZIndex: document.Cels[0].ZIndex, Path: "cels/cel.png",
		}},
		ActiveLayerID: document.ActiveLayerID,
		ActiveFrameID: document.ActiveFrameID,
	}
	manifestData, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "oversized.pixio")
	writeZipEntries(t, path, []zipTestEntry{
		{name: "manifest.json", data: manifestData},
		{name: "cels/cel.png", data: []byte("not a PNG")},
	})

	if _, _, err := ReadFile(path); err == nil || err.Error() != "invalid canvas dimensions" {
		t.Fatalf("ReadFile() error = %v, want manifest dimension rejection before PNG decode", err)
	}
}

func TestReadRejectsCelPathAliases(t *testing.T) {
	document := testDocument()
	stored := manifest{
		FormatVersion:    document.FormatVersion,
		Name:             document.Name,
		Width:            document.Width,
		Height:           document.Height,
		ColorMode:        document.ColorMode,
		ColorProfile:     manifestColorProfile{Type: document.ColorProfile.Type, Name: document.ColorProfile.Name},
		PixelAspectRatio: document.PixelAspectRatio,
		Palette:          document.Palette,
		Tilesets:         []manifestTileset{},
		Layers:           document.Layers,
		Frames:           document.Frames,
		Tags:             document.Tags,
		Slices:           document.Slices,
		Guides:           document.Guides,
		Settings:         document.Settings,
		Cels: []manifestCel{{
			ID: document.Cels[0].ID, LayerID: document.Cels[0].LayerID, FrameID: document.Cels[0].FrameID,
			Width: document.Width, Height: document.Height, Opacity: document.Cels[0].Opacity, ZIndex: document.Cels[0].ZIndex, Path: "thumbnail.png",
		}},
		ActiveLayerID: document.ActiveLayerID,
		ActiveFrameID: document.ActiveFrameID,
	}
	manifestData, err := json.Marshal(stored)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "aliased.pixio")
	writeZipEntries(t, path, []zipTestEntry{
		{name: "manifest.json", data: manifestData},
		{name: "thumbnail.png", data: encodePNG(t, image.NewUniform(color.NRGBA{A: 255}), 2, 2)},
	})

	if _, _, err := ReadFile(path); err == nil || err.Error() != "invalid cel" {
		t.Fatalf("ReadFile() error = %v, want invalid cel path", err)
	}
}

func TestWriteRejectsInvalidDocument(t *testing.T) {
	document := testDocument()
	document.Cels[0].Pixels = document.Cels[0].Pixels[:3]
	if err := WriteFile(filepath.Join(t.TempDir(), "bad.pixio"), document, nil); err == nil {
		t.Fatal("expected validation error")
	}
}

func TestWriteRejectsUnsafeCelIDsAndOversizedCanvas(t *testing.T) {
	for _, id := range []string{"../cel", "cel/child", `cel\child`, "cel..backup"} {
		t.Run(id, func(t *testing.T) {
			document := testDocument()
			document.Cels[0].ID = id
			if err := WriteFile(filepath.Join(t.TempDir(), "bad.pixio"), document, nil); err == nil || err.Error() != "invalid cel" {
				t.Fatalf("WriteFile() error = %v, want invalid cel", err)
			}
		})
	}

	document := testDocument()
	document.Width = maxCanvasDimension + 1
	document.Cels[0].Width = document.Width
	document.Cels[0].Pixels = make([]byte, document.Width*document.Height*4)
	if err := WriteFile(filepath.Join(t.TempDir(), "too-large.pixio"), document, nil); err == nil || err.Error() != "invalid canvas dimensions" {
		t.Fatalf("WriteFile() error = %v, want invalid canvas dimensions", err)
	}
}

func TestWriteRejectsInvalidOrOversizedThumbnail(t *testing.T) {
	path := filepath.Join(t.TempDir(), "thumbnail.pixio")
	if err := WriteFile(path, testDocument(), make([]byte, maxThumbnailBytes+1)); err == nil || !strings.Contains(err.Error(), "thumbnail exceeds") {
		t.Fatalf("WriteFile() oversized thumbnail error = %v", err)
	}
	truncated := encodePNG(t, image.NewUniform(color.NRGBA{A: 255}), 1, 1)
	truncated = truncated[:33]
	if err := WriteFile(path, testDocument(), truncated); err == nil || err.Error() != "thumbnail is not a PNG image" {
		t.Fatalf("WriteFile() truncated thumbnail error = %v", err)
	}
}

func TestWriteFailureKeepsExistingProject(t *testing.T) {
	path := filepath.Join(t.TempDir(), "existing.pixio")
	want := []byte("existing project")
	if err := os.WriteFile(path, want, 0600); err != nil {
		t.Fatal(err)
	}
	document := testDocument()
	document.Name = strings.Repeat("x", maxManifestBytes+1)
	if err := WriteFile(path, document, nil); err == nil || !strings.Contains(err.Error(), "manifest exceeds") {
		t.Fatalf("WriteFile() error = %v, want oversized manifest", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatal("failed write replaced the existing project")
	}
	matches, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".pixio-*.tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary projects remain after failure: %v", matches)
	}
}

func mustRenderThumbnail(t *testing.T, document Document) []byte {
	t.Helper()
	thumbnail, err := renderThumbnail(document)
	if err != nil {
		t.Fatal(err)
	}
	return thumbnail
}

func decodeThumbnail(t *testing.T, encoded []byte) image.Image {
	t.Helper()
	thumbnail, err := png.Decode(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	return thumbnail
}

func singlePixelBlendDocument(mode BlendMode) Document {
	return Document{
		FormatVersion:    FormatVersion,
		Name:             "blend.pixio",
		Width:            1,
		Height:           1,
		ColorMode:        "rgba",
		ColorProfile:     ColorProfile{Type: ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: PixelAspectRatio{Width: 1, Height: 1},
		Palette:          Palette{ID: "palette", Name: "Default", Colors: []string{"#000000"}},
		Tilesets:         []Tileset{},
		Layers: []Layer{
			{ID: "bottom", Name: "Bottom", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: BlendModeNormal},
			{ID: "top", Name: "Top", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: mode},
		},
		Frames:        []Frame{{ID: "frame", DurationMS: 100}},
		ActiveLayerID: "top",
		ActiveFrameID: "frame",
		Cels: []Cel{
			{ID: "bottom-cel", LinkID: "bottom-link", LayerID: "bottom", FrameID: "frame", Width: 1, Height: 1, Opacity: 1, Pixels: []byte{64, 96, 128, 255}},
			{ID: "top-cel", LinkID: "top-link", LayerID: "top", FrameID: "frame", Width: 1, Height: 1, Opacity: 1, Pixels: []byte{192, 160, 224, 255}},
		},
	}
}

func testTerrainDefinition(mode TerrainNeighborMode, boundary TerrainBoundary, rules ...TerrainRule) TerrainDefinition {
	return TerrainDefinition{ID: 1, Name: "Grass", Color: "#5cb85cff", NeighborMode: mode, Boundary: boundary, Rules: rules}
}

func terrainMapFromIDs(columns, rows int, ids []uint16) TerrainMapData {
	if len(ids) != columns*rows {
		panic("invalid Terrain test map")
	}
	terrainMap := TerrainMapData{Columns: columns, Rows: rows, Terrains: make([]byte, len(ids)*2)}
	for index, id := range ids {
		binary.LittleEndian.PutUint16(terrainMap.Terrains[index*2:], id)
	}
	return terrainMap
}

func isometricOverflowDocument() Document {
	document := testDocument()
	tileset := Tileset{
		ID:         "iso-overflow-tileset",
		Name:       "Isometric Overflow",
		TileWidth:  4,
		TileHeight: 3,
		Grid:       TilesetGrid{Kind: TileGridIsometric, CellWidth: 2, CellHeight: 2, AnchorX: 1, AnchorY: 3},
		Terrains:   []TerrainDefinition{},
		Tiles: []Tile{
			{ID: 1, Pixels: solidTilePixels(4, 3, []byte{255, 0, 0, 255})},
			{ID: 2, Pixels: solidTilePixels(4, 3, []byte{0, 0, 255, 255})},
		},
	}
	tilemap := &TilemapData{Columns: 2, Rows: 1, Tiles: make([]byte, 2*4)}
	binary.LittleEndian.PutUint32(tilemap.Tiles[0:], 1)
	binary.LittleEndian.PutUint32(tilemap.Tiles[4:], 2)
	document.Width, document.Height = tilemapPixelSize(tileset, tilemap.Columns, tilemap.Rows)
	document.Tilesets = []Tileset{tileset}
	document.Layers[0] = Layer{ID: "iso-overflow-layer", Name: "Isometric Overflow", Visible: true, Opacity: 1, Kind: LayerKindTilemap, TilesetID: tileset.ID, BlendMode: BlendModeNormal, Role: LayerRoleStandard}
	document.ActiveLayerID = document.Layers[0].ID
	document.Cels[0] = Cel{ID: "iso-overflow-cel", LinkID: "iso-overflow-link", LayerID: document.Layers[0].ID, FrameID: document.Frames[0].ID, Width: document.Width, Height: document.Height, Opacity: 1, Pixels: renderTilemapCache(document.Width, document.Height, *tilemap, tileset), Tilemap: tilemap}
	return document
}

type tilemapOverlapFixture struct {
	document                   Document
	partialX, partialY         int
	transparentX, transparentY int
}

func nonOrthogonalTilemapFixture(grid TilesetGrid, colorMode string) tilemapOverlapFixture {
	const tileWidth, tileHeight = 4, 4
	columns, rows := 2, 1
	foregroundCell := terrainCell{column: 1, row: 0}
	if grid.Kind == TileGridHexagonal && grid.Orientation == "pointy" {
		columns, rows = 1, 2
		foregroundCell = terrainCell{column: 0, row: 1}
	}
	backgroundCell := terrainCell{column: 0, row: 0}

	layout := tilemapLayoutFor(Tileset{TileWidth: tileWidth, TileHeight: tileHeight, Grid: grid}, columns, rows)
	backgroundOriginX, backgroundOriginY := tilemapImageOrigin(Tileset{TileWidth: tileWidth, TileHeight: tileHeight, Grid: grid}, layout, backgroundCell)
	foregroundOriginX, foregroundOriginY := tilemapImageOrigin(Tileset{TileWidth: tileWidth, TileHeight: tileHeight, Grid: grid}, layout, foregroundCell)
	backgroundX, backgroundY := int(math.Round(backgroundOriginX)), int(math.Round(backgroundOriginY))
	foregroundX, foregroundY := int(math.Round(foregroundOriginX)), int(math.Round(foregroundOriginY))
	overlapLeft := max(backgroundX, foregroundX)
	overlapTop := max(backgroundY, foregroundY)
	overlapRight := min(backgroundX+tileWidth, foregroundX+tileWidth) - 1
	overlapBottom := min(backgroundY+tileHeight, foregroundY+tileHeight) - 1
	if overlapLeft > overlapRight || overlapTop > overlapBottom {
		panic("non-orthogonal tilemap fixture has no overlap")
	}
	partialX, partialY := overlapLeft, overlapTop
	transparentX, transparentY := overlapLeft, overlapTop
	if transparentX < overlapRight {
		transparentX++
	} else {
		transparentY++
	}

	foregroundPixels := bytes.Repeat([]byte{9, 8, 7, 0}, tileWidth*tileHeight)
	partialIndex := ((partialY-foregroundY)*tileWidth + (partialX - foregroundX)) * 4
	transparentIndex := ((transparentY-foregroundY)*tileWidth + (transparentX - foregroundX)) * 4
	copy(foregroundPixels[partialIndex:partialIndex+4], []byte{200, 40, 80, 128})
	copy(foregroundPixels[transparentIndex:transparentIndex+4], []byte{250, 240, 230, 0})

	tileset := Tileset{
		ID:         "overlap-tileset",
		Name:       "Overlap",
		TileWidth:  tileWidth,
		TileHeight: tileHeight,
		Grid:       grid,
		Terrains:   []TerrainDefinition{},
		Tiles: []Tile{
			{ID: 1, Pixels: solidTilePixels(tileWidth, tileHeight, []byte{20, 60, 200, 255})},
			{ID: 2, Pixels: foregroundPixels},
		},
	}
	if colorMode == ColorModeIndexed {
		tileset.Tiles[0].Indexes = bytes.Repeat([]byte{1}, tileWidth*tileHeight)
		tileset.Tiles[1].Indexes = make([]byte, tileWidth*tileHeight)
		tileset.Tiles[1].Indexes[partialIndex/4] = 2
	}
	tilemap := &TilemapData{Columns: columns, Rows: rows, Tiles: make([]byte, columns*rows*4)}
	binary.LittleEndian.PutUint32(tilemap.Tiles[(backgroundCell.row*columns+backgroundCell.column)*4:], 1)
	binary.LittleEndian.PutUint32(tilemap.Tiles[(foregroundCell.row*columns+foregroundCell.column)*4:], 2)
	width, height := tilemapPixelSize(tileset, columns, rows)

	document := testDocument()
	document.Name = "non-orthogonal-overlap.pixio"
	document.ColorMode = colorMode
	document.Width, document.Height = width, height
	document.Tilesets = []Tileset{tileset}
	document.Layers[0] = Layer{ID: "overlap-layer", Name: "Overlap", Visible: true, Opacity: 1, Kind: LayerKindTilemap, TilesetID: tileset.ID, BlendMode: BlendModeNormal, Role: LayerRoleStandard}
	document.ActiveLayerID = document.Layers[0].ID
	var indexes []byte
	if colorMode == ColorModeIndexed {
		document.Palette = Palette{ID: "palette", Name: "Overlap", Colors: []string{"#00000000", "#143cc8ff", "#c8285080"}, TransparentIndex: 0}
		tileset.Tiles[0].Pixels = indexedPixelsForTest(tileset.Tiles[0].Indexes, document.Palette)
		tileset.Tiles[1].Pixels = indexedPixelsForTest(tileset.Tiles[1].Indexes, document.Palette)
		document.Tilesets = []Tileset{tileset}
		cache := renderTilemapCache(width, height, *tilemap, tileset)
		indexes = indexesForExactPixelsTest(cache, document.Palette)
	}
	document.Cels[0] = Cel{ID: "overlap-cel", LinkID: "overlap-link", LayerID: document.Layers[0].ID, FrameID: document.Frames[0].ID, Width: width, Height: height, Opacity: 1, Pixels: renderTilemapCache(width, height, *tilemap, tileset), Indexes: indexes, Tilemap: tilemap}
	return tilemapOverlapFixture{document: document, partialX: partialX, partialY: partialY, transparentX: transparentX, transparentY: transparentY}
}

func pixelAt(pixels []byte, x, y, width int) []byte {
	index := (y*width + x) * 4
	return pixels[index : index+4]
}

func indexedPixelsForTest(indexes []byte, palette Palette) []byte {
	pixels := make([]byte, len(indexes)*4)
	for pixel, index := range indexes {
		value := palette.Colors[index]
		rgb, err := strconv.ParseUint(value[1:7], 16, 24)
		if err != nil {
			panic(err)
		}
		alpha := uint64(255)
		if len(value) == 9 {
			alpha, err = strconv.ParseUint(value[7:9], 16, 8)
			if err != nil {
				panic(err)
			}
		}
		if int(index) == palette.TransparentIndex {
			alpha = 0
		}
		offset := pixel * 4
		pixels[offset], pixels[offset+1], pixels[offset+2], pixels[offset+3] = byte(rgb>>16), byte(rgb>>8), byte(rgb), byte(alpha)
	}
	return pixels
}

func indexesForExactPixelsTest(pixels []byte, palette Palette) []byte {
	indexes := make([]byte, len(pixels)/4)
	for pixel := range indexes {
		offset := pixel * 4
		found := false
		for index := range palette.Colors {
			candidate := indexedPixelsForTest([]byte{byte(index)}, palette)
			if bytes.Equal(candidate, pixels[offset:offset+4]) {
				indexes[pixel] = byte(index)
				found = true
				break
			}
		}
		if !found {
			panic(fmt.Sprintf("pixel %v is not in test palette", pixels[offset:offset+4]))
		}
	}
	return indexes
}

func solidTilePixels(width, height int, pixel []byte) []byte {
	pixels := make([]byte, width*height*4)
	for offset := 0; offset < len(pixels); offset += 4 {
		copy(pixels[offset:offset+4], pixel)
	}
	return pixels
}

func terrainTestDocument(grid TilesetGrid, mode TerrainNeighborMode) Document {
	document := testDocument()
	document.Name = "terrain.pixio"
	document.Width, document.Height = 4, 4
	tileset := Tileset{
		ID:         "terrain-tileset",
		Name:       "Terrain",
		TileWidth:  1,
		TileHeight: 1,
		Grid:       grid,
		Terrains: []TerrainDefinition{testTerrainDefinition(
			mode,
			TerrainBoundaryEmpty,
			TerrainRule{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}},
			TerrainRule{Mask: terrainMaximumMask(mode), Candidates: []TerrainCandidate{{TileID: 2, Weight: 1}}},
		)},
		Tiles: []Tile{
			{ID: 1, Pixels: []byte{32, 96, 48, 255}},
			{ID: 2, Pixels: []byte{96, 48, 160, 255}},
		},
	}
	terrainMap := terrainMapFromIDs(4, 4, []uint16{1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1})
	terrainMap.Seed = 73
	document.Width, document.Height = tilemapPixelSize(tileset, terrainMap.Columns, terrainMap.Rows)
	tilemap := &TilemapData{Columns: 4, Rows: 4, Tiles: renderTerrainTilemap(terrainMap, tileset)}
	document.Tilesets = []Tileset{tileset}
	document.Layers[0] = Layer{ID: "tile-layer", Name: "Terrain Layer", Visible: true, Opacity: 1, Kind: LayerKindTilemap, TilesetID: tileset.ID, BlendMode: BlendModeNormal, Role: LayerRoleStandard}
	document.ActiveLayerID = "tile-layer"
	document.Cels[0] = Cel{ID: "terrain-cel", LinkID: "terrain-link", LayerID: "tile-layer", FrameID: document.Frames[0].ID, Width: document.Width, Height: document.Height, Opacity: 1, Pixels: renderTilemapCache(document.Width, document.Height, *tilemap, tileset), Tilemap: tilemap, TerrainMap: &terrainMap}
	return document
}

func blob8CacheDocument() Document {
	document := terrainTestDocument(TilesetGrid{Kind: TileGridOrthogonal}, TerrainNeighborBlob8)
	document.Tilesets[0].Terrains[0].Rules = []TerrainRule{
		{Mask: 0, Candidates: []TerrainCandidate{{TileID: 1, Weight: 1}}},
		{Mask: 0b00000111, Candidates: []TerrainCandidate{{TileID: 2, Weight: 1}}},
	}
	terrainMap := terrainMapFromIDs(4, 4, []uint16{
		0, 0, 1, 0,
		0, 1, 0, 0,
		0, 0, 0, 0,
		0, 0, 0, 0,
	})
	terrainMap.Seed = 73
	document.Cels[0].TerrainMap = &terrainMap
	document.Cels[0].Tilemap = &TilemapData{Columns: 4, Rows: 4, Tiles: renderTerrainTilemap(terrainMap, document.Tilesets[0])}
	document.Cels[0].Pixels = renderTilemapCache(document.Cels[0].Width, document.Cels[0].Height, *document.Cels[0].Tilemap, document.Tilesets[0])
	return document
}

func uint32SliceBytes(values []uint32) []byte {
	output := make([]byte, len(values)*4)
	for index, value := range values {
		binary.LittleEndian.PutUint32(output[index*4:], value)
	}
	return output
}

func hierarchyDocument(layers []Layer) Document {
	document := testDocument()
	document.Layers = layers
	for index := range document.Layers {
		if document.Layers[index].Role == "" {
			document.Layers[index].Role = LayerRoleStandard
		}
	}
	document.Cels = nil
	for index, layer := range layers {
		if layer.Kind != LayerKindImage {
			continue
		}
		document.Cels = append(document.Cels, Cel{
			ID:      "cel-" + layer.ID,
			LinkID:  "link-" + layer.ID,
			LayerID: layer.ID,
			FrameID: document.Frames[0].ID,
			Width:   document.Width,
			Height:  document.Height,
			Opacity: 1,
			Pixels:  make([]byte, document.Width*document.Height*4),
		})
		if index == 0 {
			document.ActiveLayerID = layer.ID
		}
	}
	if len(layers) > 0 && document.ActiveLayerID == "layer" {
		document.ActiveLayerID = layers[0].ID
	}
	return document
}

func testDocument() Document {
	return Document{FormatVersion: FormatVersion, Name: "sprite.pixio", Width: 2, Height: 2, ColorMode: "rgba", ColorProfile: ColorProfile{Type: ColorProfileSRGB, Name: "sRGB"}, PixelAspectRatio: PixelAspectRatio{Width: 1, Height: 1}, Palette: Palette{ID: "palette", Name: "Default", Colors: []string{"#000000"}, TransparentIndex: 0}, Tilesets: []Tileset{}, Layers: []Layer{{ID: "layer", Name: "Layer 1", Visible: true, Opacity: 1, Kind: LayerKindImage, BlendMode: BlendModeNormal, Role: LayerRoleStandard}}, Frames: []Frame{{ID: "frame", DurationMS: 100}}, Tags: []FrameTag{}, Slices: []Slice{}, Guides: []Guide{}, Settings: DocumentSettings{GridWidth: 8, GridHeight: 8, SymmetryAxisX: 1, SymmetryAxisY: 1, OnionPreviousFrames: 1, OnionNextFrames: 1, OnionOpacity: 0.35, OnionPreviousColor: "#f25b5bff", OnionNextColor: "#4ea3ffff"}, Cels: []Cel{{ID: "cel", LinkID: "link", LayerID: "layer", FrameID: "frame", Width: 2, Height: 2, Opacity: 1, Pixels: []byte{255, 0, 0, 128, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 0}}}, ActiveLayerID: "layer", ActiveFrameID: "frame"}
}

type zipTestEntry struct {
	name string
	data []byte
}

func readZipEntries(t *testing.T, path string) []zipTestEntry {
	t.Helper()
	archive, err := zip.OpenReader(path)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	entries := make([]zipTestEntry, 0, len(archive.File))
	for _, file := range archive.File {
		data, err := readZipFile(file, maxTilePNGBytes)
		if err != nil {
			t.Fatal(err)
		}
		entries = append(entries, zipTestEntry{name: file.Name, data: append([]byte(nil), data...)})
	}
	return entries
}

func rewriteManifestEntries(t *testing.T, entries []zipTestEntry, mutate func(map[string]json.RawMessage)) {
	t.Helper()
	for index := range entries {
		if entries[index].name != "manifest.json" {
			continue
		}
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(entries[index].data, &raw); err != nil {
			t.Fatal(err)
		}
		mutate(raw)
		data, err := json.Marshal(raw)
		if err != nil {
			t.Fatal(err)
		}
		entries[index].data = data
		return
	}
	t.Fatal("manifest.json is missing")
}

func rewriteCelManifest(t *testing.T, sourcePath, targetPath string, mutate func(map[string]json.RawMessage)) {
	t.Helper()
	archive, err := zip.OpenReader(sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	entries := make([]zipTestEntry, 0, len(archive.File))
	for _, file := range archive.File {
		data, err := readZipFile(file, maxManifestBytes)
		if err != nil {
			t.Fatal(err)
		}
		if file.Name == "manifest.json" {
			var raw map[string]json.RawMessage
			if err := json.Unmarshal(data, &raw); err != nil {
				t.Fatal(err)
			}
			var cels []map[string]json.RawMessage
			if err := json.Unmarshal(raw["cels"], &cels); err != nil {
				t.Fatal(err)
			}
			mutate(cels[0])
			raw["cels"], err = json.Marshal(cels)
			if err != nil {
				t.Fatal(err)
			}
			data, err = json.Marshal(raw)
			if err != nil {
				t.Fatal(err)
			}
		}
		entries = append(entries, zipTestEntry{name: file.Name, data: data})
	}
	writeZipEntries(t, targetPath, entries)
}

func writeZipEntries(t *testing.T, path string, entries []zipTestEntry) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for _, entry := range entries {
		writer, err := archive.Create(entry.name)
		if err != nil {
			_ = file.Close()
			t.Fatal(err)
		}
		if _, err := writer.Write(entry.data); err != nil {
			_ = file.Close()
			t.Fatal(err)
		}
	}
	if err := archive.Close(); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func encodePNG(t *testing.T, source image.Image, width, height int) []byte {
	t.Helper()
	var output bytes.Buffer
	canvas := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			canvas.Set(x, y, source.At(x, y))
		}
	}
	if err := png.Encode(&output, canvas); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

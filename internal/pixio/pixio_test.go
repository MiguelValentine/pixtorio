package pixio

import (
	"archive/zip"
	"bytes"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
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
				document.Cels[0].Indexes = make([]byte, document.Cels[0].Width*document.Cels[0].Height)
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
	document.Cels[0].Indexes = []byte{0, 1, 1, 0}
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
	tileset := Tileset{ID: "terrain", Name: "Terrain", TileWidth: 2, TileHeight: 2, Tiles: []Tile{{ID: 1, Pixels: tilePixels, Indexes: []byte{1, 2, 3, 4}}}}
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
	document.Cels = []Cel{{ID: "tile-cel", LinkID: "tile-link", LayerID: "tile-layer", FrameID: "frame", Width: 4, Height: 4, Opacity: 1, Pixels: cache, Indexes: make([]byte, 16), Tilemap: tilemap}}
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
	document.Tilesets = []Tileset{{ID: "tileset", Name: "Tiles", TileWidth: 2, TileHeight: 2, Tiles: []Tile{{ID: 1, Pixels: make([]byte, 16)}}}}
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

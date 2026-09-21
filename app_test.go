package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"

	pngexport "pixtorio/internal/export"
	"pixtorio/internal/pixio"
)

func TestStartupProjectPath(t *testing.T) {
	path := startupProjectPath([]string{"--devtools", "C:\\art\\hero.PIXIO", "other.txt"})
	if path != "C:\\art\\hero.PIXIO" {
		t.Fatalf("startupProjectPath() = %q, want .pixio argument", path)
	}

	if path := startupProjectPath([]string{"--devtools", "sprite.png"}); path != "" {
		t.Fatalf("startupProjectPath() = %q, want empty path", path)
	}
}

func TestCloseConfirmationDialogUsesExplicitLocalizedButtons(t *testing.T) {
	tests := []struct {
		language string
		title    string
		discard  string
		cancel   string
	}{
		{language: "en", title: "Unsaved changes", discard: "Discard Changes", cancel: "Cancel"},
		{language: "zh-CN", title: "存在未保存的更改", discard: "放弃更改", cancel: "取消"},
	}
	for _, test := range tests {
		t.Run(test.language, func(t *testing.T) {
			dialog, discard := closeConfirmationDialog(test.language)
			if dialog.Title != test.title {
				t.Fatalf("dialog title = %q, want %q", dialog.Title, test.title)
			}
			if discard != test.discard || len(dialog.Buttons) != 2 || dialog.Buttons[0] != test.discard || dialog.Buttons[1] != test.cancel {
				t.Fatalf("dialog buttons = %#v, discard = %q", dialog.Buttons, discard)
			}
			if dialog.DefaultButton != test.cancel || dialog.CancelButton != test.cancel {
				t.Fatalf("default/cancel buttons = %q/%q, want %q", dialog.DefaultButton, dialog.CancelButton, test.cancel)
			}
		})
	}
}

func TestConflictsWithProjectPathUsesCaseInsensitiveIdentity(t *testing.T) {
	reserved := filepath.Join(t.TempDir(), "Hero.pixio")
	if !conflictsWithProjectPath(strings.ToUpper(reserved), []string{strings.ToLower(reserved)}) {
		t.Fatal("same project path with different case should conflict")
	}
	if conflictsWithProjectPath(filepath.Join(filepath.Dir(reserved), "Other.pixio"), []string{reserved}) {
		t.Fatal("different project path should not conflict")
	}
}

func TestWindowsPixioAssociationConfiguration(t *testing.T) {
	configuration, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Info struct {
			FileAssociations []struct {
				Extension string `json:"ext"`
			} `json:"fileAssociations"`
		} `json:"info"`
	}
	if err := json.Unmarshal(configuration, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Info.FileAssociations) != 1 || parsed.Info.FileAssociations[0].Extension != "pixio" {
		t.Fatalf("file association extensions = %#v, want one extension without a leading dot", parsed.Info.FileAssociations)
	}

	installer, err := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	source := string(installer)
	if !strings.Contains(source, `!insertmacro pixtorio.associateFiles`) {
		t.Fatal("installer does not invoke the durable Pixtorio association macro")
	}
	if !strings.Contains(source, `$\"$INSTDIR\${PRODUCT_EXECUTABLE}$\" $\"%1$\"`) {
		t.Fatal("installer file-open command must quote both the executable and project paths")
	}
}

func TestStraightRGBAPixelsPreservesUnassociatedAlpha(t *testing.T) {
	img := image.NewNRGBA(image.Rect(4, 7, 5, 8))
	img.SetNRGBA(4, 7, color.NRGBA{R: 240, G: 120, B: 60, A: 128})
	if got, want := straightRGBAPixels(img), []byte{240, 120, 60, 128}; !bytes.Equal(got, want) {
		t.Fatalf("straightRGBAPixels() = %v, want %v", got, want)
	}
}

func TestDecodeRGBABase64ValidatesDimensionsAndLength(t *testing.T) {
	want := []byte{1, 2, 3, 4, 5, 6, 7, 8}
	encoded := base64.StdEncoding.EncodeToString(want)
	got, err := decodeRGBABase64(2, 1, encoded)
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("decodeRGBABase64() = %v, %v; want %v", got, err, want)
	}
	for _, test := range []struct {
		width, height int
		value         string
	}{
		{0, 1, encoded},
		{2049, 1, encoded},
		{2, 1, base64.StdEncoding.EncodeToString(want[:4])},
		{2, 1, "!!!!!!!!!!!!"},
	} {
		if _, err := decodeRGBABase64(test.width, test.height, test.value); err == nil {
			t.Fatalf("decodeRGBABase64(%d, %d, %q) expected error", test.width, test.height, test.value)
		}
	}
}

func TestDecodeAtlasRGBABase64UsesExportDimensionsWithoutImportLimit(t *testing.T) {
	want := make([]byte, 2049*4)
	want[3] = 255
	encoded := base64.StdEncoding.EncodeToString(want)
	got, err := decodeAtlasRGBABase64(2049, 1, encoded)
	if err != nil || !bytes.Equal(got, want) {
		t.Fatalf("decodeAtlasRGBABase64() = %v, %v; want %d decoded bytes", len(got), err, len(want))
	}

	for _, test := range []struct {
		name          string
		width, height int
	}{
		{name: "width exceeds export limit", width: maxAtlasOutputDimension + 1, height: 1},
		{name: "height exceeds export limit", width: 1, height: maxAtlasOutputDimension + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := decodeAtlasRGBABase64(test.width, test.height, ""); err == nil {
				t.Fatalf("decodeAtlasRGBABase64(%d, %d) expected dimension error", test.width, test.height)
			}
		})
	}
}

func TestValidAtlasOutputDimensions(t *testing.T) {
	for _, test := range []struct {
		width, height int
		want          bool
	}{
		{width: 2049, height: 1, want: true},
		{width: maxAtlasOutputDimension, height: maxAtlasOutputDimension, want: true},
		{width: maxAtlasOutputDimension + 1, height: 1, want: false},
		{width: 1, height: maxAtlasOutputDimension + 1, want: false},
		{width: 0, height: 1, want: false},
	} {
		if got := validAtlasOutputDimensions(test.width, test.height); got != test.want {
			t.Fatalf("validAtlasOutputDimensions(%d, %d) = %t, want %t", test.width, test.height, got, test.want)
		}
	}
}

func TestDecodeRGBAFramesReportsTheInvalidFrame(t *testing.T) {
	valid := base64.StdEncoding.EncodeToString([]byte{1, 2, 3, 4})
	if _, err := decodeRGBAFrames(1, 1, []string{valid, "bad"}); err == nil || !strings.Contains(err.Error(), "frame 2") {
		t.Fatalf("decodeRGBAFrames() error = %v, want frame 2 context", err)
	}
}

func TestValidPNGImportDimensions(t *testing.T) {
	for _, test := range []struct {
		name          string
		width, height int
		want          bool
	}{
		{name: "minimum", width: 1, height: 1, want: true},
		{name: "maximum", width: 2048, height: 2048, want: true},
		{name: "width exceeds maximum", width: 2049, height: 1, want: false},
		{name: "height exceeds maximum", width: 1, height: 2049, want: false},
		{name: "zero width", width: 0, height: 1, want: false},
		{name: "zero height", width: 1, height: 0, want: false},
		{name: "negative width", width: -1, height: 1, want: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := validPNGImportDimensions(test.width, test.height); got != test.want {
				t.Fatalf("validPNGImportDimensions(%d, %d) = %t, want %t", test.width, test.height, got, test.want)
			}
		})
	}
}

func TestDecodeImportedPNGChecksConfigBeforeDecoding(t *testing.T) {
	tests := []struct {
		name          string
		width, height int
		truncate      bool
		wantWidth     int
		wantHeight    int
		wantErr       string
	}{
		{name: "normal", width: 2, height: 1, wantWidth: 2, wantHeight: 1},
		{name: "maximum width", width: maxPNGImportDimension, height: 1, wantWidth: maxPNGImportDimension, wantHeight: 1},
		{name: "oversized width from IHDR", width: maxPNGImportDimension + 1, height: 1, truncate: true, wantErr: "invalid PNG dimensions"},
		{name: "oversized height from IHDR", width: 1, height: maxPNGImportDimension + 1, truncate: true, wantErr: "invalid PNG dimensions"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			encoded := encodeTestPNG(t, test.width, test.height)
			if test.truncate {
				// The signature and IHDR chunk are enough for DecodeConfig. The
				// missing image data proves that the size check runs first.
				encoded = encoded[:33]
			}
			decoded, err := decodeImportedPNG(bytes.NewReader(encoded))
			if test.wantErr != "" {
				if err == nil || err.Error() != test.wantErr {
					t.Fatalf("decodeImportedPNG() error = %v, want %q", err, test.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("decodeImportedPNG() error = %v", err)
			}
			bounds := decoded.Bounds()
			if bounds.Dx() != test.wantWidth || bounds.Dy() != test.wantHeight {
				t.Fatalf("decoded bounds = %dx%d, want %dx%d", bounds.Dx(), bounds.Dy(), test.wantWidth, test.wantHeight)
			}
		})
	}
}

func encodeTestPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, image.NewNRGBA(image.Rect(0, 0, width, height))); err != nil {
		t.Fatalf("png.Encode() error = %v", err)
	}
	return buffer.Bytes()
}

func TestOpenStartupProjectReturnsPathAndConsumesIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "startup.pixio")
	document := pixio.Document{
		FormatVersion:    pixio.FormatVersion,
		Name:             "startup.pixio",
		Width:            1,
		Height:           1,
		ColorMode:        "rgba",
		ColorProfile:     pixio.ColorProfile{Type: pixio.ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: pixio.PixelAspectRatio{Width: 1, Height: 1},
		Palette:          pixio.Palette{ID: "palette", Name: "Default", Colors: []string{"#000000"}},
		Tilesets:         []pixio.Tileset{},
		Layers:           []pixio.Layer{{ID: "layer", Name: "Layer 1", Visible: true, Opacity: 1, Kind: pixio.LayerKindImage, BlendMode: pixio.BlendModeNormal, Role: pixio.LayerRoleStandard}},
		Frames:           []pixio.Frame{{ID: "frame", DurationMS: 100}},
		Tags:             []pixio.FrameTag{},
		Slices:           []pixio.Slice{},
		Guides:           []pixio.Guide{},
		Settings:         testDocumentSettings(),
		Cels:             []pixio.Cel{{ID: "cel", LinkID: "link", Opacity: 1, LayerID: "layer", FrameID: "frame", Width: 1, Height: 1, Pixels: []byte{1, 2, 3, 255}}},
		ActiveLayerID:    "layer",
		ActiveFrameID:    "frame",
	}
	if err := pixio.WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}

	app := &App{startupPath: path}
	payload, err := app.OpenStartupProject()
	if err != nil {
		t.Fatal(err)
	}
	var opened openProjectResult
	if err := json.Unmarshal([]byte(payload), &opened); err != nil {
		t.Fatal(err)
	}
	if opened.Path != path {
		t.Fatalf("opened path = %q, want %q", opened.Path, path)
	}
	var loaded pixio.Document
	if err := json.Unmarshal([]byte(opened.Document), &loaded); err != nil {
		t.Fatal(err)
	}
	if loaded.Name != document.Name || len(loaded.Cels) != 1 {
		t.Fatalf("unexpected startup document: %#v", loaded)
	}
	if !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatalf("startup pixels = %v, want %v", loaded.Cels[0].Pixels, document.Cels[0].Pixels)
	}

	if second, err := app.OpenStartupProject(); err != nil || second != "" {
		t.Fatalf("second OpenStartupProject() = %q, %v; want empty result", second, err)
	}
}

func TestSavePixioPathValidatesExtensionAndWritesAtomically(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "sprite.pixio")
	document := testPixioDocument("sprite.pixio", []byte{1, 2, 3, 255})
	payload, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}

	if _, err := (&App{}).SavePixioPath(filepath.Join(directory, "sprite.json"), string(payload)); err == nil {
		t.Fatal("SavePixioPath() expected a strict .pixio extension error")
	}

	if err := os.WriteFile(path, []byte("existing project"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := (&App{}).SavePixioPath(path, "{"); err == nil {
		t.Fatal("SavePixioPath() expected invalid JSON error")
	}
	assertAppFileContents(t, path, []byte("existing project"))

	gotPath, err := (&App{}).SavePixioPath(path, string(payload))
	if err != nil {
		t.Fatal(err)
	}
	if gotPath != path {
		t.Fatalf("SavePixioPath() path = %q, want %q", gotPath, path)
	}
	loaded, _, err := pixio.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Name != document.Name || !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatalf("saved document = %#v, want %#v", loaded, document)
	}
	if matches, err := filepath.Glob(filepath.Join(directory, ".sprite.pixio.tmp-*")); err != nil {
		t.Fatal(err)
	} else if len(matches) != 0 {
		t.Fatalf("temporary project files remain: %v", matches)
	}
}

func TestWriteSpriteSheetAtlasMetadataAtomically(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "sprites.json")
	if err := os.WriteFile(path, []byte("old metadata"), 0600); err != nil {
		t.Fatal(err)
	}
	layout := pngexport.SpriteSheetLayoutResult{
		Width:  12,
		Height: 7,
		FrameRects: []pngexport.SpriteSheetFrameRect{
			{X: 2, Y: 1, Width: 4, Height: 3},
			{X: 7, Y: 1, Width: 4, Height: 3},
		},
	}
	if err := writeSpriteSheetAtlasMetadata(path, "sprites.png", layout); err != nil {
		t.Fatal(err)
	}

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var metadata struct {
		Image       string                           `json:"image"`
		SheetWidth  int                              `json:"sheetWidth"`
		SheetHeight int                              `json:"sheetHeight"`
		FrameWidth  int                              `json:"frameWidth"`
		FrameHeight int                              `json:"frameHeight"`
		Frames      []pngexport.SpriteSheetFrameRect `json:"frames"`
	}
	if err := json.Unmarshal(data, &metadata); err != nil {
		t.Fatal(err)
	}
	if metadata.Image != "sprites.png" || metadata.SheetWidth != 12 || metadata.SheetHeight != 7 || metadata.FrameWidth != 4 || metadata.FrameHeight != 3 {
		t.Fatalf("unexpected atlas metadata header: %#v", metadata)
	}
	if len(metadata.Frames) != 2 || metadata.Frames[1] != layout.FrameRects[1] {
		t.Fatalf("unexpected atlas frame rectangles: %#v", metadata.Frames)
	}
	if matches, err := filepath.Glob(filepath.Join(directory, ".sprites.json.tmp-*")); err != nil {
		t.Fatal(err)
	} else if len(matches) != 0 {
		t.Fatalf("temporary atlas files remain: %v", matches)
	}
}

func TestWritePackedAtlasFilesHonorsJSONFlagAndUsesOutputImageName(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "atlas.png")
	pixels := []byte{255, 0, 0, 255, 0, 0, 0, 0}
	metadata := `{"format":"pixtorio-atlas-v1","image":"placeholder.png","width":2,"height":1,"frames":[]}`

	if err := writePackedAtlasFiles(path, 2, 1, pixels, metadata, false); err != nil {
		t.Fatalf("writePackedAtlasFiles(false) error = %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("packed atlas image missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(directory, "atlas.json")); !os.IsNotExist(err) {
		t.Fatalf("packed atlas metadata should be absent when disabled, stat error = %v", err)
	}

	if err := writePackedAtlasFiles(path, 2, 1, pixels, metadata, true); err != nil {
		t.Fatalf("writePackedAtlasFiles(true) error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(directory, "atlas.json"))
	if err != nil {
		t.Fatalf("read packed atlas metadata: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode packed atlas metadata: %v", err)
	}
	if decoded["image"] != "atlas.png" {
		t.Fatalf("metadata image = %#v, want atlas.png", decoded["image"])
	}
	if matches, err := filepath.Glob(filepath.Join(directory, ".atlas.json.tmp-*")); err != nil {
		t.Fatal(err)
	} else if len(matches) != 0 {
		t.Fatalf("temporary packed atlas metadata remains: %v", matches)
	}
}

func TestWritePackedAtlasFilesSupportsAtlasAbovePNGImportLimit(t *testing.T) {
	const width = maxPNGImportDimension + 1
	path := filepath.Join(t.TempDir(), "large-atlas.png")
	pixels := make([]byte, width*4)
	pixels[3] = 255
	if err := writePackedAtlasFiles(path, width, 1, pixels, "", false); err != nil {
		t.Fatalf("writePackedAtlasFiles() error = %v", err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatalf("open packed atlas: %v", err)
	}
	config, err := png.DecodeConfig(file)
	_ = file.Close()
	if err != nil {
		t.Fatalf("decode packed atlas config: %v", err)
	}
	if config.Width != width || config.Height != 1 {
		t.Fatalf("packed atlas dimensions = %dx%d, want %dx1", config.Width, config.Height, width)
	}
}

func TestWritePackedAtlasFilesPreservesCompleteSpriteSheetMetadata(t *testing.T) {

	directory := t.TempDir()
	path := filepath.Join(directory, "split-sheet.png")
	metadata := `{"format":"pixtorio-atlas-v1","canvas":{"width":2,"height":1},"layers":[{"id":"layer"}],"frames":[{"id":"frame","frame":{"x":0,"y":0,"width":2,"height":1}}]}`
	if err := writePackedAtlasFiles(path, 2, 1, []byte{255, 0, 0, 255, 0, 0, 0, 0}, metadata, true); err != nil {
		t.Fatalf("writePackedAtlasFiles() error = %v", err)
	}
	data, err := os.ReadFile(filepath.Join(directory, "split-sheet.json"))
	if err != nil {
		t.Fatalf("read sprite sheet metadata: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode sprite sheet metadata: %v", err)
	}
	if decoded["image"] != "split-sheet.png" || decoded["format"] != "pixtorio-atlas-v1" {
		t.Fatalf("metadata header was not preserved: %#v", decoded)
	}
	if _, ok := decoded["layers"].([]any); !ok {
		t.Fatalf("complete layer metadata was not preserved: %#v", decoded["layers"])
	}
	frames, ok := decoded["frames"].([]any)
	if !ok || len(frames) != 1 {
		t.Fatalf("complete frame metadata was not preserved: %#v", decoded["frames"])
	}
}

func TestMarshalPackedAtlasMetadataRejectsNonObject(t *testing.T) {
	if _, err := marshalPackedAtlasMetadata("atlas.png", "[]"); err == nil {
		t.Fatal("marshalPackedAtlasMetadata() expected object validation error")
	}
}

func TestWriteTilesetBundleUsesChosenImageName(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "renamed-tiles.png")
	metadata := `{"format":"pixtorio-tilemap-v1","tileset":{"id":"tiles"},"tilemap":{"columns":1,"rows":1},"terrainmap":null,"cel":null,"tilesetImage":{"file":"original.png","width":2,"height":1,"tiles":[{"tileId":7,"x":0,"y":0,"width":2,"height":1}]}}`
	if err := writePackedAtlasFiles(path, 2, 1, []byte{255, 0, 0, 255, 0, 0, 0, 0}, metadata, true); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(directory, "renamed-tiles.json"))
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatal(err)
	}
	if _, exists := decoded["image"]; exists {
		t.Fatal("tilemap sidecar contains unknown atlas image field")
	}
	image := decoded["tilesetImage"].(map[string]any)
	if image["file"] != filepath.Base(path) {
		t.Fatalf("image filename = %v, want %s", image["file"], filepath.Base(path))
	}
	if image["width"] != float64(2) || image["height"] != float64(1) ||
		len(image["tiles"].([]any)) != 1 || decoded["format"] != "pixtorio-tilemap-v1" {
		t.Fatalf("tileset metadata changed: %#v", decoded)
	}
	if _, err := os.Stat(filepath.Join(directory, image["file"].(string))); err != nil {
		t.Fatalf("sidecar image reference does not exist: %v", err)
	}
}

func TestTilesetBundleRejectsMissingImageDescriptorBeforeWriting(t *testing.T) {
	path := filepath.Join(t.TempDir(), "invalid.png")
	err := writePackedAtlasFiles(path, 1, 1, []byte{255, 0, 0, 255},
		`{"format":"pixtorio-tilemap-v1","tilesetImage":null}`, true)
	if err == nil {
		t.Fatal("expected missing image descriptor error")
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("invalid metadata must not write an image: %v", err)
	}
}

func testPixioDocument(name string, pixels []byte) pixio.Document {
	return pixio.Document{
		FormatVersion:    pixio.FormatVersion,
		Name:             name,
		Width:            1,
		Height:           1,
		ColorMode:        "rgba",
		ColorProfile:     pixio.ColorProfile{Type: pixio.ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: pixio.PixelAspectRatio{Width: 1, Height: 1},
		Palette:          pixio.Palette{ID: "palette", Name: "Default", Colors: []string{"#000000"}},
		Tilesets:         []pixio.Tileset{},
		Layers:           []pixio.Layer{{ID: "layer", Name: "Layer 1", Visible: true, Opacity: 1, Kind: pixio.LayerKindImage, BlendMode: pixio.BlendModeNormal, Role: pixio.LayerRoleStandard}},
		Frames:           []pixio.Frame{{ID: "frame", DurationMS: 100}},
		Tags:             []pixio.FrameTag{},
		Slices:           []pixio.Slice{},
		Guides:           []pixio.Guide{},
		Settings:         testDocumentSettings(),
		Cels:             []pixio.Cel{{ID: "cel", LinkID: "link", Opacity: 1, LayerID: "layer", FrameID: "frame", Width: 1, Height: 1, Pixels: pixels}},
		ActiveLayerID:    "layer",
		ActiveFrameID:    "frame",
	}
}

func testDocumentSettings() pixio.DocumentSettings {
	return pixio.DocumentSettings{
		GridWidth:           1,
		GridHeight:          1,
		SymmetryAxisX:       0.5,
		SymmetryAxisY:       0.5,
		OnionPreviousFrames: 1,
		OnionNextFrames:     1,
		OnionOpacity:        0.35,
		OnionPreviousColor:  "#f25b5bff",
		OnionNextColor:      "#4ea3ffff",
	}
}

func assertAppFileContents(t *testing.T, path string, want []byte) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("file contents = %q, want %q", got, want)
	}
}

func TestRecoveryJSONRoundTripAndReplacement(t *testing.T) {
	configDirectory := t.TempDir()
	t.Setenv("APPDATA", configDirectory)
	t.Setenv("XDG_CONFIG_HOME", configDirectory)
	app := &App{}

	if err := app.SaveRecovery("{"); err == nil {
		t.Fatal("SaveRecovery() expected invalid JSON error")
	}
	first := testRecoveryPayload(t, "tab-first", testPixioDocument("first.pixio", []byte{1, 2, 3, 255}))
	second := testRecoveryPayload(t, "tab-second", testPixioDocument("second.pixio", []byte{4, 5, 6, 255}))
	if err := app.SaveRecovery(first); err != nil {
		t.Fatal(err)
	}
	if err := app.SaveRecovery(second); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.LoadRecovery()
	if err != nil {
		t.Fatal(err)
	}
	if loaded != second {
		t.Fatalf("LoadRecovery() = %q, want latest snapshot %q", loaded, second)
	}
	if err := app.ClearRecovery(); err != nil {
		t.Fatal(err)
	}
	loaded, err = app.LoadRecovery()
	if err != nil || loaded != "" {
		t.Fatalf("LoadRecovery() after clear = %q, %v; want empty", loaded, err)
	}
}

func TestRecoveryRejectsOldOrInvalidSnapshots(t *testing.T) {
	configDirectory := t.TempDir()
	t.Setenv("APPDATA", configDirectory)
	t.Setenv("XDG_CONFIG_HOME", configDirectory)
	app := &App{}

	invalidSnapshots := []string{
		`{"format":"pixtorio-recovery-v1","activeTabId":"tab","documents":[{"tabId":"tab","document":"{}"}]}`,
		`{"format":"pixtorio-recovery-v2","activeTabId":"tab","documents":[]}`,
		`{"format":"pixtorio-recovery-v2","activeTabId":"missing","documents":[{"tabId":"tab","document":"{}"}]}`,
		testRecoveryPayload(t, "tab", testPixioDocument("path.pixio", []byte{0, 0, 0, 0}), ""),
		testRecoveryPayload(t, "tab", testPixioDocument("path.pixio", []byte{0, 0, 0, 0}), "project.png"),
		testRecoveryPayload(t, "tab", testPixioDocument("path.pixio", []byte{0, 0, 0, 0}), " project.pixio"),
		`{"format":"pixtorio-recovery-v2","activeTabId":"tab","documents":[{"tabId":"tab","filePath":null,"document":"{}"}]}`,
	}
	for _, payload := range invalidSnapshots {
		if err := app.SaveRecovery(payload); err == nil {
			t.Fatalf("SaveRecovery(%q) expected validation error", payload)
		}
	}
}

func TestRecoveryPreservesSavedProjectPathsAndRejectsDuplicates(t *testing.T) {
	configDirectory := t.TempDir()
	t.Setenv("APPDATA", configDirectory)
	t.Setenv("XDG_CONFIG_HOME", configDirectory)
	app := &App{}

	path := filepath.Join(t.TempDir(), "saved.pixio")
	payload := testRecoveryPayload(t, "saved-tab", testPixioDocument("saved.pixio", []byte{1, 2, 3, 255}), path)
	if err := app.SaveRecovery(payload); err != nil {
		t.Fatal(err)
	}
	loaded, err := app.LoadRecovery()
	if err != nil {
		t.Fatal(err)
	}
	var snapshot recoverySnapshot
	if err := json.Unmarshal([]byte(loaded), &snapshot); err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Documents) != 1 || snapshot.Documents[0].FilePath == nil || *snapshot.Documents[0].FilePath != path {
		t.Fatalf("recovered file path = %#v, want %q", snapshot.Documents, path)
	}

	duplicatePath := strings.ToUpper(path)
	firstJSON, err := json.Marshal(testPixioDocument("first.pixio", []byte{1, 2, 3, 255}))
	if err != nil {
		t.Fatal(err)
	}
	secondJSON, err := json.Marshal(testPixioDocument("second.pixio", []byte{4, 5, 6, 255}))
	if err != nil {
		t.Fatal(err)
	}
	duplicatePayload, err := json.Marshal(recoverySnapshot{
		Format:      recoveryFormat,
		ActiveTabID: "first",
		Documents: []recoveryDocument{
			{TabID: "first", FilePath: &path, Document: string(firstJSON)},
			{TabID: "second", FilePath: &duplicatePath, Document: string(secondJSON)},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := app.SaveRecovery(string(duplicatePayload)); err == nil {
		t.Fatal("SaveRecovery() expected duplicate recovery paths to be rejected")
	}
}

func TestLoadRecoveryDiscardsAnInvalidSnapshot(t *testing.T) {
	configDirectory := t.TempDir()
	t.Setenv("APPDATA", configDirectory)
	t.Setenv("XDG_CONFIG_HOME", configDirectory)
	path, err := recoveryPaths()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"format":"pixtorio-recovery-v1"}`), 0600); err != nil {
		t.Fatal(err)
	}

	payload, err := (&App{}).LoadRecovery()
	if err != nil || payload != "" {
		t.Fatalf("LoadRecovery() = %q, %v; want empty", payload, err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("invalid recovery should be removed, stat error = %v", err)
	}
}

func TestRecoveryIgnoresLegacyPixio(t *testing.T) {
	configDirectory := t.TempDir()
	t.Setenv("APPDATA", configDirectory)
	t.Setenv("XDG_CONFIG_HOME", configDirectory)
	path, err := recoveryPaths()
	if err != nil {
		t.Fatal(err)
	}
	legacyPath := filepath.Join(filepath.Dir(path), "recovery.pixio")
	if err := os.WriteFile(legacyPath, []byte("legacy project"), 0600); err != nil {
		t.Fatal(err)
	}

	payload, err := (&App{}).LoadRecovery()
	if err != nil {
		t.Fatal(err)
	}
	if payload != "" {
		t.Fatalf("LoadRecovery() = %q, want empty when only legacy recovery exists", payload)
	}
	if err := (&App{}).SaveRecovery(testRecoveryPayload(t, "tab", testPixioDocument("current.pixio", []byte{0, 0, 0, 0}))); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(legacyPath); err != nil {
		t.Fatalf("SaveRecovery() should not touch legacy recovery file, stat error = %v", err)
	}
	if err := (&App{}).ClearRecovery(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(legacyPath); err != nil {
		t.Fatalf("legacy recovery file should not be touched, stat error = %v", err)
	}
}

func testRecoveryPayload(t *testing.T, tabID string, document pixio.Document, filePath ...string) string {
	t.Helper()
	documentJSON, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	recovered := recoveryDocument{TabID: tabID, Document: string(documentJSON)}
	if len(filePath) > 0 {
		recovered.FilePath = &filePath[0]
	}
	payload, err := json.Marshal(recoverySnapshot{
		Format:      recoveryFormat,
		ActiveTabID: tabID,
		Documents:   []recoveryDocument{recovered},
	})
	if err != nil {
		t.Fatal(err)
	}
	return string(payload)
}

func TestSanitizeSequenceStem(t *testing.T) {
	if got := sanitizeSequenceStem(` My:Sprite?.pixio `); got != "My-Sprite" {
		t.Fatalf("sanitizeSequenceStem() = %q", got)
	}
	if got := sanitizeSequenceStem("..."); got != "frame" {
		t.Fatalf("sanitizeSequenceStem(empty) = %q", got)
	}
}

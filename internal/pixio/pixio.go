// Package pixio reads and writes Pixtorio's editable project container.
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
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

const FormatVersion = 5

const (
	ColorModeRGBA      = "rgba"
	ColorModeIndexed   = "indexed"
	ColorModeGrayscale = "grayscale"
	ColorModeBitmap    = "bitmap"
)

const (
	maxCanvasDimension      = 2048
	maxTilesetGridDimension = 4096
	maxManifestBytes        = 8 << 20
	maxThumbnailBytes       = 8 << 20
	maxCelPNGBytes          = 32 << 20
	maxThumbnailDimension   = 256
	minCelZIndex            = -32768
	maxCelZIndex            = 32767
)

const maxCelIndexBytes = maxCanvasDimension * maxCanvasDimension

const (
	terrainUnspecifiedID = 0
	terrainEmptyID       = 0xffff
	maxTerrainID         = 0xfffe
)

const (
	maxICCBytes        = 4 << 20
	maxTilePNGBytes    = 32 << 20
	maxTilemapBytes    = maxCanvasDimension * maxCanvasDimension * 4
	maxTerrainMapBytes = maxCanvasDimension * maxCanvasDimension * 2
	TileIndexMask      = uint32(0x1fffffff)
	TileFlipX          = uint32(0x80000000)
	TileFlipY          = uint32(0x40000000)
	TileFlipDiagonal   = uint32(0x20000000)
	tileIndexMask      = TileIndexMask
	tileFlipX          = TileFlipX
	tileFlipY          = TileFlipY
	tileFlipDiagonal   = TileFlipDiagonal
	tileFlagMask       = tileFlipX | tileFlipY | tileFlipDiagonal
)

type Palette struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Colors           []string `json:"colors"`
	TransparentIndex int      `json:"transparentIndex"`
}

type ColorProfileType string

const (
	ColorProfileNone      ColorProfileType = "none"
	ColorProfileSRGB      ColorProfileType = "srgb"
	ColorProfileDisplayP3 ColorProfileType = "display-p3"
	ColorProfileEmbedded  ColorProfileType = "embedded"
)

type ColorProfile struct {
	Type ColorProfileType `json:"type"`
	Name string           `json:"name"`
	Data []byte           `json:"data,omitempty"`
}

type PixelAspectRatio struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

type LayerKind string

const (
	LayerKindImage   LayerKind = "image"
	LayerKindGroup   LayerKind = "group"
	LayerKindTilemap LayerKind = "tilemap"
)

type LayerRole string

const (
	LayerRoleStandard   LayerRole = "standard"
	LayerRoleBackground LayerRole = "background"
	LayerRoleReference  LayerRole = "reference"
)

type BlendMode string

const (
	BlendModeNormal     BlendMode = "normal"
	BlendModeDarken     BlendMode = "darken"
	BlendModeMultiply   BlendMode = "multiply"
	BlendModeColorBurn  BlendMode = "color-burn"
	BlendModeLighten    BlendMode = "lighten"
	BlendModeScreen     BlendMode = "screen"
	BlendModeColorDodge BlendMode = "color-dodge"
	BlendModeOverlay    BlendMode = "overlay"
	BlendModeSoftLight  BlendMode = "soft-light"
	BlendModeHardLight  BlendMode = "hard-light"
	BlendModeDifference BlendMode = "difference"
	BlendModeExclusion  BlendMode = "exclusion"
	BlendModeHue        BlendMode = "hue"
	BlendModeSaturation BlendMode = "saturation"
	BlendModeColor      BlendMode = "color"
	BlendModeLuminosity BlendMode = "luminosity"
	BlendModeAddition   BlendMode = "addition"
	BlendModeSubtract   BlendMode = "subtract"
	BlendModeDivide     BlendMode = "divide"
)

type TagDirection string

const (
	TagDirectionForward  TagDirection = "forward"
	TagDirectionReverse  TagDirection = "reverse"
	TagDirectionPingPong TagDirection = "pingpong"
)

type Layer struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	Visible    bool      `json:"visible"`
	Locked     bool      `json:"locked"`
	Opacity    float64   `json:"opacity"`
	Kind       LayerKind `json:"kind"`
	ParentID   string    `json:"parentId,omitempty"`
	BlendMode  BlendMode `json:"blendMode"`
	Role       LayerRole `json:"role"`
	Continuous bool      `json:"continuous"`
	AlphaLock  bool      `json:"alphaLock"`
	TilesetID  string    `json:"tilesetId,omitempty"`
}
type Frame struct {
	ID         string `json:"id"`
	DurationMS int    `json:"durationMs"`
}
type FrameTag struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	FromFrameID string       `json:"fromFrameId"`
	ToFrameID   string       `json:"toFrameId"`
	Direction   TagDirection `json:"direction"`
	Color       string       `json:"color"`
	Repeat      int          `json:"repeat"`
}
type Cel struct {
	ID         string          `json:"id"`
	LinkID     string          `json:"linkId"`
	LayerID    string          `json:"layerId"`
	FrameID    string          `json:"frameId"`
	X          int             `json:"x"`
	Y          int             `json:"y"`
	Width      int             `json:"width"`
	Height     int             `json:"height"`
	Opacity    float64         `json:"opacity"`
	ZIndex     int             `json:"zIndex"`
	Pixels     []byte          `json:"pixels"`
	Indexes    []byte          `json:"indexes,omitempty"`
	Tilemap    *TilemapData    `json:"tilemap,omitempty"`
	TerrainMap *TerrainMapData `json:"terrainmap,omitempty"`
}

func (cel *Cel) UnmarshalJSON(data []byte) error {
	opacity, zIndex, err := decodeRequiredCelProperties(data)
	if err != nil {
		return err
	}
	type celJSON Cel
	if err := json.Unmarshal(data, (*celJSON)(cel)); err != nil {
		return err
	}
	cel.Opacity = opacity
	cel.ZIndex = zIndex
	return nil
}

type Tile struct {
	ID      int    `json:"id"`
	Pixels  []byte `json:"pixels"`
	Indexes []byte `json:"indexes,omitempty"`
}

type TileGridKind string

const (
	TileGridOrthogonal TileGridKind = "orthogonal"
	TileGridIsometric  TileGridKind = "isometric"
	TileGridHexagonal  TileGridKind = "hexagonal"
)

type TilesetGrid struct {
	Kind        TileGridKind `json:"kind"`
	CellWidth   int          `json:"cellWidth"`
	CellHeight  int          `json:"cellHeight"`
	AnchorX     int          `json:"anchorX"`
	AnchorY     int          `json:"anchorY"`
	Orientation string       `json:"orientation"`
	Offset      string       `json:"offset"`
}

func (grid TilesetGrid) MarshalJSON() ([]byte, error) {
	if !validTilesetGrid(grid) {
		return nil, fmt.Errorf("invalid tileset grid")
	}
	switch grid.Kind {
	case TileGridOrthogonal:
		return json.Marshal(struct {
			Kind TileGridKind `json:"kind"`
		}{Kind: grid.Kind})
	case TileGridIsometric:
		return json.Marshal(struct {
			Kind       TileGridKind `json:"kind"`
			CellWidth  int          `json:"cellWidth"`
			CellHeight int          `json:"cellHeight"`
			AnchorX    int          `json:"anchorX"`
			AnchorY    int          `json:"anchorY"`
		}{Kind: grid.Kind, CellWidth: grid.CellWidth, CellHeight: grid.CellHeight, AnchorX: grid.AnchorX, AnchorY: grid.AnchorY})
	case TileGridHexagonal:
		return json.Marshal(struct {
			Kind        TileGridKind `json:"kind"`
			Orientation string       `json:"orientation"`
			Offset      string       `json:"offset"`
		}{Kind: grid.Kind, Orientation: grid.Orientation, Offset: grid.Offset})
	default:
		return nil, fmt.Errorf("invalid tileset grid")
	}
}

func (grid *TilesetGrid) UnmarshalJSON(data []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("invalid tileset grid")
	}
	kindData, ok := fields["kind"]
	if !ok {
		return fmt.Errorf("invalid tileset grid")
	}
	var kind TileGridKind
	if err := json.Unmarshal(kindData, &kind); err != nil {
		return fmt.Errorf("invalid tileset grid")
	}
	switch kind {
	case TileGridOrthogonal:
		if !exactJSONFields(fields, "kind") {
			return fmt.Errorf("invalid tileset grid")
		}
		*grid = TilesetGrid{Kind: kind}
	case TileGridIsometric:
		if !exactJSONFields(fields, "kind", "cellWidth", "cellHeight", "anchorX", "anchorY") {
			return fmt.Errorf("invalid tileset grid")
		}
		var decoded struct {
			Kind       TileGridKind `json:"kind"`
			CellWidth  *int         `json:"cellWidth"`
			CellHeight *int         `json:"cellHeight"`
			AnchorX    *int         `json:"anchorX"`
			AnchorY    *int         `json:"anchorY"`
		}
		if err := json.Unmarshal(data, &decoded); err != nil || decoded.CellWidth == nil || decoded.CellHeight == nil || decoded.AnchorX == nil || decoded.AnchorY == nil {
			return fmt.Errorf("invalid tileset grid")
		}
		candidate := TilesetGrid{Kind: kind, CellWidth: *decoded.CellWidth, CellHeight: *decoded.CellHeight, AnchorX: *decoded.AnchorX, AnchorY: *decoded.AnchorY}
		if !validTilesetGrid(candidate) {
			return fmt.Errorf("invalid tileset grid")
		}
		*grid = candidate
	case TileGridHexagonal:
		if !exactJSONFields(fields, "kind", "orientation", "offset") {
			return fmt.Errorf("invalid tileset grid")
		}
		var decoded struct {
			Kind        TileGridKind `json:"kind"`
			Orientation *string      `json:"orientation"`
			Offset      *string      `json:"offset"`
		}
		if err := json.Unmarshal(data, &decoded); err != nil || decoded.Orientation == nil || decoded.Offset == nil {
			return fmt.Errorf("invalid tileset grid")
		}
		candidate := TilesetGrid{Kind: kind, Orientation: *decoded.Orientation, Offset: *decoded.Offset}
		if !validTilesetGrid(candidate) {
			return fmt.Errorf("invalid tileset grid")
		}
		*grid = candidate
	default:
		return fmt.Errorf("invalid tileset grid")
	}
	return nil
}

func exactJSONFields(fields map[string]json.RawMessage, expected ...string) bool {
	if len(fields) != len(expected) {
		return false
	}
	for _, key := range expected {
		if _, ok := fields[key]; !ok {
			return false
		}
	}
	return true
}

type Tileset struct {
	ID         string              `json:"id"`
	Name       string              `json:"name"`
	TileWidth  int                 `json:"tileWidth"`
	TileHeight int                 `json:"tileHeight"`
	Grid       TilesetGrid         `json:"grid"`
	Terrains   []TerrainDefinition `json:"terrains"`
	Tiles      []Tile              `json:"tiles"`
}

type TerrainNeighborMode string

const (
	TerrainNeighborEdge4 TerrainNeighborMode = "edge4"
	TerrainNeighborBlob8 TerrainNeighborMode = "blob8"
	TerrainNeighborEdge6 TerrainNeighborMode = "edge6"
)

type TerrainBoundary string

const (
	TerrainBoundaryEmpty TerrainBoundary = "empty"
	TerrainBoundarySame  TerrainBoundary = "same"
	TerrainBoundaryWrap  TerrainBoundary = "wrap"
)

type TerrainCandidate struct {
	TileID       int     `json:"tileId"`
	Flags        int64   `json:"flags"`
	Weight       float64 `json:"weight"`
	decoded      bool
	flagsPresent bool
}

type TerrainRule struct {
	Mask        uint32             `json:"mask"`
	Candidates  []TerrainCandidate `json:"candidates"`
	decoded     bool
	maskPresent bool
}

type TerrainDefinition struct {
	ID           int                 `json:"id"`
	Name         string              `json:"name"`
	Color        string              `json:"color"`
	NeighborMode TerrainNeighborMode `json:"neighborMode"`
	Boundary     TerrainBoundary     `json:"boundary"`
	Rules        []TerrainRule       `json:"rules"`
}

func (candidate *TerrainCandidate) UnmarshalJSON(data []byte) error {
	type terrainCandidateJSON TerrainCandidate
	var decoded terrainCandidateJSON
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("invalid terrain candidate")
	}
	if _, ok := fields["tileId"]; !ok {
		return fmt.Errorf("invalid terrain candidate")
	}
	if _, ok := fields["weight"]; !ok {
		return fmt.Errorf("invalid terrain candidate")
	}
	if _, ok := fields["flags"]; !ok {
		return fmt.Errorf("invalid terrain candidate")
	}
	*candidate = TerrainCandidate(decoded)
	candidate.decoded = true
	_, candidate.flagsPresent = fields["flags"]
	return nil
}

func (rule *TerrainRule) UnmarshalJSON(data []byte) error {
	type terrainRuleJSON TerrainRule
	var decoded terrainRuleJSON
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("invalid terrain rule")
	}
	if _, ok := fields["candidates"]; !ok {
		return fmt.Errorf("invalid terrain rule")
	}
	if _, ok := fields["mask"]; !ok {
		return fmt.Errorf("invalid terrain rule")
	}
	*rule = TerrainRule(decoded)
	rule.decoded = true
	_, rule.maskPresent = fields["mask"]
	return nil
}

// TilemapData stores little-endian uint32 tile cells. Tile index zero is
// empty; the three high bits are the X, Y and diagonal flip flags.
type TilemapData struct {
	Columns    int    `json:"columns"`
	Rows       int    `json:"rows"`
	GridOffset string `json:"gridOffset,omitempty"`
	Tiles      []byte `json:"tiles"`
}

// TerrainMapData stores little-endian uint16 logical Terrain IDs. ID zero is
// the empty Terrain and is not required to have a definition.
type TerrainMapData struct {
	Columns  int    `json:"columns"`
	Rows     int    `json:"rows"`
	Seed     int64  `json:"seed"`
	Terrains []byte `json:"terrains"`
}

type SliceRect struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type Point struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type SliceKey struct {
	FrameID string     `json:"frameId"`
	X       int        `json:"x"`
	Y       int        `json:"y"`
	Width   int        `json:"width"`
	Height  int        `json:"height"`
	Center  *SliceRect `json:"center,omitempty"`
	Pivot   *Point     `json:"pivot,omitempty"`
}

type Slice struct {
	ID    string     `json:"id"`
	Name  string     `json:"name"`
	Color string     `json:"color"`
	Keys  []SliceKey `json:"keys"`
}

type Guide struct {
	ID       string  `json:"id"`
	Axis     string  `json:"axis"`
	Position float64 `json:"position"`
}

type DocumentSettings struct {
	GridWidth             int     `json:"gridWidth"`
	GridHeight            int     `json:"gridHeight"`
	GridOffsetX           int     `json:"gridOffsetX"`
	GridOffsetY           int     `json:"gridOffsetY"`
	SnapToGrid            bool    `json:"snapToGrid"`
	TiledX                bool    `json:"tiledX"`
	TiledY                bool    `json:"tiledY"`
	SymmetryX             bool    `json:"symmetryX"`
	SymmetryY             bool    `json:"symmetryY"`
	SymmetryAxisX         float64 `json:"symmetryAxisX"`
	SymmetryAxisY         float64 `json:"symmetryAxisY"`
	OnionPreviousFrames   int     `json:"onionPreviousFrames"`
	OnionNextFrames       int     `json:"onionNextFrames"`
	OnionOpacity          float64 `json:"onionOpacity"`
	OnionPreviousColor    string  `json:"onionPreviousColor"`
	OnionNextColor        string  `json:"onionNextColor"`
	Interpolation         string  `json:"interpolation,omitempty"`
	GradientType          string  `json:"gradientType,omitempty"`
	SelectionConnectivity int     `json:"selectionConnectivity,omitempty"`
}

type Document struct {
	FormatVersion    int              `json:"formatVersion"`
	Name             string           `json:"name"`
	Width            int              `json:"width"`
	Height           int              `json:"height"`
	ColorMode        string           `json:"colorMode"`
	ColorProfile     ColorProfile     `json:"colorProfile"`
	PixelAspectRatio PixelAspectRatio `json:"pixelAspectRatio"`
	Palette          Palette          `json:"palette"`
	Tilesets         []Tileset        `json:"tilesets"`
	Layers           []Layer          `json:"layers"`
	Frames           []Frame          `json:"frames"`
	Tags             []FrameTag       `json:"tags"`
	Slices           []Slice          `json:"slices"`
	Guides           []Guide          `json:"guides"`
	Settings         DocumentSettings `json:"settings"`
	Cels             []Cel            `json:"cels"`
	ActiveLayerID    string           `json:"activeLayerId"`
	ActiveFrameID    string           `json:"activeFrameId"`
}

type manifest struct {
	FormatVersion    int                  `json:"formatVersion"`
	Name             string               `json:"name"`
	Width            int                  `json:"width"`
	Height           int                  `json:"height"`
	ColorMode        string               `json:"colorMode"`
	ColorProfile     manifestColorProfile `json:"colorProfile"`
	PixelAspectRatio PixelAspectRatio     `json:"pixelAspectRatio"`
	Palette          Palette              `json:"palette"`
	Tilesets         []manifestTileset    `json:"tilesets"`
	Layers           []Layer              `json:"layers"`
	Frames           []Frame              `json:"frames"`
	Tags             []FrameTag           `json:"tags"`
	Slices           []Slice              `json:"slices"`
	Guides           []Guide              `json:"guides"`
	Settings         DocumentSettings     `json:"settings"`
	Cels             []manifestCel        `json:"cels"`
	ActiveLayerID    string               `json:"activeLayerId"`
	ActiveFrameID    string               `json:"activeFrameId"`
}
type manifestCel struct {
	ID                    string  `json:"id"`
	LinkID                string  `json:"linkId"`
	LayerID               string  `json:"layerId"`
	FrameID               string  `json:"frameId"`
	X                     int     `json:"x"`
	Y                     int     `json:"y"`
	Width                 int     `json:"width"`
	Height                int     `json:"height"`
	Opacity               float64 `json:"opacity"`
	ZIndex                int     `json:"zIndex"`
	Path                  string  `json:"path"`
	IndexPath             string  `json:"indexPath,omitempty"`
	TilemapPath           string  `json:"tilemapPath,omitempty"`
	TilemapColumns        int     `json:"tilemapColumns,omitempty"`
	TilemapRows           int     `json:"tilemapRows,omitempty"`
	TilemapGridOffset     string  `json:"tilemapGridOffset,omitempty"`
	TerrainMapPath        string  `json:"terrainmapPath,omitempty"`
	TerrainMapColumns     int     `json:"terrainmapColumns,omitempty"`
	TerrainMapRows        int     `json:"terrainmapRows,omitempty"`
	TerrainMapSeed        int64   `json:"terrainmapSeed,omitempty"`
	terrainMapSeedPresent bool
	tilemapOffsetPresent  bool
}

func (cel *manifestCel) UnmarshalJSON(data []byte) error {
	opacity, zIndex, err := decodeRequiredCelProperties(data)
	if err != nil {
		return err
	}
	type manifestCelJSON manifestCel
	if err := json.Unmarshal(data, (*manifestCelJSON)(cel)); err != nil {
		return err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return fmt.Errorf("invalid cel")
	}
	_, cel.terrainMapSeedPresent = fields["terrainmapSeed"]
	if raw, ok := fields["tilemapGridOffset"]; ok {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil || value == nil || *value == "" {
			return fmt.Errorf("invalid cel")
		}
		cel.tilemapOffsetPresent = true
	}
	cel.Opacity = opacity
	cel.ZIndex = zIndex
	return nil
}

func (cel manifestCel) MarshalJSON() ([]byte, error) {
	type manifestCelJSON manifestCel
	data, err := json.Marshal((*manifestCelJSON)(&cel))
	if err != nil || cel.TerrainMapPath == "" || cel.TerrainMapSeed != 0 {
		return data, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return nil, err
	}
	fields["terrainmapSeed"] = json.RawMessage("0")
	return json.Marshal(fields)
}

func decodeRequiredCelProperties(data []byte) (float64, int, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil {
		return 0, 0, fmt.Errorf("invalid cel")
	}
	opacityData, opacityPresent := fields["opacity"]
	zIndexData, zIndexPresent := fields["zIndex"]
	if !opacityPresent || !zIndexPresent {
		return 0, 0, fmt.Errorf("invalid cel")
	}
	var opacity *float64
	if err := json.Unmarshal(opacityData, &opacity); err != nil || opacity == nil {
		return 0, 0, fmt.Errorf("invalid cel")
	}
	var zIndex *int
	if err := json.Unmarshal(zIndexData, &zIndex); err != nil || zIndex == nil {
		return 0, 0, fmt.Errorf("invalid cel")
	}
	return *opacity, *zIndex, nil
}

type manifestColorProfile struct {
	Type ColorProfileType `json:"type"`
	Name string           `json:"name"`
	Path string           `json:"path,omitempty"`
}

type manifestTileset struct {
	ID         string              `json:"id"`
	Name       string              `json:"name"`
	TileWidth  int                 `json:"tileWidth"`
	TileHeight int                 `json:"tileHeight"`
	Grid       TilesetGrid         `json:"grid"`
	Terrains   []TerrainDefinition `json:"terrains"`
	Tiles      []manifestTile      `json:"tiles"`
}

type manifestTile struct {
	ID        int    `json:"id"`
	Path      string `json:"path"`
	IndexPath string `json:"indexPath,omitempty"`
}

// Validate checks an in-memory document against the current .pixio format.
// The editor intentionally supports only FormatVersion; callers must not
// migrate or silently repair older project data.
func Validate(document Document) error {
	return validate(document)
}

func WriteFile(path string, document Document, thumbnail []byte) error {
	if !strings.EqualFold(filepath.Ext(path), ".pixio") {
		return fmt.Errorf("project path must use .pixio")
	}
	if err := Validate(document); err != nil {
		return err
	}
	if int64(len(thumbnail)) > maxThumbnailBytes {
		return fmt.Errorf("thumbnail exceeds %d bytes", maxThumbnailBytes)
	}
	if len(thumbnail) > 0 && !validPNG(thumbnail) {
		return fmt.Errorf("thumbnail is not a PNG image")
	}
	directory := filepath.Dir(path)
	temporary, err := os.CreateTemp(directory, ".pixio-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary project: %w", err)
	}
	temporaryPath := temporary.Name()
	defer func() { _ = os.Remove(temporaryPath) }()
	if err := writeTo(temporary, document, thumbnail); err != nil {
		_ = temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("sync temporary project: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary project: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace project: %w", err)
	}
	return nil
}

func ReadFile(path string) (Document, []byte, error) {
	if !strings.EqualFold(filepath.Ext(path), ".pixio") {
		return Document{}, nil, fmt.Errorf("project path must use .pixio")
	}
	archive, err := zip.OpenReader(path)
	if err != nil {
		return Document{}, nil, fmt.Errorf("open project: %w", err)
	}
	defer archive.Close()
	files := make(map[string]*zip.File, len(archive.File))
	for _, file := range archive.File {
		if file.FileInfo().IsDir() || strings.Contains(file.Name, "\\") || strings.HasPrefix(file.Name, "/") || strings.Contains(file.Name, "..") {
			return Document{}, nil, fmt.Errorf("invalid project entry %q", file.Name)
		}
		if _, exists := files[file.Name]; exists {
			return Document{}, nil, fmt.Errorf("duplicate project entry %q", file.Name)
		}
		files[file.Name] = file
	}
	manifestFile := files["manifest.json"]
	if manifestFile == nil {
		return Document{}, nil, fmt.Errorf("project is missing manifest.json")
	}
	data, err := readZipFile(manifestFile, maxManifestBytes)
	if err != nil {
		return Document{}, nil, err
	}
	var stored manifest
	if err := json.Unmarshal(data, &stored); err != nil {
		return Document{}, nil, fmt.Errorf("decode manifest: %w", err)
	}
	if err := validateManifest(stored, files); err != nil {
		return Document{}, nil, err
	}
	colorProfile := ColorProfile{Type: stored.ColorProfile.Type, Name: stored.ColorProfile.Name}
	if stored.ColorProfile.Path != "" {
		profileFile := files[stored.ColorProfile.Path]
		if profileFile == nil {
			return Document{}, nil, fmt.Errorf("project is missing color profile %q", stored.ColorProfile.Path)
		}
		colorProfile.Data, err = readZipFile(profileFile, maxICCBytes)
		if err != nil {
			return Document{}, nil, err
		}
	}
	tilesets := make([]Tileset, 0, len(stored.Tilesets))
	for _, storedTileset := range stored.Tilesets {
		tileset := Tileset{ID: storedTileset.ID, Name: storedTileset.Name, TileWidth: storedTileset.TileWidth, TileHeight: storedTileset.TileHeight, Grid: storedTileset.Grid, Terrains: storedTileset.Terrains}
		for _, storedTile := range storedTileset.Tiles {
			file := files[storedTile.Path]
			if file == nil {
				return Document{}, nil, fmt.Errorf("project is missing tile image %q", storedTile.Path)
			}
			pixels, tileErr := decodeCel(file, storedTileset.TileWidth, storedTileset.TileHeight)
			if tileErr != nil {
				return Document{}, nil, tileErr
			}
			var indexes []byte
			if storedTile.IndexPath != "" {
				indexFile := files[storedTile.IndexPath]
				if indexFile == nil {
					return Document{}, nil, fmt.Errorf("project is missing tile indexes %q", storedTile.IndexPath)
				}
				indexes, tileErr = readZipFile(indexFile, maxCelIndexBytes)
				if tileErr != nil {
					return Document{}, nil, tileErr
				}
				expectedIndexes, _ := expectedIndexBytes(storedTileset.TileWidth, storedTileset.TileHeight)
				if len(indexes) != expectedIndexes {
					return Document{}, nil, fmt.Errorf("tile indexes %q dimensions do not match manifest", indexFile.Name)
				}
			}
			tileset.Tiles = append(tileset.Tiles, Tile{ID: storedTile.ID, Pixels: pixels, Indexes: indexes})
		}
		tilesets = append(tilesets, tileset)
	}
	document := Document{
		FormatVersion:    stored.FormatVersion,
		Name:             stored.Name,
		Width:            stored.Width,
		Height:           stored.Height,
		ColorMode:        stored.ColorMode,
		ColorProfile:     colorProfile,
		PixelAspectRatio: stored.PixelAspectRatio,
		Palette:          stored.Palette,
		Tilesets:         tilesets,
		Layers:           stored.Layers,
		Frames:           stored.Frames,
		Tags:             stored.Tags,
		Slices:           stored.Slices,
		Guides:           stored.Guides,
		Settings:         stored.Settings,
		ActiveLayerID:    stored.ActiveLayerID,
		ActiveFrameID:    stored.ActiveFrameID,
	}
	for _, storedCel := range stored.Cels {
		file := files[storedCel.Path]
		if file == nil {
			return Document{}, nil, fmt.Errorf("project is missing cel image %q", storedCel.Path)
		}
		pixels, err := decodeCel(file, storedCel.Width, storedCel.Height)
		if err != nil {
			return Document{}, nil, err
		}
		var indexes []byte
		if storedCel.IndexPath != "" {
			indexFile := files[storedCel.IndexPath]
			if indexFile == nil {
				return Document{}, nil, fmt.Errorf("project is missing cel indexes %q", storedCel.IndexPath)
			}
			indexes, err = readZipFile(indexFile, maxCelIndexBytes)
			if err != nil {
				return Document{}, nil, err
			}
			expectedIndexes, _ := expectedIndexBytes(storedCel.Width, storedCel.Height)
			if len(indexes) != expectedIndexes {
				return Document{}, nil, fmt.Errorf("cel indexes %q dimensions do not match manifest", indexFile.Name)
			}
		}
		var tilemap *TilemapData
		if storedCel.TilemapPath != "" {
			tilemapFile := files[storedCel.TilemapPath]
			if tilemapFile == nil {
				return Document{}, nil, fmt.Errorf("project is missing cel tilemap %q", storedCel.TilemapPath)
			}
			cells, tileErr := readZipFile(tilemapFile, maxTilemapBytes)
			if tileErr != nil {
				return Document{}, nil, tileErr
			}
			tilemap = &TilemapData{Columns: storedCel.TilemapColumns, Rows: storedCel.TilemapRows, GridOffset: storedCel.TilemapGridOffset, Tiles: cells}
		}
		var terrainMap *TerrainMapData
		if storedCel.TerrainMapPath != "" {
			terrainFile := files[storedCel.TerrainMapPath]
			if terrainFile == nil {
				return Document{}, nil, fmt.Errorf("project is missing cel terrain map %q", storedCel.TerrainMapPath)
			}
			terrains, terrainErr := readZipFile(terrainFile, maxTerrainMapBytes)
			if terrainErr != nil {
				return Document{}, nil, terrainErr
			}
			terrainMap = &TerrainMapData{Columns: storedCel.TerrainMapColumns, Rows: storedCel.TerrainMapRows, Seed: storedCel.TerrainMapSeed, Terrains: terrains}
		}
		document.Cels = append(document.Cels, Cel{ID: storedCel.ID, LinkID: storedCel.LinkID, LayerID: storedCel.LayerID, FrameID: storedCel.FrameID, X: storedCel.X, Y: storedCel.Y, Width: storedCel.Width, Height: storedCel.Height, Opacity: storedCel.Opacity, ZIndex: storedCel.ZIndex, Pixels: pixels, Indexes: indexes, Tilemap: tilemap, TerrainMap: terrainMap})
	}
	if err := validate(document); err != nil {
		return Document{}, nil, err
	}
	var thumbnail []byte
	if file := files["thumbnail.png"]; file != nil {
		thumbnail, err = readZipFile(file, maxThumbnailBytes)
		if err != nil {
			return Document{}, nil, err
		}
		if !validPNG(thumbnail) {
			return Document{}, nil, fmt.Errorf("thumbnail is not a PNG image")
		}
	}
	return document, thumbnail, nil
}

func writeTo(writer io.Writer, document Document, thumbnail []byte) error {
	archive := zip.NewWriter(writer)
	if len(thumbnail) == 0 {
		var err error
		thumbnail, err = renderThumbnail(document)
		if err != nil {
			return fmt.Errorf("encode thumbnail: %w", err)
		}
	}
	if int64(len(thumbnail)) > maxThumbnailBytes {
		return fmt.Errorf("thumbnail exceeds %d bytes", maxThumbnailBytes)
	}
	entries := make([]manifestCel, 0, len(document.Cels))
	cels := append([]Cel(nil), document.Cels...)
	sort.Slice(cels, func(i, j int) bool { return cels[i].ID < cels[j].ID })
	for _, cel := range cels {
		path := "cels/" + cel.ID + ".png"
		indexPath := ""
		tilemapPath := ""
		tilemapColumns, tilemapRows, tilemapGridOffset := 0, 0, ""
		terrainMapPath := ""
		terrainMapColumns, terrainMapRows := 0, 0
		var terrainMapSeed int64
		if document.ColorMode == ColorModeIndexed {
			indexPath = "cels/" + cel.ID + ".idx"
		}
		if cel.Tilemap != nil {
			tilemapPath = "tilemaps/" + cel.ID + ".bin"
			tilemapColumns, tilemapRows = cel.Tilemap.Columns, cel.Tilemap.Rows
			tilemapGridOffset = cel.Tilemap.GridOffset
		}
		if cel.TerrainMap != nil {
			terrainMapPath = "terrainmaps/" + cel.ID + ".bin"
			terrainMapColumns, terrainMapRows = cel.TerrainMap.Columns, cel.TerrainMap.Rows
			terrainMapSeed = cel.TerrainMap.Seed
		}
		entries = append(entries, manifestCel{ID: cel.ID, LinkID: cel.LinkID, LayerID: cel.LayerID, FrameID: cel.FrameID, X: cel.X, Y: cel.Y, Width: cel.Width, Height: cel.Height, Opacity: cel.Opacity, ZIndex: cel.ZIndex, Path: path, IndexPath: indexPath, TilemapPath: tilemapPath, TilemapColumns: tilemapColumns, TilemapRows: tilemapRows, TilemapGridOffset: tilemapGridOffset, TerrainMapPath: terrainMapPath, TerrainMapColumns: terrainMapColumns, TerrainMapRows: terrainMapRows, TerrainMapSeed: terrainMapSeed})
		var encoded limitedBuffer
		encoded.maximum = maxCelPNGBytes
		if err := png.Encode(&encoded, &image.NRGBA{Pix: cel.Pixels, Stride: cel.Width * 4, Rect: image.Rect(0, 0, cel.Width, cel.Height)}); err != nil {
			return fmt.Errorf("encode cel %q: %w", cel.ID, err)
		}
		file, err := archive.Create(path)
		if err != nil {
			return fmt.Errorf("create cel entry: %w", err)
		}
		if written, err := file.Write(encoded.Bytes()); err != nil {
			return fmt.Errorf("write cel %q: %w", cel.ID, err)
		} else if written != encoded.Len() {
			return fmt.Errorf("write cel %q: short write", cel.ID)
		}
		if indexPath != "" {
			indexFile, err := archive.Create(indexPath)
			if err != nil {
				return fmt.Errorf("create cel indexes: %w", err)
			}
			if written, err := indexFile.Write(cel.Indexes); err != nil {
				return fmt.Errorf("write cel indexes %q: %w", cel.ID, err)
			} else if written != len(cel.Indexes) {
				return fmt.Errorf("write cel indexes %q: short write", cel.ID)
			}
		}
		if tilemapPath != "" {
			file, err := archive.Create(tilemapPath)
			if err != nil {
				return fmt.Errorf("create cel tilemap entry: %w", err)
			}
			if written, err := file.Write(cel.Tilemap.Tiles); err != nil {
				return fmt.Errorf("write cel tilemap %q: %w", cel.ID, err)
			} else if written != len(cel.Tilemap.Tiles) {
				return fmt.Errorf("write cel tilemap %q: short write", cel.ID)
			}
		}
		if terrainMapPath != "" {
			file, err := archive.Create(terrainMapPath)
			if err != nil {
				return fmt.Errorf("create cel terrain map entry: %w", err)
			}
			if written, err := file.Write(cel.TerrainMap.Terrains); err != nil {
				return fmt.Errorf("write cel terrain map %q: %w", cel.ID, err)
			} else if written != len(cel.TerrainMap.Terrains) {
				return fmt.Errorf("write cel terrain map %q: short write", cel.ID)
			}
		}
	}
	manifestTilesets := make([]manifestTileset, 0, len(document.Tilesets))
	for _, tileset := range document.Tilesets {
		storedTileset := manifestTileset{ID: tileset.ID, Name: tileset.Name, TileWidth: tileset.TileWidth, TileHeight: tileset.TileHeight, Grid: tileset.Grid, Terrains: tileset.Terrains}
		for _, tile := range tileset.Tiles {
			path := fmt.Sprintf("tilesets/%s/%d.png", tileset.ID, tile.ID)
			indexPath := ""
			if document.ColorMode == ColorModeIndexed {
				indexPath = fmt.Sprintf("tilesets/%s/%d.idx", tileset.ID, tile.ID)
			}
			storedTileset.Tiles = append(storedTileset.Tiles, manifestTile{ID: tile.ID, Path: path, IndexPath: indexPath})
			var encoded limitedBuffer
			encoded.maximum = maxTilePNGBytes
			if err := png.Encode(&encoded, &image.NRGBA{Pix: tile.Pixels, Stride: tileset.TileWidth * 4, Rect: image.Rect(0, 0, tileset.TileWidth, tileset.TileHeight)}); err != nil {
				return fmt.Errorf("encode tile %d in tileset %q: %w", tile.ID, tileset.ID, err)
			}
			file, err := archive.Create(path)
			if err != nil {
				return fmt.Errorf("create tile entry: %w", err)
			}
			if written, err := file.Write(encoded.Bytes()); err != nil {
				return fmt.Errorf("write tile %d in tileset %q: %w", tile.ID, tileset.ID, err)
			} else if written != encoded.Len() {
				return fmt.Errorf("write tile %d in tileset %q: short write", tile.ID, tileset.ID)
			}
			if indexPath != "" {
				indexFile, err := archive.Create(indexPath)
				if err != nil {
					return fmt.Errorf("create tile indexes: %w", err)
				}
				if written, err := indexFile.Write(tile.Indexes); err != nil {
					return fmt.Errorf("write tile indexes %d in tileset %q: %w", tile.ID, tileset.ID, err)
				} else if written != len(tile.Indexes) {
					return fmt.Errorf("write tile indexes %d in tileset %q: short write", tile.ID, tileset.ID)
				}
			}
		}
		manifestTilesets = append(manifestTilesets, storedTileset)
	}
	profile := manifestColorProfile{Type: document.ColorProfile.Type, Name: document.ColorProfile.Name}
	if document.ColorProfile.Type == ColorProfileEmbedded {
		profile.Path = "profiles/profile.icc"
		file, err := archive.Create(profile.Path)
		if err != nil {
			return fmt.Errorf("create color profile entry: %w", err)
		}
		if written, err := file.Write(document.ColorProfile.Data); err != nil {
			return fmt.Errorf("write color profile: %w", err)
		} else if written != len(document.ColorProfile.Data) {
			return fmt.Errorf("write color profile: short write")
		}
	}
	manifestData, err := json.Marshal(manifest{FormatVersion: document.FormatVersion, Name: document.Name, Width: document.Width, Height: document.Height, ColorMode: document.ColorMode, ColorProfile: profile, PixelAspectRatio: document.PixelAspectRatio, Palette: document.Palette, Tilesets: manifestTilesets, Layers: document.Layers, Frames: document.Frames, Tags: document.Tags, Slices: document.Slices, Guides: document.Guides, Settings: document.Settings, Cels: entries, ActiveLayerID: document.ActiveLayerID, ActiveFrameID: document.ActiveFrameID})
	if err != nil {
		return fmt.Errorf("encode manifest: %w", err)
	}
	if int64(len(manifestData)) > maxManifestBytes {
		return fmt.Errorf("manifest exceeds %d bytes", maxManifestBytes)
	}
	manifestFile, err := archive.Create("manifest.json")
	if err != nil {
		return fmt.Errorf("create manifest: %w", err)
	}
	if _, err := manifestFile.Write(manifestData); err != nil {
		return fmt.Errorf("write manifest: %w", err)
	}
	file, err := archive.Create("thumbnail.png")
	if err != nil {
		return fmt.Errorf("create thumbnail: %w", err)
	}
	if _, err := file.Write(thumbnail); err != nil {
		return fmt.Errorf("write thumbnail: %w", err)
	}
	if err := archive.Close(); err != nil {
		return fmt.Errorf("close project archive: %w", err)
	}
	return nil
}

func validate(document Document) error {
	if err := validateMetadata(document); err != nil {
		return err
	}
	celIDs := map[string]bool{}
	celRefs := map[celReference]bool{}
	links := map[string]celLink{}
	for _, cel := range document.Cels {
		reference := celReference{layerID: cel.LayerID, frameID: cel.FrameID}
		pixelBytes, dimensionsOK := expectedPixelBytes(cel.Width, cel.Height)
		indexBytes, indexDimensionsOK := expectedIndexBytes(cel.Width, cel.Height)
		indexesValid := indexDimensionsOK && ((document.ColorMode == ColorModeIndexed && cel.Indexes != nil && len(cel.Indexes) == indexBytes && indexedCacheMatches(cel.Indexes, cel.Pixels, document.Palette)) || (document.ColorMode != ColorModeIndexed && cel.Indexes == nil))
		layer, layerExists := layerByID(document.Layers, cel.LayerID)
		tilemapValid := layerExists && validateCelTilemap(document, cel, layer)
		if !validCelID(cel.ID) || !validCelID(cel.LinkID) || celIDs[cel.ID] || !validCelReference(cel, document) || celRefs[reference] || !dimensionsOK || len(cel.Pixels) != pixelBytes || !indexesValid || !tilemapValid || !validCelOpacity(cel.Opacity) || !validCelZIndex(cel.ZIndex) || !validCelLayerProperties(layer.Role, cel.Opacity, cel.ZIndex) {
			return fmt.Errorf("invalid cel")
		}
		if previous, exists := links[cel.LinkID]; exists && (previous.width != cel.Width || previous.height != cel.Height || !bytes.Equal(previous.pixels, cel.Pixels) || !bytes.Equal(previous.indexes, cel.Indexes) || !equalTilemaps(previous.tilemap, cel.Tilemap) || !equalTerrainMaps(previous.terrainMap, cel.TerrainMap)) {
			return fmt.Errorf("invalid cel")
		}
		celIDs[cel.ID] = true
		celRefs[reference] = true
		if _, exists := links[cel.LinkID]; !exists {
			links[cel.LinkID] = celLink{width: cel.Width, height: cel.Height, pixels: cel.Pixels, indexes: cel.Indexes, tilemap: cel.Tilemap, terrainMap: cel.TerrainMap}
		}
	}
	return nil
}

func validateMetadata(document Document) error {
	if document.FormatVersion != FormatVersion {
		return fmt.Errorf("unsupported .pixio format version %d", document.FormatVersion)
	}
	if document.Width <= 0 || document.Height <= 0 || document.Width > maxCanvasDimension || document.Height > maxCanvasDimension {
		return fmt.Errorf("invalid canvas dimensions")
	}
	if !validColorMode(document.ColorMode) || len(document.Layers) == 0 || len(document.Frames) == 0 || document.Tags == nil || document.Slices == nil || document.Guides == nil || document.Tilesets == nil {
		return fmt.Errorf("invalid project document")
	}
	if !validColorProfile(document.ColorProfile) {
		return fmt.Errorf("invalid color profile")
	}
	if document.PixelAspectRatio.Width < 1 || document.PixelAspectRatio.Width > 64 || document.PixelAspectRatio.Height < 1 || document.PixelAspectRatio.Height > 64 {
		return fmt.Errorf("invalid pixel aspect ratio")
	}
	if document.Palette.Colors == nil || len(document.Palette.Colors) > 256 || document.Palette.TransparentIndex < 0 || document.Palette.TransparentIndex >= max(1, len(document.Palette.Colors)) {
		return fmt.Errorf("invalid palette")
	}
	for _, paletteColor := range document.Palette.Colors {
		if !validHexColor(paletteColor) {
			return fmt.Errorf("invalid palette")
		}
	}
	layers, frames := map[string]Layer{}, map[string]bool{}
	tilesets, err := validateTilesets(document.Tilesets, document.ColorMode, document.Palette)
	if err != nil {
		return err
	}
	for _, layer := range document.Layers {
		if layer.ID == "" || layers[layer.ID].ID != "" || strings.TrimSpace(layer.Name) == "" || !validLayerKind(layer.Kind) || !validLayerRole(layer.Role) || !validBlendMode(layer.BlendMode) || math.IsNaN(layer.Opacity) || math.IsInf(layer.Opacity, 0) || layer.Opacity < 0 || layer.Opacity > 1 || (layer.Kind == LayerKindTilemap && (layer.TilesetID == "" || !tilesets[layer.TilesetID])) || (layer.Kind != LayerKindTilemap && layer.TilesetID != "") {
			return fmt.Errorf("invalid layer")
		}
		layers[layer.ID] = layer
	}
	for _, frame := range document.Frames {
		if frame.ID == "" || frames[frame.ID] || frame.DurationMS <= 0 {
			return fmt.Errorf("invalid frame")
		}
		frames[frame.ID] = true
	}
	if err := validateLayerHierarchy(layers); err != nil {
		return err
	}
	tagIDs := map[string]bool{}
	for _, tag := range document.Tags {
		if tag.ID == "" || tagIDs[tag.ID] || strings.TrimSpace(tag.Name) == "" || !frames[tag.FromFrameID] || !frames[tag.ToFrameID] || !validTagDirection(tag.Direction) || !validHexColor(tag.Color) || tag.Repeat < 0 || tag.Repeat > 65535 {
			return fmt.Errorf("invalid frame tag")
		}
		tagIDs[tag.ID] = true
	}
	if err := validateSlices(document.Slices, frames, document.Width, document.Height); err != nil {
		return err
	}
	if err := validateGuides(document.Guides, document.Width, document.Height); err != nil {
		return err
	}
	if err := validateSettings(document.Settings, document.Width, document.Height); err != nil {
		return err
	}
	if layers[document.ActiveLayerID].ID == "" || !frames[document.ActiveFrameID] {
		return fmt.Errorf("invalid active layer or frame")
	}
	return nil
}

type celReference struct {
	layerID string
	frameID string
}

type celLink struct {
	width      int
	height     int
	pixels     []byte
	indexes    []byte
	tilemap    *TilemapData
	terrainMap *TerrainMapData
}

func layerByID(layers []Layer, id string) (Layer, bool) {
	for _, layer := range layers {
		if layer.ID == id {
			return layer, true
		}
	}
	return Layer{}, false
}

func equalTilemaps(left, right *TilemapData) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Columns == right.Columns && left.Rows == right.Rows && left.GridOffset == right.GridOffset && bytes.Equal(left.Tiles, right.Tiles)
}

func equalTerrainMaps(left, right *TerrainMapData) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Columns == right.Columns && left.Rows == right.Rows && left.Seed == right.Seed && bytes.Equal(left.Terrains, right.Terrains)
}

func validateCelTilemap(document Document, cel Cel, layer Layer) bool {
	if layer.Kind != LayerKindTilemap {
		return cel.Tilemap == nil && cel.TerrainMap == nil
	}
	if cel.Tilemap == nil {
		return false
	}
	tileset, exists := findTileset(document.Tilesets, layer.TilesetID)
	if !exists || !validTilemapGridOffset(*cel.Tilemap, tileset.Grid) {
		return false
	}
	tileset = tilesetForTilemap(tileset, *cel.Tilemap)
	if !validTilemapGeometry(cel.Width, cel.Height, *cel.Tilemap, tileset) {
		return false
	}
	if len(cel.Tilemap.Tiles) != cel.Tilemap.Columns*cel.Tilemap.Rows*4 || len(cel.Tilemap.Tiles) > maxTilemapBytes {
		return false
	}
	tileIDs := make(map[int]bool, len(tileset.Tiles))
	for _, tile := range tileset.Tiles {
		tileIDs[tile.ID] = true
	}
	for offset := 0; offset < len(cel.Tilemap.Tiles); offset += 4 {
		value := binary.LittleEndian.Uint32(cel.Tilemap.Tiles[offset : offset+4])
		if value&^uint32(tileIndexMask|tileFlagMask) != 0 || value&tileIndexMask != 0 && !tileIDs[int(value&tileIndexMask)] {
			return false
		}
		if value&tileFlipDiagonal != 0 && tileset.TileWidth != tileset.TileHeight {
			return false
		}
	}
	if cel.TerrainMap != nil {
		if cel.TerrainMap.Columns != cel.Tilemap.Columns || cel.TerrainMap.Rows != cel.Tilemap.Rows || len(cel.TerrainMap.Terrains) != cel.TerrainMap.Columns*cel.TerrainMap.Rows*2 || len(cel.TerrainMap.Terrains) > maxTerrainMapBytes {
			return false
		}
		for offset := 0; offset < len(cel.TerrainMap.Terrains); offset += 2 {
			terrainID := int(binary.LittleEndian.Uint16(cel.TerrainMap.Terrains[offset : offset+2]))
			if terrainID != terrainUnspecifiedID && terrainID != terrainEmptyID && !terrainDefinitionExists(tileset.Terrains, terrainID) {
				return false
			}
		}
		expectedTilemap := renderTerrainTilemap(*cel.TerrainMap, tileset)
		if !bytes.Equal(expectedTilemap, cel.Tilemap.Tiles) {
			return false
		}
	}
	rendered := renderTilemapCache(cel.Width, cel.Height, *cel.Tilemap, tileset)
	return bytes.Equal(rendered, cel.Pixels)
}

func terrainDefinitionExists(definitions []TerrainDefinition, id int) bool {
	for _, definition := range definitions {
		if definition.ID == id {
			return true
		}
	}
	return false
}

func findTileset(tilesets []Tileset, id string) (Tileset, bool) {
	for _, tileset := range tilesets {
		if tileset.ID == id {
			return tileset, true
		}
	}
	return Tileset{}, false
}

func renderTilemapCache(width, height int, tilemap TilemapData, tileset Tileset) []byte {
	tileset = tilesetForTilemap(tileset, tilemap)
	output := make([]byte, width*height*4)
	tiles := make(map[int]Tile, len(tileset.Tiles))
	for _, tile := range tileset.Tiles {
		tiles[tile.ID] = tile
	}
	layout := tilemapLayoutFor(tileset, tilemap.Columns, tilemap.Rows)
	cells := make([]terrainCell, 0, tilemap.Columns*tilemap.Rows)
	for row := 0; row < tilemap.Rows; row++ {
		for column := 0; column < tilemap.Columns; column++ {
			cells = append(cells, terrainCell{column: column, row: row})
		}
	}
	sort.SliceStable(cells, func(left, right int) bool {
		return tilemapCellComesBefore(tileset, layout, cells[left], cells[right])
	})
	for _, cell := range cells {
		cellIndex := (cell.row*tilemap.Columns + cell.column) * 4
		value := binary.LittleEndian.Uint32(tilemap.Tiles[cellIndex:])
		tile, exists := tiles[int(value&tileIndexMask)]
		if !exists || value&tileIndexMask == 0 {
			continue
		}
		originX, originY := tilemapImageOrigin(tileset, layout, cell)
		startX, startY := int(math.Round(originX)), int(math.Round(originY))
		for y := 0; y < tileset.TileHeight; y++ {
			targetY := startY + y
			if targetY < 0 || targetY >= height {
				continue
			}
			for x := 0; x < tileset.TileWidth; x++ {
				targetX := startX + x
				if targetX < 0 || targetX >= width {
					continue
				}
				sourceX, sourceY := x, y
				if value&tileFlipDiagonal != 0 {
					sourceX, sourceY = sourceY, sourceX
				}
				if value&tileFlipX != 0 {
					sourceX = tileset.TileWidth - 1 - sourceX
				}
				if value&tileFlipY != 0 {
					sourceY = tileset.TileHeight - 1 - sourceY
				}
				sourceIndex := (sourceY*tileset.TileWidth + sourceX) * 4
				targetIndex := (targetY*width + targetX) * 4
				if tileset.Grid.Kind == TileGridOrthogonal {
					copy(output[targetIndex:targetIndex+4], tile.Pixels[sourceIndex:sourceIndex+4])
					continue
				}
				sourceAlpha := tile.Pixels[sourceIndex+3]
				if sourceAlpha == 0 {
					continue
				}
				if tile.Indexes != nil {
					copy(output[targetIndex:targetIndex+4], tile.Pixels[sourceIndex:sourceIndex+4])
					continue
				}
				targetAlpha := output[targetIndex+3]
				if sourceAlpha == 255 || targetAlpha == 0 {
					copy(output[targetIndex:targetIndex+4], tile.Pixels[sourceIndex:sourceIndex+4])
					continue
				}
				sa, da := int64(sourceAlpha), int64(targetAlpha)
				aNumerator := sa*255 + da*(255-sa)
				for channel := 0; channel < 3; channel++ {
					source := int64(tile.Pixels[sourceIndex+channel])
					destination := int64(output[targetIndex+channel])
					numerator := source*sa*255 + destination*da*(255-sa)
					output[targetIndex+channel] = byte(math.Floor(float64(numerator)/float64(aNumerator) + 0.5))
				}
				output[targetIndex+3] = byte(math.Floor(float64(aNumerator)/255 + 0.5))
			}
		}
	}
	return output
}

func validTilemapGeometry(width, height int, tilemap TilemapData, tileset Tileset) bool {
	if !validTilemapGridOffset(tilemap, tileset.Grid) {
		return false
	}
	tileset = tilesetForTilemap(tileset, tilemap)
	if tilemap.Columns <= 0 || tilemap.Rows <= 0 || tileset.TileWidth <= 0 || tileset.TileHeight <= 0 {
		return false
	}
	if tileset.Grid.Kind == TileGridOrthogonal {
		return tilemap.Columns == (width+tileset.TileWidth-1)/tileset.TileWidth && tilemap.Rows == (height+tileset.TileHeight-1)/tileset.TileHeight
	}
	expectedWidth, expectedHeight := tilemapPixelSize(tileset, tilemap.Columns, tilemap.Rows)
	return width == expectedWidth && height == expectedHeight
}

func validTilemapGridOffset(tilemap TilemapData, grid TilesetGrid) bool {
	if tilemap.GridOffset == "" {
		return true
	}
	if grid.Kind != TileGridHexagonal {
		return false
	}
	if grid.Orientation == "pointy" {
		return tilemap.GridOffset == "odd-r" || tilemap.GridOffset == "even-r"
	}
	return tilemap.GridOffset == "odd-q" || tilemap.GridOffset == "even-q"
}

func tilesetForTilemap(tileset Tileset, tilemap TilemapData) Tileset {
	if tilemap.GridOffset != "" && tileset.Grid.Kind == TileGridHexagonal {
		tileset.Grid.Offset = tilemap.GridOffset
	}
	return tileset
}

type tilemapLayout struct {
	offsetX float64
	offsetY float64
}

func tilemapPixelSize(tileset Tileset, columns, rows int) (int, int) {
	if columns <= 0 || rows <= 0 {
		return 0, 0
	}
	if tileset.Grid.Kind == TileGridOrthogonal {
		return columns * tileset.TileWidth, rows * tileset.TileHeight
	}
	layout := tilemapLayoutFor(tileset, columns, rows)
	maxX, maxY := 0.0, 0.0
	for _, cell := range tilemapBoundsCells(tileset, columns, rows) {
		originX, originY := tilemapImageOrigin(tileset, layout, cell)
		if originX+float64(tileset.TileWidth) > maxX {
			maxX = originX + float64(tileset.TileWidth)
		}
		if originY+float64(tileset.TileHeight) > maxY {
			maxY = originY + float64(tileset.TileHeight)
		}
	}
	return int(math.Ceil(maxX)), int(math.Ceil(maxY))
}

func tilemapLayoutFor(tileset Tileset, columns, rows int) tilemapLayout {
	if tileset.Grid.Kind == TileGridOrthogonal {
		return tilemapLayout{}
	}
	minX, minY := math.Inf(1), math.Inf(1)
	for _, cell := range tilemapBoundsCells(tileset, columns, rows) {
		x, y := tilemapBaseImageOrigin(tileset, cell)
		if x < minX {
			minX = x
		}
		if y < minY {
			minY = y
		}
	}
	return tilemapLayout{offsetX: -minX, offsetY: -minY}
}

func tilemapCornerCells(columns, rows int) []terrainCell {
	return []terrainCell{
		{column: 0, row: 0},
		{column: columns - 1, row: 0},
		{column: 0, row: rows - 1},
		{column: columns - 1, row: rows - 1},
	}
}

func tilemapBoundsCells(tileset Tileset, columns, rows int) []terrainCell {
	if tileset.Grid.Kind != TileGridHexagonal {
		return tilemapCornerCells(columns, rows)
	}
	columnCandidates := tilemapBoundaryIndices(columns)
	rowCandidates := tilemapBoundaryIndices(rows)
	cells := make([]terrainCell, 0, len(columnCandidates)*len(rowCandidates))
	for _, row := range rowCandidates {
		for _, column := range columnCandidates {
			cells = append(cells, terrainCell{column: column, row: row})
		}
	}
	return cells
}

func tilemapBoundaryIndices(size int) []int {
	if size <= 0 {
		return nil
	}
	if size <= 4 {
		indices := make([]int, size)
		for index := range indices {
			indices[index] = index
		}
		return indices
	}
	return []int{0, 1, size - 2, size - 1}
}

func tilemapImageOrigin(tileset Tileset, layout tilemapLayout, cell terrainCell) (float64, float64) {
	x, y := tilemapBaseImageOrigin(tileset, cell)
	return x + layout.offsetX, y + layout.offsetY
}

func tilemapBaseImageOrigin(tileset Tileset, cell terrainCell) (float64, float64) {
	switch tileset.Grid.Kind {
	case TileGridOrthogonal:
		return float64(cell.column) * float64(tileset.TileWidth), float64(cell.row) * float64(tileset.TileHeight)
	case TileGridIsometric:
		cellWidth, cellHeight := float64(tileset.Grid.CellWidth), float64(tileset.Grid.CellHeight)
		return float64(cell.column-cell.row)*cellWidth/2 - float64(tileset.Grid.AnchorX), float64(cell.column+cell.row)*cellHeight/2 + cellHeight - float64(tileset.Grid.AnchorY)
	case TileGridHexagonal:
		width, height := float64(tileset.TileWidth), float64(tileset.TileHeight)
		axial := offsetToAxial(tileset.Grid, cell)
		if tileset.Grid.Orientation == "pointy" {
			return width * (float64(axial.column) + float64(axial.row)/2), height * 0.75 * float64(axial.row)
		}
		return width * 0.75 * float64(axial.column), height * (float64(axial.row) + float64(axial.column)/2)
	default:
		return 0, 0
	}
}

func tilemapCellComesBefore(tileset Tileset, layout tilemapLayout, left, right terrainCell) bool {
	if tileset.Grid.Kind == TileGridIsometric {
		leftDepth := left.column + left.row
		rightDepth := right.column + right.row
		if leftDepth != rightDepth {
			return leftDepth < rightDepth
		}
	} else if tileset.Grid.Kind == TileGridHexagonal {
		_, leftY := tilemapImageOrigin(tileset, layout, left)
		_, rightY := tilemapImageOrigin(tileset, layout, right)
		if leftY != rightY {
			return leftY < rightY
		}
	}
	if left.row != right.row {
		return left.row < right.row
	}
	return left.column < right.column
}

type terrainCell struct {
	column int
	row    int
}

func renderTerrainTilemap(terrainMap TerrainMapData, tileset Tileset) []byte {
	output := make([]byte, terrainMap.Columns*terrainMap.Rows*4)
	for row := 0; row < terrainMap.Rows; row++ {
		for column := 0; column < terrainMap.Columns; column++ {
			terrainID := int(binary.LittleEndian.Uint16(terrainMap.Terrains[(row*terrainMap.Columns+column)*2:]))
			value := resolveTerrainTile(terrainMap, tileset.Terrains, tileset.Grid, column, row, terrainID)
			binary.LittleEndian.PutUint32(output[(row*terrainMap.Columns+column)*4:], value)
		}
	}
	return output
}

func resolveTerrainTile(terrainMap TerrainMapData, definitions []TerrainDefinition, grid TilesetGrid, column, row, terrainID int) uint32 {
	if terrainID == terrainUnspecifiedID || terrainID == terrainEmptyID {
		return 0
	}
	definition, exists := findTerrainDefinition(definitions, terrainID)
	if !exists {
		return 0
	}
	mask := terrainMaskAt(terrainMap, definition, grid, column, row)
	rule, exists := findTerrainRule(definition.Rules, mask)
	if !exists {
		return 0
	}
	return chooseTerrainCandidate(rule.Candidates, terrainMap.Seed, column, row)
}

func findTerrainDefinition(definitions []TerrainDefinition, id int) (TerrainDefinition, bool) {
	for _, definition := range definitions {
		if definition.ID == id {
			return definition, true
		}
	}
	return TerrainDefinition{}, false
}

func terrainMaskAt(terrainMap TerrainMapData, definition TerrainDefinition, grid TilesetGrid, column, row int) uint32 {
	mask := uint32(0)
	for index, neighbor := range terrainNeighbors(grid, definition.NeighborMode, column, row) {
		resolved, boundary := resolveTerrainBoundary(terrainMap, definition.Boundary, neighbor)
		if boundary == terrainBoundarySame {
			mask |= uint32(1) << index
			continue
		}
		if boundary == terrainBoundaryOutside {
			continue
		}
		neighborID := int(binary.LittleEndian.Uint16(terrainMap.Terrains[(resolved.row*terrainMap.Columns+resolved.column)*2:]))
		if neighborID == definition.ID {
			mask |= uint32(1) << index
		}
	}
	if definition.NeighborMode == TerrainNeighborBlob8 {
		return normalizeBlobMask(mask)
	}
	return mask
}

// normalizeBlobMask removes diagonal blob8 bits that are not supported by
// both adjoining cardinal neighbors. Bits are ordered N, NE, E, SE, S, SW, W, NW.
func normalizeBlobMask(mask uint32) uint32 {
	normalized := mask
	for _, corner := range []uint{1, 3, 5, 7} {
		edges := (uint32(1) << (corner - 1)) | (uint32(1) << ((corner + 1) % 8))
		if mask&edges != edges {
			normalized &^= uint32(1) << corner
		}
	}
	return normalized
}

type terrainBoundaryResult uint8

const (
	terrainBoundaryInside terrainBoundaryResult = iota
	terrainBoundarySame
	terrainBoundaryOutside
)

func resolveTerrainBoundary(terrainMap TerrainMapData, boundary TerrainBoundary, cell terrainCell) (terrainCell, terrainBoundaryResult) {
	if cell.column >= 0 && cell.column < terrainMap.Columns && cell.row >= 0 && cell.row < terrainMap.Rows {
		return cell, terrainBoundaryInside
	}
	switch boundary {
	case TerrainBoundarySame:
		return cell, terrainBoundarySame
	case TerrainBoundaryWrap:
		cell.column = terrainModulo(cell.column, terrainMap.Columns)
		cell.row = terrainModulo(cell.row, terrainMap.Rows)
		return cell, terrainBoundaryInside
	default:
		return cell, terrainBoundaryOutside
	}
}

func terrainNeighbors(grid TilesetGrid, mode TerrainNeighborMode, column, row int) []terrainCell {
	if mode == TerrainNeighborBlob8 {
		return []terrainCell{
			{column: column, row: row - 1},
			{column: column + 1, row: row - 1},
			{column: column + 1, row: row},
			{column: column + 1, row: row + 1},
			{column: column, row: row + 1},
			{column: column - 1, row: row + 1},
			{column: column - 1, row: row},
			{column: column - 1, row: row - 1},
		}
	}
	if mode == TerrainNeighborEdge6 {
		axial := offsetToAxial(grid, terrainCell{column: column, row: row})
		directions := [...]terrainCell{{column: 1, row: 0}, {column: 1, row: -1}, {column: 0, row: -1}, {column: -1, row: 0}, {column: -1, row: 1}, {column: 0, row: 1}}
		neighbors := make([]terrainCell, 0, len(directions))
		for _, direction := range directions {
			neighbors = append(neighbors, axialToOffset(grid, terrainCell{column: axial.column + direction.column, row: axial.row + direction.row}))
		}
		return neighbors
	}
	return []terrainCell{
		{column: column, row: row - 1},
		{column: column + 1, row: row},
		{column: column, row: row + 1},
		{column: column - 1, row: row},
	}
}

func offsetToAxial(grid TilesetGrid, cell terrainCell) terrainCell {
	parity := terrainParity(cell.row)
	if grid.Kind == TileGridHexagonal && (grid.Offset == "odd-r" || grid.Offset == "even-r") {
		if grid.Offset == "odd-r" {
			return terrainCell{column: cell.column - (cell.row-parity)/2, row: cell.row}
		}
		return terrainCell{column: cell.column - (cell.row+parity)/2, row: cell.row}
	}
	parity = terrainParity(cell.column)
	if grid.Offset == "odd-q" {
		return terrainCell{column: cell.column, row: cell.row - (cell.column-parity)/2}
	}
	return terrainCell{column: cell.column, row: cell.row - (cell.column+parity)/2}
}

func axialToOffset(grid TilesetGrid, cell terrainCell) terrainCell {
	if grid.Offset == "odd-r" {
		return terrainCell{column: cell.column + (cell.row-terrainParity(cell.row))/2, row: cell.row}
	}
	if grid.Offset == "even-r" {
		return terrainCell{column: cell.column + (cell.row+terrainParity(cell.row))/2, row: cell.row}
	}
	if grid.Offset == "odd-q" {
		return terrainCell{column: cell.column, row: cell.row + (cell.column-terrainParity(cell.column))/2}
	}
	return terrainCell{column: cell.column, row: cell.row + (cell.column+terrainParity(cell.column))/2}
}

func terrainParity(value int) int {
	modulo := value % 2
	if modulo < 0 {
		return -modulo
	}
	return modulo
}

func terrainModulo(value, divisor int) int {
	result := value % divisor
	if result < 0 {
		result += divisor
	}
	return result
}

func findTerrainRule(rules []TerrainRule, mask uint32) (TerrainRule, bool) {
	var fallback TerrainRule
	fallbackFound := false
	for _, rule := range rules {
		if rule.Mask == mask {
			return rule, true
		}
		if !fallbackFound || rule.Mask < fallback.Mask {
			fallback = rule
			fallbackFound = true
		}
	}
	if !fallbackFound {
		return TerrainRule{}, false
	}
	for _, rule := range rules {
		if rule.Mask == 0 {
			return rule, true
		}
	}
	return fallback, true
}

func chooseTerrainCandidate(candidates []TerrainCandidate, seed int64, column, row int) uint32 {
	totalWeight := float64(0)
	for _, candidate := range candidates {
		totalWeight += candidate.Weight
	}
	if math.IsNaN(totalWeight) || math.IsInf(totalWeight, 0) || totalWeight <= 0 {
		return 0
	}
	target := float64(terrainHash(seed, column, row)) / 4294967296.0 * totalWeight
	for _, candidate := range candidates {
		if target < candidate.Weight {
			return uint32(candidate.TileID) | uint32(candidate.Flags)
		}
		target -= candidate.Weight
	}
	last := candidates[len(candidates)-1]
	return uint32(last.TileID) | uint32(last.Flags)
}

func terrainHash(seed int64, column, row int) uint32 {
	hash := uint32(2166136261) ^ uint32(seed)
	hash = hashTerrainInteger(hash, column)
	hash = hashTerrainInteger(hash, row)
	hash ^= hash >> 16
	hash *= uint32(0x85ebca6b)
	hash ^= hash >> 13
	hash *= uint32(0xc2b2ae35)
	hash ^= hash >> 16
	return hash
}

func hashTerrainInteger(hash uint32, value int) uint32 {
	hash ^= uint32(value)
	hash *= uint32(0x01000193)
	return hash
}

func expectedPixelBytes(width, height int) (int, bool) {
	if width <= 0 || height <= 0 || width > maxCanvasDimension || height > maxCanvasDimension {
		return 0, false
	}
	maxInt := int(^uint(0) >> 1)
	if height > maxInt/width {
		return 0, false
	}
	pixelCount := width * height
	if pixelCount > maxInt/4 {
		return 0, false
	}
	return pixelCount * 4, true
}

func expectedIndexBytes(width, height int) (int, bool) {
	if width <= 0 || height <= 0 || width > maxCanvasDimension || height > maxCanvasDimension {
		return 0, false
	}
	if height > int(^uint(0)>>1)/width {
		return 0, false
	}
	return width * height, true
}

func validLayerKind(kind LayerKind) bool {
	return kind == LayerKindImage || kind == LayerKindGroup || kind == LayerKindTilemap
}

func validColorProfile(profile ColorProfile) bool {
	if strings.TrimSpace(profile.Name) == "" {
		return false
	}
	switch profile.Type {
	case ColorProfileNone, ColorProfileSRGB, ColorProfileDisplayP3:
		return profile.Data == nil
	case ColorProfileEmbedded:
		return len(profile.Data) > 0 && len(profile.Data) <= maxICCBytes
	default:
		return false
	}
}

func validateTilesets(tilesets []Tileset, colorMode string, palette Palette) (map[string]bool, error) {
	ids := make(map[string]bool, len(tilesets))
	for _, tileset := range tilesets {
		if !validCelID(tileset.ID) || ids[tileset.ID] || strings.TrimSpace(tileset.Name) == "" || tileset.TileWidth <= 0 || tileset.TileWidth > maxCanvasDimension || tileset.TileHeight <= 0 || tileset.TileHeight > maxCanvasDimension || !validTilesetGridForTileSize(tileset.Grid, tileset.TileWidth, tileset.TileHeight) || tileset.Terrains == nil || tileset.Tiles == nil {
			return nil, fmt.Errorf("invalid tileset")
		}
		ids[tileset.ID] = true
		tileIDs := make(map[int]bool, len(tileset.Tiles))
		for _, tile := range tileset.Tiles {
			pixelBytes, dimensionsOK := expectedPixelBytes(tileset.TileWidth, tileset.TileHeight)
			indexBytes, indexDimensionsOK := expectedIndexBytes(tileset.TileWidth, tileset.TileHeight)
			indexesValid := indexDimensionsOK && ((colorMode == ColorModeIndexed && tile.Indexes != nil && len(tile.Indexes) == indexBytes && indexedCacheMatches(tile.Indexes, tile.Pixels, palette)) || (colorMode != ColorModeIndexed && tile.Indexes == nil))
			if tile.ID <= 0 || uint64(tile.ID) > uint64(tileIndexMask) || tileIDs[tile.ID] || !dimensionsOK || len(tile.Pixels) != pixelBytes || !indexesValid {
				return nil, fmt.Errorf("invalid tileset")
			}
			tileIDs[tile.ID] = true
		}
		if !validateTerrainDefinitions(tileset.Terrains, tileset.Grid, tileIDs) {
			return nil, fmt.Errorf("invalid tileset")
		}
	}
	return ids, nil
}

func indexedCacheMatches(indexes, pixels []byte, palette Palette) bool {
	if len(pixels) != len(indexes)*4 {
		return false
	}
	for pixel, paletteIndex := range indexes {
		if int(paletteIndex) >= len(palette.Colors) {
			return false
		}
		value := palette.Colors[paletteIndex]
		rgb, err := strconv.ParseUint(value[1:7], 16, 24)
		if err != nil {
			return false
		}
		alpha := uint64(255)
		if len(value) == 9 {
			alpha, err = strconv.ParseUint(value[7:9], 16, 8)
			if err != nil {
				return false
			}
		}
		if int(paletteIndex) == palette.TransparentIndex {
			alpha = 0
		}
		offset := pixel * 4
		if pixels[offset+3] != byte(alpha) {
			return false
		}
		if alpha != 0 && (pixels[offset] != byte(rgb>>16) || pixels[offset+1] != byte(rgb>>8) || pixels[offset+2] != byte(rgb)) {
			return false
		}
	}
	return true
}

func validateTerrainDefinitions(definitions []TerrainDefinition, grid TilesetGrid, tileIDs map[int]bool) bool {
	ids := make(map[int]bool, len(definitions))
	for _, definition := range definitions {
		if definition.ID <= 0 || definition.ID > maxTerrainID || ids[definition.ID] || strings.TrimSpace(definition.Name) == "" || !validHexColor(definition.Color) || !validTerrainNeighborMode(definition.NeighborMode, grid) || !validTerrainBoundary(definition.Boundary) || definition.Rules == nil {
			return false
		}
		ids[definition.ID] = true
		masks := make(map[uint32]bool, len(definition.Rules))
		maximumMask := terrainMaximumMask(definition.NeighborMode)
		for _, rule := range definition.Rules {
			if (rule.decoded && !rule.maskPresent) || rule.Mask > maximumMask || (definition.NeighborMode == TerrainNeighborBlob8 && normalizeBlobMask(rule.Mask) != rule.Mask) || masks[rule.Mask] || len(rule.Candidates) == 0 {
				return false
			}
			masks[rule.Mask] = true
			for _, candidate := range rule.Candidates {
				flags := uint64(candidate.Flags)
				if (candidate.decoded && !candidate.flagsPresent) || candidate.TileID <= 0 || uint64(candidate.TileID) > uint64(tileIndexMask) || !tileIDs[candidate.TileID] || candidate.Flags < -0x80000000 || candidate.Flags > 0xffffffff || uint32(flags)&^tileFlagMask != 0 || math.IsNaN(candidate.Weight) || math.IsInf(candidate.Weight, 0) || candidate.Weight <= 0 {
					return false
				}
			}
		}
	}
	return true
}

func validTerrainNeighborMode(mode TerrainNeighborMode, grid TilesetGrid) bool {
	switch mode {
	case TerrainNeighborEdge4:
		return grid.Kind == TileGridOrthogonal || grid.Kind == TileGridIsometric
	case TerrainNeighborBlob8:
		return grid.Kind == TileGridOrthogonal
	case TerrainNeighborEdge6:
		return grid.Kind == TileGridHexagonal
	default:
		return false
	}
}

func validTerrainBoundary(boundary TerrainBoundary) bool {
	return boundary == TerrainBoundaryEmpty || boundary == TerrainBoundarySame || boundary == TerrainBoundaryWrap
}

func terrainMaximumMask(mode TerrainNeighborMode) uint32 {
	switch mode {
	case TerrainNeighborEdge6:
		return 0x3f
	case TerrainNeighborBlob8:
		return 0xff
	default:
		return 0x0f
	}
}

func validTilesetGrid(grid TilesetGrid) bool {
	switch grid.Kind {
	case TileGridOrthogonal:
		return grid.CellWidth == 0 && grid.CellHeight == 0 && grid.AnchorX == 0 && grid.AnchorY == 0 && grid.Orientation == "" && grid.Offset == ""
	case TileGridIsometric:
		return grid.CellWidth > 0 && grid.CellWidth <= maxTilesetGridDimension && grid.CellHeight > 0 && grid.CellHeight <= maxTilesetGridDimension && grid.AnchorX >= 0 && grid.AnchorX <= maxTilesetGridDimension && grid.AnchorY >= 0 && grid.AnchorY <= maxTilesetGridDimension && grid.Orientation == "" && grid.Offset == ""
	case TileGridHexagonal:
		if grid.CellWidth != 0 || grid.CellHeight != 0 || grid.AnchorX != 0 || grid.AnchorY != 0 {
			return false
		}
		if grid.Orientation == "pointy" {
			return grid.Offset == "odd-r" || grid.Offset == "even-r"
		}
		if grid.Orientation == "flat" {
			return grid.Offset == "odd-q" || grid.Offset == "even-q"
		}
	}
	return false
}

func validTilesetGridForTileSize(grid TilesetGrid, tileWidth, tileHeight int) bool {
	if !validTilesetGrid(grid) || tileWidth <= 0 || tileHeight <= 0 {
		return false
	}
	return grid.Kind != TileGridIsometric || (grid.AnchorX <= tileWidth && grid.AnchorY <= tileHeight)
}

func validLayerRole(role LayerRole) bool {
	return role == LayerRoleStandard || role == LayerRoleBackground || role == LayerRoleReference
}

func validColorMode(mode string) bool {
	return mode == ColorModeRGBA || mode == ColorModeIndexed || mode == ColorModeGrayscale || mode == ColorModeBitmap
}

func validBlendMode(mode BlendMode) bool {
	switch mode {
	case BlendModeNormal, BlendModeDarken, BlendModeMultiply, BlendModeColorBurn, BlendModeLighten,
		BlendModeScreen, BlendModeColorDodge, BlendModeOverlay, BlendModeSoftLight, BlendModeHardLight,
		BlendModeDifference, BlendModeExclusion, BlendModeHue, BlendModeSaturation, BlendModeColor,
		BlendModeLuminosity, BlendModeAddition, BlendModeSubtract, BlendModeDivide:
		return true
	default:
		return false
	}
}

func validTagDirection(direction TagDirection) bool {
	return direction == TagDirectionForward || direction == TagDirectionReverse || direction == TagDirectionPingPong
}

func validHexColor(value string) bool {
	if len(value) != 7 && len(value) != 9 || value[0] != '#' {
		return false
	}
	for index := 1; index < len(value); index++ {
		character := value[index]
		if !('0' <= character && character <= '9') && !('a' <= character && character <= 'f') && !('A' <= character && character <= 'F') {
			return false
		}
	}
	return true
}

func validateSlices(slices []Slice, frames map[string]bool, width, height int) error {
	ids := make(map[string]bool, len(slices))
	for _, slice := range slices {
		if slice.ID == "" || ids[slice.ID] || strings.TrimSpace(slice.Name) == "" || !validHexColor(slice.Color) || len(slice.Keys) == 0 {
			return fmt.Errorf("invalid slices")
		}
		ids[slice.ID] = true
		for _, key := range slice.Keys {
			if !frames[key.FrameID] || !validSliceRect(SliceRect{X: key.X, Y: key.Y, Width: key.Width, Height: key.Height}, width, height) {
				return fmt.Errorf("invalid slices")
			}
			if key.Center != nil && !validSliceRect(*key.Center, key.Width, key.Height) {
				return fmt.Errorf("invalid slices")
			}
		}
	}
	return nil
}

func validSliceRect(rect SliceRect, width, height int) bool {
	return rect.Width > 0 && rect.Height > 0 && rect.X >= 0 && rect.Y >= 0 && rect.X <= width-rect.Width && rect.Y <= height-rect.Height
}

func validateGuides(guides []Guide, width, height int) error {
	ids := make(map[string]bool, len(guides))
	for _, guide := range guides {
		if guide.ID == "" || ids[guide.ID] || (guide.Axis != "horizontal" && guide.Axis != "vertical") || math.IsNaN(guide.Position) || math.IsInf(guide.Position, 0) {
			return fmt.Errorf("invalid guides")
		}
		limit := float64(width)
		if guide.Axis == "horizontal" {
			limit = float64(height)
		}
		if guide.Position < 0 || guide.Position > limit {
			return fmt.Errorf("invalid guides")
		}
		ids[guide.ID] = true
	}
	return nil
}

func validateSettings(settings DocumentSettings, width, height int) error {
	if settings.GridWidth <= 0 || settings.GridWidth > maxCanvasDimension || settings.GridHeight <= 0 || settings.GridHeight > maxCanvasDimension || math.IsNaN(settings.SymmetryAxisX) || math.IsInf(settings.SymmetryAxisX, 0) || math.IsNaN(settings.SymmetryAxisY) || math.IsInf(settings.SymmetryAxisY, 0) || settings.SymmetryAxisX < 0 || settings.SymmetryAxisX > float64(width) || settings.SymmetryAxisY < 0 || settings.SymmetryAxisY > float64(height) || settings.OnionPreviousFrames < 0 || settings.OnionPreviousFrames > 16 || settings.OnionNextFrames < 0 || settings.OnionNextFrames > 16 || math.IsNaN(settings.OnionOpacity) || math.IsInf(settings.OnionOpacity, 0) || settings.OnionOpacity < 0 || settings.OnionOpacity > 1 || !validHexColor(settings.OnionPreviousColor) || !validHexColor(settings.OnionNextColor) {
		return fmt.Errorf("invalid settings")
	}
	if settings.Interpolation != "" && settings.Interpolation != "nearest" && settings.Interpolation != "bilinear" {
		return fmt.Errorf("invalid interpolation")
	}
	if settings.GradientType != "" && settings.GradientType != "linear" && settings.GradientType != "radial" && settings.GradientType != "angular" && settings.GradientType != "reflected" && settings.GradientType != "diamond" {
		return fmt.Errorf("invalid gradient type")
	}
	if settings.SelectionConnectivity != 0 && settings.SelectionConnectivity != 4 && settings.SelectionConnectivity != 8 {
		return fmt.Errorf("invalid selection connectivity")
	}
	return nil
}

func validateLayerHierarchy(layers map[string]Layer) error {
	state := make(map[string]uint8, len(layers))
	var visit func(string) bool
	visit = func(id string) bool {
		switch state[id] {
		case 1:
			return false
		case 2:
			return true
		}
		layer, exists := layers[id]
		if !exists {
			return false
		}
		state[id] = 1
		if layer.ParentID != "" {
			parent, parentExists := layers[layer.ParentID]
			if !parentExists || parent.Kind != LayerKindGroup || parent.ID == layer.ID || !visit(parent.ID) {
				return false
			}
		}
		state[id] = 2
		return true
	}
	for id := range layers {
		if !visit(id) {
			return fmt.Errorf("invalid layer")
		}
	}
	return nil
}

func validCelID(id string) bool {
	return id != "" && id != "." && id != ".." && !strings.ContainsAny(id, `/\\`) && !strings.Contains(id, "..")
}

func validCelReference(cel Cel, document Document) bool {
	for _, layer := range document.Layers {
		if layer.ID == cel.LayerID {
			if layer.Kind != LayerKindImage && layer.Kind != LayerKindTilemap {
				return false
			}
			for _, frame := range document.Frames {
				if frame.ID == cel.FrameID {
					return true
				}
			}
			return false
		}
	}
	return false
}

func validCelManifestGeometry(cel manifestCel) bool {
	_, dimensionsOK := expectedPixelBytes(cel.Width, cel.Height)
	return dimensionsOK
}

func validCelOpacity(opacity float64) bool {
	return !math.IsNaN(opacity) && !math.IsInf(opacity, 0) && opacity >= 0 && opacity <= 1
}

func validCelZIndex(zIndex int) bool {
	return zIndex >= minCelZIndex && zIndex <= maxCelZIndex
}

func validCelLayerProperties(role LayerRole, opacity float64, zIndex int) bool {
	return role != LayerRoleBackground || (opacity == 1 && zIndex == 0)
}

func validateManifest(stored manifest, files map[string]*zip.File) error {
	if stored.FormatVersion != FormatVersion {
		return fmt.Errorf("unsupported .pixio format version %d", stored.FormatVersion)
	}
	colorProfile := ColorProfile{Type: stored.ColorProfile.Type, Name: stored.ColorProfile.Name}
	if stored.ColorProfile.Type == ColorProfileEmbedded {
		if stored.ColorProfile.Path != "profiles/profile.icc" {
			return fmt.Errorf("invalid color profile")
		}
		profileFile := files[stored.ColorProfile.Path]
		if profileFile == nil {
			return fmt.Errorf("project is missing color profile %q", stored.ColorProfile.Path)
		}
		if profileFile.UncompressedSize64 == 0 || profileFile.UncompressedSize64 > uint64(maxICCBytes) {
			return fmt.Errorf("project entry %q is too large", profileFile.Name)
		}
		colorProfile.Data = []byte{1}
	} else if stored.ColorProfile.Path != "" {
		return fmt.Errorf("invalid color profile")
	}
	placeholderTilesets := make([]Tileset, 0, len(stored.Tilesets))
	allPaths := map[string]bool{"manifest.json": true}
	if files["thumbnail.png"] != nil {
		allPaths["thumbnail.png"] = true
	}
	if stored.ColorProfile.Path != "" {
		allPaths[stored.ColorProfile.Path] = true
	}
	tilesetIDs := make(map[string]bool, len(stored.Tilesets))
	for _, storedTileset := range stored.Tilesets {
		if !validCelID(storedTileset.ID) || tilesetIDs[storedTileset.ID] || strings.TrimSpace(storedTileset.Name) == "" || storedTileset.TileWidth <= 0 || storedTileset.TileWidth > maxCanvasDimension || storedTileset.TileHeight <= 0 || storedTileset.TileHeight > maxCanvasDimension || !validTilesetGridForTileSize(storedTileset.Grid, storedTileset.TileWidth, storedTileset.TileHeight) || storedTileset.Terrains == nil || storedTileset.Tiles == nil {
			return fmt.Errorf("invalid tileset")
		}
		tilesetIDs[storedTileset.ID] = true
		placeholder := Tileset{ID: storedTileset.ID, Name: storedTileset.Name, TileWidth: storedTileset.TileWidth, TileHeight: storedTileset.TileHeight, Grid: storedTileset.Grid, Terrains: storedTileset.Terrains, Tiles: []Tile{}}
		tileIDs := make(map[int]bool, len(storedTileset.Tiles))
		for _, storedTile := range storedTileset.Tiles {
			expectedPath := fmt.Sprintf("tilesets/%s/%d.png", storedTileset.ID, storedTile.ID)
			expectedIndexPath := ""
			if stored.ColorMode == ColorModeIndexed {
				expectedIndexPath = fmt.Sprintf("tilesets/%s/%d.idx", storedTileset.ID, storedTile.ID)
			}
			if storedTile.ID <= 0 || uint64(storedTile.ID) > uint64(tileIndexMask) || tileIDs[storedTile.ID] || storedTile.Path != expectedPath || storedTile.IndexPath != expectedIndexPath || allPaths[storedTile.Path] || (storedTile.IndexPath != "" && allPaths[storedTile.IndexPath]) {
				return fmt.Errorf("invalid tileset")
			}
			file := files[storedTile.Path]
			if file == nil {
				return fmt.Errorf("project is missing tile image %q", storedTile.Path)
			}
			if file.UncompressedSize64 > uint64(maxTilePNGBytes) {
				return fmt.Errorf("project entry %q is too large", file.Name)
			}
			if expectedIndexPath != "" {
				indexFile := files[storedTile.IndexPath]
				if indexFile == nil {
					return fmt.Errorf("project is missing tile indexes %q", storedTile.IndexPath)
				}
				expectedIndexes, _ := expectedIndexBytes(storedTileset.TileWidth, storedTileset.TileHeight)
				if indexFile.UncompressedSize64 != uint64(expectedIndexes) || indexFile.UncompressedSize64 > uint64(maxCelIndexBytes) {
					return fmt.Errorf("tile indexes %q dimensions do not match manifest", indexFile.Name)
				}
			}
			tileIDs[storedTile.ID] = true
			allPaths[storedTile.Path] = true
			if storedTile.IndexPath != "" {
				allPaths[storedTile.IndexPath] = true
			}
			placeholder.Tiles = append(placeholder.Tiles, Tile{ID: storedTile.ID, Pixels: make([]byte, storedTileset.TileWidth*storedTileset.TileHeight*4), Indexes: func() []byte {
				if stored.ColorMode == ColorModeIndexed {
					return make([]byte, storedTileset.TileWidth*storedTileset.TileHeight)
				}
				return nil
			}()})
		}
		if !validateTerrainDefinitions(storedTileset.Terrains, storedTileset.Grid, tileIDs) {
			return fmt.Errorf("invalid tileset")
		}
		placeholderTilesets = append(placeholderTilesets, placeholder)
	}
	document := Document{
		FormatVersion:    stored.FormatVersion,
		Name:             stored.Name,
		Width:            stored.Width,
		Height:           stored.Height,
		ColorMode:        stored.ColorMode,
		ColorProfile:     colorProfile,
		PixelAspectRatio: stored.PixelAspectRatio,
		Palette:          stored.Palette,
		Tilesets:         placeholderTilesets,
		Layers:           stored.Layers,
		Frames:           stored.Frames,
		Tags:             stored.Tags,
		Slices:           stored.Slices,
		Guides:           stored.Guides,
		Settings:         stored.Settings,
		ActiveLayerID:    stored.ActiveLayerID,
		ActiveFrameID:    stored.ActiveFrameID,
	}
	if err := validateMetadata(document); err != nil {
		return err
	}
	if stored.Cels == nil {
		return fmt.Errorf("invalid project cels")
	}
	layers, frames := map[string]Layer{}, map[string]bool{}
	for _, layer := range stored.Layers {
		layers[layer.ID] = layer
	}
	for _, frame := range stored.Frames {
		frames[frame.ID] = true
	}
	celIDs, celRefs, paths, indexPaths := map[string]bool{}, map[celReference]bool{}, map[string]bool{}, map[string]bool{}
	links := map[string]celLink{}
	for _, cel := range stored.Cels {
		reference := celReference{layerID: cel.LayerID, frameID: cel.FrameID}
		expectedPath := "cels/" + cel.ID + ".png"
		expectedIndexPath := ""
		if stored.ColorMode == ColorModeIndexed {
			expectedIndexPath = "cels/" + cel.ID + ".idx"
		}
		layer, layerExists := layers[cel.LayerID]
		expectedTilemapPath := ""
		if layer.Kind == LayerKindTilemap {
			expectedTilemapPath = "tilemaps/" + cel.ID + ".bin"
		}
		file := files[cel.Path]
		indexFile := files[cel.IndexPath]
		tilemapFile := files[cel.TilemapPath]
		terrainMapFile := files[cel.TerrainMapPath]
		_, dimensionsOK := expectedPixelBytes(cel.Width, cel.Height)
		expectedTilemapColumns, expectedTilemapRows := 0, 0
		tilemapGeometryValid := layer.Kind != LayerKindTilemap
		if layer.Kind == LayerKindTilemap {
			tileset := placeholderTilesetsByID(placeholderTilesets, layer.TilesetID)
			expectedTilemapColumns, expectedTilemapRows = cel.TilemapColumns, cel.TilemapRows
			if tileset.Grid.Kind == TileGridOrthogonal {
				expectedTilemapColumns = (cel.Width + tileset.TileWidth - 1) / tileset.TileWidth
				expectedTilemapRows = (cel.Height + tileset.TileHeight - 1) / tileset.TileHeight
			}
			tilemapGeometryValid = validTilemapGeometry(cel.Width, cel.Height, TilemapData{Columns: cel.TilemapColumns, Rows: cel.TilemapRows, GridOffset: cel.TilemapGridOffset}, tileset)
		}
		expectedTerrainMapPath := ""
		if layer.Kind == LayerKindTilemap {
			expectedTerrainMapPath = "terrainmaps/" + cel.ID + ".bin"
		}
		terrainMapFieldsValid := (cel.TerrainMapPath == "" && cel.TerrainMapColumns == 0 && cel.TerrainMapRows == 0 && cel.TerrainMapSeed == 0 && !cel.terrainMapSeedPresent) || (layer.Kind == LayerKindTilemap && cel.TerrainMapPath == expectedTerrainMapPath && cel.TerrainMapColumns == expectedTilemapColumns && cel.TerrainMapRows == expectedTilemapRows && cel.terrainMapSeedPresent)
		offsetFieldsValid := (cel.TilemapGridOffset == "" && !cel.tilemapOffsetPresent) || (layer.Kind == LayerKindTilemap && cel.tilemapOffsetPresent)
		if !validCelID(cel.ID) || !validCelID(cel.LinkID) || celIDs[cel.ID] || !layerExists || (layer.Kind != LayerKindImage && layer.Kind != LayerKindTilemap) || !frames[cel.FrameID] || celRefs[reference] || !dimensionsOK || !validCelManifestGeometry(cel) || !validCelOpacity(cel.Opacity) || !validCelZIndex(cel.ZIndex) || !validCelLayerProperties(layer.Role, cel.Opacity, cel.ZIndex) || cel.Path != expectedPath || paths[cel.Path] || allPaths[cel.Path] || cel.IndexPath != expectedIndexPath || (cel.IndexPath != "" && (indexPaths[cel.IndexPath] || allPaths[cel.IndexPath])) || cel.TilemapPath != expectedTilemapPath || !tilemapGeometryValid || !offsetFieldsValid || (layer.Kind != LayerKindTilemap && (cel.TilemapColumns != 0 || cel.TilemapRows != 0)) || !terrainMapFieldsValid || (cel.TerrainMapPath != "" && allPaths[cel.TerrainMapPath]) {
			return fmt.Errorf("invalid cel")
		}
		if file == nil {
			return fmt.Errorf("project is missing cel image %q", cel.Path)
		}
		if file.UncompressedSize64 > uint64(maxCelPNGBytes) {
			return fmt.Errorf("project entry %q is too large", file.Name)
		}
		if expectedIndexPath != "" {
			if indexFile == nil {
				return fmt.Errorf("project is missing cel indexes %q", cel.IndexPath)
			}
			expectedIndexes, _ := expectedIndexBytes(cel.Width, cel.Height)
			if indexFile.UncompressedSize64 != uint64(expectedIndexes) {
				return fmt.Errorf("cel indexes %q dimensions do not match manifest", indexFile.Name)
			}
		}
		if expectedTilemapPath != "" {
			if tilemapFile == nil {
				return fmt.Errorf("project is missing cel tilemap %q", cel.TilemapPath)
			}
			expectedBytes := expectedTilemapColumns * expectedTilemapRows * 4
			if tilemapFile.UncompressedSize64 != uint64(expectedBytes) || tilemapFile.UncompressedSize64 > uint64(maxTilemapBytes) {
				return fmt.Errorf("cel tilemap %q dimensions do not match manifest", tilemapFile.Name)
			}
			if allPaths[cel.TilemapPath] {
				return fmt.Errorf("invalid cel")
			}
		}
		if cel.TerrainMapPath != "" {
			if terrainMapFile == nil {
				return fmt.Errorf("project is missing cel terrain map %q", cel.TerrainMapPath)
			}
			expectedBytes := expectedTilemapColumns * expectedTilemapRows * 2
			if terrainMapFile.UncompressedSize64 != uint64(expectedBytes) || terrainMapFile.UncompressedSize64 > uint64(maxTerrainMapBytes) {
				return fmt.Errorf("cel terrain map %q dimensions do not match manifest", terrainMapFile.Name)
			}
		}
		currentTilemap := (*TilemapData)(nil)
		if cel.TilemapPath != "" {
			currentTilemap = &TilemapData{Columns: cel.TilemapColumns, Rows: cel.TilemapRows, GridOffset: cel.TilemapGridOffset}
		}
		currentTerrainMap := (*TerrainMapData)(nil)
		if cel.TerrainMapPath != "" {
			terrainData, terrainErr := readZipFile(terrainMapFile, maxTerrainMapBytes)
			if terrainErr != nil {
				return terrainErr
			}
			currentTerrainMap = &TerrainMapData{Columns: cel.TerrainMapColumns, Rows: cel.TerrainMapRows, Seed: cel.TerrainMapSeed, Terrains: terrainData}
		}
		if previous, exists := links[cel.LinkID]; exists && (previous.width != cel.Width || previous.height != cel.Height || !equalTilemaps(previous.tilemap, currentTilemap) || !equalTerrainMaps(previous.terrainMap, currentTerrainMap)) {
			return fmt.Errorf("invalid cel")
		}
		celIDs[cel.ID], celRefs[reference], paths[cel.Path], indexPaths[cel.IndexPath] = true, true, true, cel.IndexPath != ""
		allPaths[cel.Path] = true
		if cel.IndexPath != "" {
			allPaths[cel.IndexPath] = true
		}
		if cel.TilemapPath != "" {
			allPaths[cel.TilemapPath] = true
		}
		if cel.TerrainMapPath != "" {
			allPaths[cel.TerrainMapPath] = true
		}
		if _, exists := links[cel.LinkID]; !exists {
			links[cel.LinkID] = celLink{width: cel.Width, height: cel.Height, tilemap: currentTilemap, terrainMap: currentTerrainMap}
		}
	}
	for name := range files {
		if !allPaths[name] {
			return fmt.Errorf("invalid project entry %q", name)
		}
	}
	return nil
}

func placeholderTilesetsByID(tilesets []Tileset, id string) Tileset {
	for _, tileset := range tilesets {
		if tileset.ID == id {
			return tileset
		}
	}
	return Tileset{}
}

func readZipFile(file *zip.File, maximum int64) ([]byte, error) {
	if file.UncompressedSize64 > uint64(maximum) {
		return nil, fmt.Errorf("project entry %q is too large", file.Name)
	}
	reader, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open project entry: %w", err)
	}
	defer reader.Close()
	data, err := io.ReadAll(io.LimitReader(reader, maximum+1))
	if err != nil {
		return nil, fmt.Errorf("read project entry %q: %w", file.Name, err)
	}
	if int64(len(data)) > maximum {
		return nil, fmt.Errorf("project entry %q is too large", file.Name)
	}
	return data, nil
}
func decodeCel(file *zip.File, width, height int) ([]byte, error) {
	data, err := readZipFile(file, maxCelPNGBytes)
	if err != nil {
		return nil, err
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode cel %q: %w", file.Name, err)
	}
	if config.Width != width || config.Height != height {
		return nil, fmt.Errorf("cel %q dimensions do not match manifest", file.Name)
	}
	imageData, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("decode cel %q: %w", file.Name, err)
	}
	output := make([]byte, width*height*4)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			pixel := color.NRGBAModel.Convert(imageData.At(x, y)).(color.NRGBA)
			index := (y*width + x) * 4
			output[index] = pixel.R
			output[index+1] = pixel.G
			output[index+2] = pixel.B
			output[index+3] = pixel.A
		}
	}
	return output, nil
}
func validPNG(data []byte) bool {
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || config.Width <= 0 || config.Height <= 0 || config.Width > maxThumbnailDimension || config.Height > maxThumbnailDimension {
		return false
	}
	_, err = png.Decode(bytes.NewReader(data))
	return err == nil
}

type limitedBuffer struct {
	bytes.Buffer
	maximum int64
}

func (buffer *limitedBuffer) Write(data []byte) (int, error) {
	remaining := buffer.maximum - int64(buffer.Len())
	if remaining <= 0 {
		return 0, fmt.Errorf("encoded data exceeds %d bytes", buffer.maximum)
	}
	if int64(len(data)) > remaining {
		written, _ := buffer.Buffer.Write(data[:remaining])
		return written, fmt.Errorf("encoded data exceeds %d bytes", buffer.maximum)
	}
	return buffer.Buffer.Write(data)
}

func renderThumbnail(document Document) ([]byte, error) {
	canvas := image.NewNRGBA(image.Rect(0, 0, document.Width, document.Height))
	cels := make(map[celReference]*Cel, len(document.Cels))
	for index := range document.Cels {
		cel := &document.Cels[index]
		cels[celReference{layerID: cel.LayerID, frameID: cel.FrameID}] = cel
	}
	composited := compositeThumbnailLayerChildren(document, document.ActiveFrameID, "", make(map[string]bool), cels)
	copy(canvas.Pix, composited.Pix)

	thumbnailWidth, thumbnailHeight := thumbnailDimensions(document.Width, document.Height)
	thumbnail := image.NewNRGBA(image.Rect(0, 0, thumbnailWidth, thumbnailHeight))
	for y := 0; y < thumbnailHeight; y++ {
		sourceY := y * document.Height / thumbnailHeight
		for x := 0; x < thumbnailWidth; x++ {
			sourceX := x * document.Width / thumbnailWidth
			sourceIndex := sourceY*canvas.Stride + sourceX*4
			targetIndex := y*thumbnail.Stride + x*4
			copy(thumbnail.Pix[targetIndex:targetIndex+4], canvas.Pix[sourceIndex:sourceIndex+4])
		}
	}

	var encoded limitedBuffer
	encoded.maximum = maxThumbnailBytes
	if err := png.Encode(&encoded, thumbnail); err != nil {
		return nil, err
	}
	return encoded.Bytes(), nil
}

func thumbnailDimensions(width, height int) (int, int) {
	if width <= maxThumbnailDimension && height <= maxThumbnailDimension {
		return width, height
	}
	scale := math.Min(float64(maxThumbnailDimension)/float64(width), float64(maxThumbnailDimension)/float64(height))
	thumbnailWidth := max(1, int(math.Round(float64(width)*scale)))
	thumbnailHeight := max(1, int(math.Round(float64(height)*scale)))
	return thumbnailWidth, thumbnailHeight
}

func compositeThumbnailLayerChildren(document Document, frameID, parentID string, visiting map[string]bool, cels map[celReference]*Cel) *image.NRGBA {
	output := image.NewNRGBA(image.Rect(0, 0, document.Width, document.Height))
	type orderedLayer struct {
		layer Layer
		index int
		z     int
	}
	layers := make([]orderedLayer, 0)
	for _, layer := range document.Layers {
		if layer.ParentID != parentID {
			continue
		}
		z := 0
		if cel := cels[celReference{layerID: layer.ID, frameID: frameID}]; cel != nil && layer.Kind != LayerKindGroup && layer.Role != LayerRoleBackground {
			z = cel.ZIndex
		}
		layers = append(layers, orderedLayer{layer, len(layers), z})
	}
	sort.SliceStable(layers, func(i, j int) bool {
		a, b := layers[i], layers[j]
		if a.layer.Role == LayerRoleBackground || b.layer.Role == LayerRoleBackground {
			return a.layer.Role == LayerRoleBackground && b.layer.Role != LayerRoleBackground
		}
		if a.index+a.z != b.index+b.z {
			return a.index+a.z < b.index+b.z
		}
		if a.z != b.z {
			return a.z < b.z
		}
		return a.index < b.index
	})
	for _, entry := range layers {
		layer := entry.layer
		if layer.ParentID != parentID || layer.Role == LayerRoleReference || !layer.Visible || layer.Opacity <= 0 {
			continue
		}
		if layer.Kind == LayerKindGroup {
			if visiting[layer.ID] {
				continue
			}
			visiting[layer.ID] = true
			group := compositeThumbnailLayerChildren(document, frameID, layer.ID, visiting, cels)
			delete(visiting, layer.ID)
			compositeThumbnailBuffer(output, group, layer.Opacity, layer.BlendMode)
			continue
		}
		cel := cels[celReference{layerID: layer.ID, frameID: frameID}]
		if cel != nil {
			compositeThumbnailCelWithMode(output, *cel, layer.Opacity, layer.BlendMode)
		}
	}
	return output
}

func compositeThumbnailCel(canvas *image.NRGBA, cel Cel, opacity float64) {
	compositeThumbnailCelWithMode(canvas, cel, opacity, BlendModeNormal)
}

func compositeThumbnailCelWithMode(canvas *image.NRGBA, cel Cel, opacity float64, blendMode BlendMode) {
	layerOpacity := math.Max(0, math.Min(1, opacity*cel.Opacity))
	// Clip before adding the arbitrary integer offset to avoid overflow for a
	// valid but far-outside Cel position.
	if cel.X >= canvas.Rect.Dx() || cel.X < -cel.Width || cel.Y >= canvas.Rect.Dy() || cel.Y < -cel.Height {
		return
	}
	celXStart, celXEnd := 0, cel.Width
	if cel.X < 0 {
		celXStart = -cel.X
	}
	if cel.X+celXEnd > canvas.Rect.Dx() {
		celXEnd = canvas.Rect.Dx() - cel.X
	}
	celYStart, celYEnd := 0, cel.Height
	if cel.Y < 0 {
		celYStart = -cel.Y
	}
	if cel.Y+celYEnd > canvas.Rect.Dy() {
		celYEnd = canvas.Rect.Dy() - cel.Y
	}
	for celY := celYStart; celY < celYEnd; celY++ {
		canvasY := cel.Y + celY
		for celX := celXStart; celX < celXEnd; celX++ {
			canvasX := cel.X + celX
			sourceIndex := (celY*cel.Width + celX) * 4
			targetIndex := canvasY*canvas.Stride + canvasX*4
			blendThumbnailPixelWithMode(canvas.Pix, targetIndex, cel.Pixels, sourceIndex, layerOpacity, blendMode)
		}
	}
}

func blendThumbnailPixel(target []byte, targetIndex int, source []byte, sourceIndex int, opacity float64) {
	blendThumbnailPixelWithMode(target, targetIndex, source, sourceIndex, opacity, BlendModeNormal)
}

func compositeThumbnailBuffer(target, source *image.NRGBA, opacity float64, blendMode BlendMode) {
	for offset := 0; offset < len(target.Pix) && offset < len(source.Pix); offset += 4 {
		blendThumbnailPixelWithMode(target.Pix, offset, source.Pix, offset, opacity, blendMode)
	}
}

func blendThumbnailPixelWithMode(target []byte, targetIndex int, source []byte, sourceIndex int, opacity float64, blendMode BlendMode) {
	sourceAlpha := (float64(source[sourceIndex+3]) / 255) * opacity
	if sourceAlpha <= 0 {
		return
	}
	targetAlpha := float64(target[targetIndex+3]) / 255
	outputAlpha := sourceAlpha + targetAlpha*(1-sourceAlpha)
	backdrop := [3]float64{float64(target[targetIndex]) / 255, float64(target[targetIndex+1]) / 255, float64(target[targetIndex+2]) / 255}
	sourceColor := [3]float64{float64(source[sourceIndex]) / 255, float64(source[sourceIndex+1]) / 255, float64(source[sourceIndex+2]) / 255}
	blendedColor, nonSeparable := blendThumbnailNonSeparable(backdrop, sourceColor, blendMode)
	for channel := 0; channel < 3; channel++ {
		sourceValue := sourceColor[channel]
		targetValue := backdrop[channel]
		blended := blendThumbnailChannel(targetValue, sourceValue, blendMode)
		if nonSeparable {
			blended = blendedColor[channel]
		}
		value := sourceValue*sourceAlpha*(1-targetAlpha) + targetValue*targetAlpha*(1-sourceAlpha) + blended*sourceAlpha*targetAlpha
		target[targetIndex+channel] = uint8(math.Round(255 * value / outputAlpha))
	}
	target[targetIndex+3] = uint8(math.Round(outputAlpha * 255))
}

func blendThumbnailNonSeparable(backdrop, source [3]float64, mode BlendMode) ([3]float64, bool) {
	switch mode {
	case BlendModeHue:
		return setBlendLuminosity(setBlendSaturation(source, blendSaturation(backdrop)), blendLuminosity(backdrop)), true
	case BlendModeSaturation:
		return setBlendLuminosity(setBlendSaturation(backdrop, blendSaturation(source)), blendLuminosity(backdrop)), true
	case BlendModeColor:
		return setBlendLuminosity(source, blendLuminosity(backdrop)), true
	case BlendModeLuminosity:
		return setBlendLuminosity(backdrop, blendLuminosity(source)), true
	default:
		return [3]float64{}, false
	}
}

func blendLuminosity(color [3]float64) float64 {
	return 0.3*color[0] + 0.59*color[1] + 0.11*color[2]
}

func blendSaturation(color [3]float64) float64 {
	return math.Max(color[0], math.Max(color[1], color[2])) - math.Min(color[0], math.Min(color[1], color[2]))
}

func setBlendLuminosity(color [3]float64, target float64) [3]float64 {
	delta := target - blendLuminosity(color)
	return clipBlendColor([3]float64{color[0] + delta, color[1] + delta, color[2] + delta})
}

func clipBlendColor(color [3]float64) [3]float64 {
	lightness := blendLuminosity(color)
	minimum := math.Min(color[0], math.Min(color[1], color[2]))
	maximum := math.Max(color[0], math.Max(color[1], color[2]))
	if minimum < 0 {
		for index, component := range color {
			color[index] = lightness + ((component-lightness)*lightness)/(lightness-minimum)
		}
	}
	if maximum > 1 {
		for index, component := range color {
			color[index] = lightness + ((component-lightness)*(1-lightness))/(maximum-lightness)
		}
	}
	for index, component := range color {
		color[index] = math.Max(0, math.Min(1, component))
	}
	return color
}

func setBlendSaturation(color [3]float64, target float64) [3]float64 {
	order := [3]int{0, 1, 2}
	for left := 0; left < len(order)-1; left++ {
		for right := left + 1; right < len(order); right++ {
			if color[order[left]] > color[order[right]] {
				order[left], order[right] = order[right], order[left]
			}
		}
	}
	minimum, middle, maximum := order[0], order[1], order[2]
	result := [3]float64{}
	if color[maximum] > color[minimum] {
		result[middle] = ((color[middle] - color[minimum]) * target) / (color[maximum] - color[minimum])
		result[maximum] = target
	}
	return result
}

func blendThumbnailChannel(backdrop, source float64, mode BlendMode) float64 {
	switch mode {
	case BlendModeDarken:
		return math.Min(backdrop, source)
	case BlendModeMultiply:
		return backdrop * source
	case BlendModeColorBurn:
		if source <= 0 {
			return 0
		}
		return 1 - math.Min(1, (1-backdrop)/source)
	case BlendModeLighten:
		return math.Max(backdrop, source)
	case BlendModeScreen:
		return backdrop + source - backdrop*source
	case BlendModeColorDodge:
		if source >= 1 {
			return 1
		}
		return math.Min(1, backdrop/(1-source))
	case BlendModeOverlay:
		if backdrop <= 0.5 {
			return 2 * backdrop * source
		}
		return 1 - 2*(1-backdrop)*(1-source)
	case BlendModeSoftLight:
		if source <= 0.5 {
			return backdrop - (1-2*source)*backdrop*(1-backdrop)
		}
		curve := math.Sqrt(backdrop)
		if backdrop <= 0.25 {
			curve = ((16*backdrop-12)*backdrop + 4) * backdrop
		}
		return backdrop + (2*source-1)*(curve-backdrop)
	case BlendModeHardLight:
		if source <= 0.5 {
			return 2 * backdrop * source
		}
		return 1 - 2*(1-backdrop)*(1-source)
	case BlendModeDifference:
		return math.Abs(backdrop - source)
	case BlendModeExclusion:
		return backdrop + source - 2*backdrop*source
	case BlendModeAddition:
		return math.Min(1, backdrop+source)
	case BlendModeSubtract:
		return math.Max(0, backdrop-source)
	case BlendModeDivide:
		if source <= 0 {
			return 1
		}
		return math.Min(1, backdrop/source)
	default:
		return source
	}
}

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}

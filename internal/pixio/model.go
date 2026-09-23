package pixio

import (
	"encoding/json"
	"fmt"
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

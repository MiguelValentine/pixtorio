package pixio

import (
	"bytes"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Validate checks an in-memory document against the current .pixio format.
// The editor intentionally supports only FormatVersion; callers must not
// migrate or silently repair older project data.
func Validate(document Document) error {
	return validate(document)
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

func max(left, right int) int {
	if left > right {
		return left
	}
	return right
}

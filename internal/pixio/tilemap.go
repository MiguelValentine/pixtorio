package pixio

import (
	"bytes"
	"encoding/binary"
	"math"
	"sort"
)

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

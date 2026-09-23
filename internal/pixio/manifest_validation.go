package pixio

import (
	"archive/zip"
	"fmt"
	"strings"
)

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

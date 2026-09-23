package pixio

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

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

package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	pngexport "pixtorio/internal/export"
	"pixtorio/internal/pixio"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx         context.Context
	startupPath string

	closeStateMu      sync.RWMutex
	hasUnsavedChanges bool
	closeLanguage     string
	recoveryMu        sync.Mutex
	mcp               *desktopMCP
}

const maxPNGImportDimension = 2048
const maxAtlasOutputDimension = 16384
const recoveryFormat = "pixtorio-recovery-v2"

type recoverySnapshot struct {
	Format      string             `json:"format"`
	ActiveTabID string             `json:"activeTabId"`
	Documents   []recoveryDocument `json:"documents"`
}

type recoveryDocument struct {
	TabID    string  `json:"tabId"`
	FilePath *string `json:"filePath,omitempty"`
	Document string  `json:"document"`
}

type openProjectResult struct {
	Path     string `json:"path"`
	Document string `json:"document"`
}

// spriteSheetAtlasMetadata is the optional sidecar written next to a sprite
// sheet. Frame rectangles use the same coordinates as the exported PNG.
type spriteSheetAtlasMetadata struct {
	Image       string                           `json:"image"`
	SheetWidth  int                              `json:"sheetWidth"`
	SheetHeight int                              `json:"sheetHeight"`
	FrameWidth  int                              `json:"frameWidth"`
	FrameHeight int                              `json:"frameHeight"`
	Frames      []pngexport.SpriteSheetFrameRect `json:"frames"`
}

type fileDialogLabels struct {
	importPNGTitle      string
	pngFilter           string
	saveProjectTitle    string
	openProjectTitle    string
	projectFilter       string
	exportPNGTitle      string
	exportGIFTitle      string
	gifFilter           string
	exportSheetTitle    string
	defaultPNG          string
	defaultGIF          string
	defaultSheet        string
	importSequenceTitle string
	exportSequenceTitle string
	importTilemapTitle  string
	exportTilemapTitle  string
	tilemapJSONFilter   string
	tilemapCSVFilter    string
}

func localizedFileDialogs(language string) fileDialogLabels {
	if strings.EqualFold(language, "zh") || strings.HasPrefix(strings.ToLower(language), "zh-") {
		return fileDialogLabels{
			importPNGTitle: "导入 PNG", pngFilter: "PNG 图片 (*.png)", saveProjectTitle: "保存 Pixtorio 项目",
			openProjectTitle: "打开 Pixtorio 项目", projectFilter: "Pixtorio 项目 (*.pixio)", exportPNGTitle: "导出 PNG",
			exportGIFTitle: "导出 GIF", gifFilter: "GIF 图片 (*.gif)", exportSheetTitle: "导出精灵图",
			defaultPNG: "未命名.png", defaultGIF: "未命名.gif", defaultSheet: "未命名-精灵图.png",
			importSequenceTitle: "导入 PNG 序列", exportSequenceTitle: "导出 PNG 序列",
			importTilemapTitle: "导入图块地图", exportTilemapTitle: "导出图块地图",
			tilemapJSONFilter: "Pixtorio 图块地图 JSON (*.json)", tilemapCSVFilter: "图块地图 CSV (*.csv)",
		}
	}
	return fileDialogLabels{
		importPNGTitle: "Import PNG", pngFilter: "PNG image (*.png)", saveProjectTitle: "Save Pixtorio Project",
		openProjectTitle: "Open Pixtorio Project", projectFilter: "Pixtorio project (*.pixio)", exportPNGTitle: "Export PNG",
		exportGIFTitle: "Export GIF", gifFilter: "GIF image (*.gif)", exportSheetTitle: "Export Sprite Sheet",
		defaultPNG: "untitled.png", defaultGIF: "untitled.gif", defaultSheet: "untitled-sheet.png",
		importSequenceTitle: "Import PNG Sequence", exportSequenceTitle: "Export PNG Sequence",
		importTilemapTitle: "Import Tilemap", exportTilemapTitle: "Export Tilemap",
		tilemapJSONFilter: "Pixtorio tilemap JSON (*.json)", tilemapCSVFilter: "Tilemap CSV (*.csv)",
	}
}

func (a *App) OpenTilemapData(language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	dialogs := localizedFileDialogs(language)
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: dialogs.importTilemapTitle,
		Filters: []runtime.FileFilter{
			{DisplayName: dialogs.tilemapJSONFilter, Pattern: "*.json"},
			{DisplayName: dialogs.tilemapCSVFilter, Pattern: "*.csv"},
		},
	})
	if err != nil || path == "" {
		return "", err
	}
	info, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("stat tilemap data: %w", err)
	}
	if info.Size() > 16<<20 {
		return "", fmt.Errorf("tilemap data exceeds 16 MiB")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read tilemap data: %w", err)
	}
	payload, err := json.Marshal(struct {
		Name    string `json:"name"`
		Content string `json:"content"`
	}{Name: filepath.Base(path), Content: string(data)})
	if err != nil {
		return "", fmt.Errorf("encode tilemap data: %w", err)
	}
	return string(payload), nil
}

func (a *App) SaveTilemapData(content, format, defaultName, language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	if len(content) > 16<<20 {
		return "", fmt.Errorf("tilemap data exceeds 16 MiB")
	}
	dialogs := localizedFileDialogs(language)
	extension, filter := ".json", dialogs.tilemapJSONFilter
	if format == "csv" {
		extension, filter = ".csv", dialogs.tilemapCSVFilter
	} else if format != "json" {
		return "", fmt.Errorf("unsupported tilemap data format %q", format)
	}
	filename := strings.TrimSpace(defaultName)
	if filename == "" {
		filename = "tilemap" + extension
	}
	if !strings.EqualFold(filepath.Ext(filename), extension) {
		filename += extension
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           dialogs.exportTilemapTitle,
		DefaultFilename: filename,
		Filters:         []runtime.FileFilter{{DisplayName: filter, Pattern: "*" + extension}},
	})
	if err != nil || path == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(path), extension) {
		path += extension
	}
	if err := writeTextFileAtomic(path, []byte(content)); err != nil {
		return "", err
	}
	return path, nil
}

func writeTextFileAtomic(path string, data []byte) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temporary tilemap data: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(data); err != nil {
		temporary.Close()
		return fmt.Errorf("write tilemap data: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync tilemap data: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close tilemap data: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace tilemap data: %w", err)
	}
	return nil
}

func (a *App) ImportPNG(language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	dialogs := localizedFileDialogs(language)
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: dialogs.importPNGTitle, Filters: []runtime.FileFilter{{DisplayName: dialogs.pngFilter, Pattern: "*.png"}}})
	if err != nil || path == "" {
		return "", err
	}
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open PNG: %w", err)
	}
	defer file.Close()
	decoded, err := decodeImportedPNG(file)
	if err != nil {
		return "", err
	}
	bounds := decoded.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	pixels := straightRGBAPixels(decoded)
	data, err := json.Marshal(struct {
		Name   string `json:"name"`
		Width  int    `json:"width"`
		Height int    `json:"height"`
		Pixels []byte `json:"pixels"`
	}{filepath.Base(path), width, height, pixels})
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func (a *App) ImportPNGSequence(language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	dialogs := localizedFileDialogs(language)
	paths, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{Title: dialogs.importSequenceTitle, Filters: []runtime.FileFilter{{DisplayName: dialogs.pngFilter, Pattern: "*.png"}}})
	if err != nil || len(paths) == 0 {
		return "", err
	}
	type sequenceFrame struct {
		Name   string `json:"name"`
		Width  int    `json:"width"`
		Height int    `json:"height"`
		Pixels []byte `json:"pixels"`
	}
	frames := make([]sequenceFrame, 0, len(paths))
	for _, path := range paths {
		file, openErr := os.Open(path)
		if openErr != nil {
			return "", fmt.Errorf("open PNG sequence frame: %w", openErr)
		}
		decoded, decodeErr := decodeImportedPNG(file)
		file.Close()
		if decodeErr != nil {
			return "", decodeErr
		}
		bounds := decoded.Bounds()
		frames = append(frames, sequenceFrame{Name: filepath.Base(path), Width: bounds.Dx(), Height: bounds.Dy(), Pixels: straightRGBAPixels(decoded)})
	}
	data, err := json.Marshal(struct {
		Frames []sequenceFrame `json:"frames"`
	}{Frames: frames})
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func decodeImportedPNG(source io.ReadSeeker) (image.Image, error) {
	config, err := png.DecodeConfig(source)
	if err != nil {
		return nil, fmt.Errorf("decode PNG: %w", err)
	}
	if !validPNGImportDimensions(config.Width, config.Height) {
		return nil, fmt.Errorf("invalid PNG dimensions")
	}
	if _, err := source.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind PNG: %w", err)
	}
	decoded, err := png.Decode(source)
	if err != nil {
		return nil, fmt.Errorf("decode PNG: %w", err)
	}
	bounds := decoded.Bounds()
	if !validPNGImportDimensions(bounds.Dx(), bounds.Dy()) {
		return nil, fmt.Errorf("invalid PNG dimensions")
	}
	return decoded, nil
}

func validPNGImportDimensions(width, height int) bool {
	return width > 0 && height > 0 && width <= maxPNGImportDimension && height <= maxPNGImportDimension
}

func straightRGBAPixels(source image.Image) []byte {
	bounds := source.Bounds()
	width, height := bounds.Dx(), bounds.Dy()
	pixels := make([]byte, width*height*4)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			pixel := color.NRGBAModel.Convert(source.At(bounds.Min.X+x, bounds.Min.Y+y)).(color.NRGBA)
			offset := (y*width + x) * 4
			pixels[offset] = pixel.R
			pixels[offset+1] = pixel.G
			pixels[offset+2] = pixel.B
			pixels[offset+3] = pixel.A
		}
	}
	return pixels
}

// SavePixio prompts for an editable project destination and writes the validated document.
// Paths already owned by other open tabs are rejected before any file is written.
func (a *App) SavePixio(documentJSON, language string, reservedPaths []string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	document, err := decodePixioDocument(documentJSON)
	if err != nil {
		return "", err
	}
	filename := document.Name
	if !strings.EqualFold(filepath.Ext(filename), ".pixio") {
		filename += ".pixio"
	}
	dialogs := localizedFileDialogs(language)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: dialogs.saveProjectTitle, DefaultFilename: filename, Filters: []runtime.FileFilter{{DisplayName: dialogs.projectFilter, Pattern: "*.pixio"}}})
	if err != nil || path == "" {
		return path, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".pixio") {
		path += ".pixio"
	}
	if conflictsWithProjectPath(path, reservedPaths) {
		return "", fmt.Errorf("selected project is already open")
	}
	if err := writePixioDocument(path, document); err != nil {
		return "", err
	}
	return path, nil
}

func conflictsWithProjectPath(path string, reservedPaths []string) bool {
	candidate, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		candidate = filepath.Clean(path)
	}
	for _, reserved := range reservedPaths {
		comparison, comparisonErr := filepath.Abs(filepath.Clean(reserved))
		if comparisonErr != nil {
			comparison = filepath.Clean(reserved)
		}
		if strings.EqualFold(candidate, comparison) {
			return true
		}
	}
	return false
}

// SavePixioPath writes a validated document to an existing .pixio destination
// without opening a save dialog. The path is deliberately strict: unlike
// SavePixio, it never appends an extension supplied by the caller.
func (a *App) SavePixioPath(path, documentJSON string) (string, error) {
	if !strings.EqualFold(filepath.Ext(path), ".pixio") {
		return "", fmt.Errorf("project path must use .pixio")
	}
	document, err := decodePixioDocument(documentJSON)
	if err != nil {
		return "", err
	}
	if err := writePixioDocument(path, document); err != nil {
		return "", err
	}
	return path, nil
}

func decodePixioDocument(documentJSON string) (pixio.Document, error) {
	var document pixio.Document
	if err := json.Unmarshal([]byte(documentJSON), &document); err != nil {
		return pixio.Document{}, fmt.Errorf("decode project: %w", err)
	}
	return document, nil
}

func writePixioDocument(path string, document pixio.Document) error {
	if !strings.EqualFold(filepath.Ext(path), ".pixio") {
		return fmt.Errorf("project path must use .pixio")
	}
	return pixio.WriteFile(path, document, nil)
}

// SaveRecovery writes one strictly validated snapshot containing every dirty tab.
func (a *App) SaveRecovery(recoveryJSON string) error {
	data := []byte(recoveryJSON)
	if err := validateRecoverySnapshot(data); err != nil {
		return err
	}
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	path, err := recoveryPaths()
	if err != nil {
		return err
	}
	if err := writeRecoveryFile(path, data); err != nil {
		return err
	}
	return nil
}

func (a *App) LoadRecovery() (string, error) {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	path, err := recoveryPaths()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err == nil {
		if validationErr := validateRecoverySnapshot(data); validationErr != nil {
			if removeErr := os.Remove(path); removeErr != nil && !os.IsNotExist(removeErr) {
				return "", fmt.Errorf("discard invalid recovery: %w", removeErr)
			}
			return "", nil
		}
		return string(data), nil
	}
	if !os.IsNotExist(err) {
		return "", fmt.Errorf("read recovery: %w", err)
	}
	return "", nil
}

func (a *App) ClearRecovery() error {
	a.recoveryMu.Lock()
	defer a.recoveryMu.Unlock()
	path, err := recoveryPaths()
	if err != nil {
		return err
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("clear recovery: %w", err)
	}
	return nil
}

func validateRecoverySnapshot(data []byte) error {
	var snapshot recoverySnapshot
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&snapshot); err != nil {
		return fmt.Errorf("decode recovery: invalid JSON")
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return fmt.Errorf("decode recovery: invalid JSON")
	}
	if snapshot.Format != recoveryFormat || snapshot.ActiveTabID == "" || len(snapshot.Documents) == 0 {
		return fmt.Errorf("decode recovery: unsupported recovery format")
	}
	seenTabIDs := make(map[string]bool, len(snapshot.Documents))
	seenFilePaths := make(map[string]bool, len(snapshot.Documents))
	for _, recovered := range snapshot.Documents {
		if strings.TrimSpace(recovered.TabID) == "" || seenTabIDs[recovered.TabID] || recovered.Document == "" {
			return fmt.Errorf("decode recovery: invalid document entry")
		}
		seenTabIDs[recovered.TabID] = true
		if recovered.FilePath != nil {
			path := *recovered.FilePath
			if path == "" || strings.TrimSpace(path) != path || !strings.EqualFold(filepath.Ext(path), ".pixio") {
				return fmt.Errorf("decode recovery: invalid document entry")
			}
			pathKey := recoveryPathKey(path)
			if seenFilePaths[pathKey] {
				return fmt.Errorf("decode recovery: invalid document entry")
			}
			seenFilePaths[pathKey] = true
		}
		document, err := decodePixioDocument(recovered.Document)
		if err != nil {
			return fmt.Errorf("decode recovery: invalid project")
		}
		if err := pixio.Validate(document); err != nil {
			return fmt.Errorf("decode recovery: invalid project")
		}
	}
	if !seenTabIDs[snapshot.ActiveTabID] {
		return fmt.Errorf("decode recovery: invalid active tab")
	}
	return nil
}

func recoveryPathKey(path string) string {
	cleaned := filepath.Clean(path)
	absolute, err := filepath.Abs(cleaned)
	if err == nil {
		cleaned = absolute
	}
	return strings.ToLower(strings.ReplaceAll(cleaned, "/", "\\"))
}

func recoveryPaths() (string, error) {
	directory, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("find recovery directory: %w", err)
	}
	directory = filepath.Join(directory, "Pixtorio")
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", fmt.Errorf("create recovery directory: %w", err)
	}
	return filepath.Join(directory, "recovery.json"), nil
}

func writeRecoveryFile(path string, data []byte) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".recovery-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary recovery: %w", err)
	}
	temporaryPath := temporary.Name()
	defer func() { _ = os.Remove(temporaryPath) }()
	if _, err := temporary.Write(data); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("write recovery: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		_ = temporary.Close()
		return fmt.Errorf("sync recovery: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close recovery: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace recovery: %w", err)
	}
	return nil
}

// OpenPixio prompts for a .pixio project and returns its path and validated document JSON.
func (a *App) OpenPixio(language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	dialogs := localizedFileDialogs(language)
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: dialogs.openProjectTitle, Filters: []runtime.FileFilter{{DisplayName: dialogs.projectFilter, Pattern: "*.pixio"}}})
	if err != nil || path == "" {
		return "", err
	}
	return a.openProjectResult(path)
}

// OpenStartupProject consumes a .pixio path passed by the Windows file association.
func (a *App) OpenStartupProject() (string, error) {
	path := a.startupPath
	a.startupPath = ""
	if path == "" {
		return "", nil
	}
	return a.openProjectResult(path)
}

func (a *App) openProjectResult(path string) (string, error) {
	document, err := a.openPixioPath(path)
	if err != nil {
		return "", err
	}
	result, err := json.Marshal(openProjectResult{Path: path, Document: document})
	if err != nil {
		return "", fmt.Errorf("encode opened project: %w", err)
	}
	return string(result), nil
}

func (a *App) OpenPixioPath(path string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	if !strings.EqualFold(filepath.Ext(path), ".pixio") {
		return "", fmt.Errorf("project path must use .pixio")
	}
	return a.openPixioPath(path)
}

func (a *App) openPixioPath(path string) (string, error) {
	document, _, err := pixio.ReadFile(path)
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(document)
	if err != nil {
		return "", fmt.Errorf("encode project: %w", err)
	}
	return string(data), nil
}

func NewApp() *App {
	return &App{startupPath: startupProjectPath(os.Args[1:]), closeLanguage: "en"}
}

func startupProjectPath(arguments []string) string {
	for _, argument := range arguments {
		if strings.EqualFold(filepath.Ext(argument), ".pixio") {
			return argument
		}
	}
	return ""
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.startWebAPI()
	a.mcp = newDesktopMCP(func(request mcpCommand) {
		runtime.EventsEmit(ctx, "pixtorio:mcp", request)
	})
	if err := a.mcp.start(); err != nil {
		runtime.LogErrorf(ctx, "MCP service: %v", err)
	}
}

func (a *App) shutdown(context.Context) {
	if a.mcp != nil {
		a.mcp.close()
	}
}

func (a *App) SetMCPReady(ready bool) {
	if a.mcp != nil {
		a.mcp.mu.Lock()
		a.mcp.ready = ready
		a.mcp.mu.Unlock()
	}
}

// Claiming prevents a queued request from editing after its caller cancelled.
func (a *App) ClaimMCPCommand(id string) bool {
	return a.mcp != nil && a.mcp.claim(id)
}

func (a *App) CompleteMCPCommand(id, result, message string) {
	if a.mcp != nil {
		a.mcp.complete(id, result, message)
	}
}

// SetWindowCloseState keeps the native Wails close hook in sync with the web UI.
func (a *App) SetWindowCloseState(hasUnsavedChanges bool, language string) {
	a.closeStateMu.Lock()
	defer a.closeStateMu.Unlock()
	a.hasUnsavedChanges = hasUnsavedChanges
	a.closeLanguage = language
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.closeStateMu.RLock()
	hasUnsavedChanges := a.hasUnsavedChanges
	language := a.closeLanguage
	a.closeStateMu.RUnlock()
	if !hasUnsavedChanges {
		return false
	}

	dialog, discardButton := closeConfirmationDialog(language)
	response, err := runtime.MessageDialog(ctx, dialog)
	if err != nil || response != discardButton {
		return true
	}
	return a.ClearRecovery() != nil
}

// closeConfirmationDialog provides explicit choices because macOS does not
// synthesize question-dialog buttons when none are supplied.
func closeConfirmationDialog(language string) (runtime.MessageDialogOptions, string) {
	title, message := "Unsaved changes", "Close Pixtorio and discard all unsaved changes?"
	discardButton, cancelButton := "Discard Changes", "Cancel"
	if strings.EqualFold(language, "zh") || strings.HasPrefix(strings.ToLower(language), "zh-") {
		title, message = "存在未保存的更改", "关闭 Pixtorio 并放弃所有未保存的更改吗？"
		discardButton, cancelButton = "放弃更改", "取消"
	}
	return runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         title,
		Message:       message,
		Buttons:       []string{discardButton, cancelButton},
		DefaultButton: cancelButton,
		CancelButton:  cancelButton,
	}, discardButton
}

func decodeRGBABase64(width, height int, encoded string) ([]byte, error) {
	return decodeRGBABase64WithLimit(width, height, encoded, maxPNGImportDimension)
}

func validAtlasOutputDimensions(width, height int) bool {
	return width > 0 && height > 0 && width <= maxAtlasOutputDimension && height <= maxAtlasOutputDimension
}

func decodeAtlasRGBABase64(width, height int, encoded string) ([]byte, error) {
	if !validAtlasOutputDimensions(width, height) {
		return nil, fmt.Errorf("invalid image dimensions")
	}
	return decodeRGBABase64WithLimit(width, height, encoded, maxAtlasOutputDimension)
}

func decodeRGBABase64WithLimit(width, height int, encoded string, maxDimension int) ([]byte, error) {
	if maxDimension <= 0 || width <= 0 || height <= 0 || width > maxDimension || height > maxDimension {
		return nil, fmt.Errorf("invalid image dimensions")
	}
	maxInt := int(^uint(0) >> 1)
	if width > maxInt/height {
		return nil, fmt.Errorf("invalid image dimensions")
	}
	pixelCount := width * height
	if pixelCount > maxInt/4 {
		return nil, fmt.Errorf("invalid image dimensions")
	}
	expectedBytes := pixelCount * 4
	// Check the encoded length before DecodeString so malformed requests with
	// large dimensions cannot trigger a large allocation.
	if len(encoded) != base64.StdEncoding.EncodedLen(expectedBytes) {
		return nil, fmt.Errorf("invalid RGBA pixel data")
	}
	pixels, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(pixels) != expectedBytes {
		return nil, fmt.Errorf("invalid RGBA pixel data")
	}
	return pixels, nil
}

func decodeRGBAFrames(width, height int, encodedFrames []string) ([][]uint8, error) {
	frames := make([][]uint8, len(encodedFrames))
	for index, encoded := range encodedFrames {
		pixels, err := decodeRGBABase64(width, height, encoded)
		if err != nil {
			return nil, fmt.Errorf("invalid frame %d: %w", index+1, err)
		}
		frames[index] = pixels
	}
	return frames, nil
}

// SavePNG asks for a destination and writes an RGBA canvas as a PNG image.
func (a *App) SavePNG(width, height int, encodedPixels, language string) (string, error) {
	return a.SavePNGWithOptions(width, height, encodedPixels, false, 1, 1, language)
}

// SavePNGWithOptions asks for a destination and writes an RGBA canvas as PNG,
// optionally applying the document pixel aspect ratio as square-pixel output.
func (a *App) SavePNGWithOptions(width, height int, encodedPixels string, applyPixelRatio bool, pixelAspectWidth, pixelAspectHeight int, language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	pixels, err := decodeRGBABase64(width, height, encodedPixels)
	if err != nil {
		return "", err
	}

	dialogs := localizedFileDialogs(language)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           dialogs.exportPNGTitle,
		DefaultFilename: dialogs.defaultPNG,
		Filters: []runtime.FileFilter{
			{DisplayName: dialogs.pngFilter, Pattern: "*.png"},
		},
	})
	if err != nil || path == "" {
		return path, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".png") {
		path += ".png"
	}

	if err := pngexport.WriteFileWithOptions(path, width, height, pixels, pngexport.PNGOptions{
		ApplyPixelRatio:   applyPixelRatio,
		PixelAspectWidth:  pixelAspectWidth,
		PixelAspectHeight: pixelAspectHeight,
	}); err != nil {
		return "", err
	}
	return path, nil
}

// SavePackedAtlas asks for a destination and writes a packed atlas image.
// The frontend supplies pixels and metadata after applying any requested
// pixel-aspect conversion so the PNG and its optional sidecar share geometry.
func (a *App) SavePackedAtlas(width, height int, encodedPixels, metadataJSON string, writeJSON bool, language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	pixels, err := decodeAtlasRGBABase64(width, height, encodedPixels)
	if err != nil {
		return "", err
	}
	if writeJSON {
		if _, err := marshalPackedAtlasMetadata("atlas.png", metadataJSON); err != nil {
			return "", err
		}
	}

	dialogs := localizedFileDialogs(language)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           dialogs.exportSheetTitle,
		DefaultFilename: dialogs.defaultSheet,
		Filters:         []runtime.FileFilter{{DisplayName: dialogs.pngFilter, Pattern: "*.png"}},
	})
	if err != nil || path == "" {
		return path, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".png") {
		path += ".png"
	}
	if err := writePackedAtlasFiles(path, width, height, pixels, metadataJSON, writeJSON); err != nil {
		return "", err
	}
	return path, nil
}

func writePackedAtlasFiles(path string, width, height int, pixels []uint8, metadataJSON string, writeJSON bool) error {
	var metadata []byte
	var err error
	if writeJSON {
		metadata, err = marshalPackedAtlasMetadata(filepath.Base(path), metadataJSON)
		if err != nil {
			return err
		}
	}
	if err := pngexport.WriteFile(path, width, height, pixels); err != nil {
		return err
	}
	if writeJSON {
		metadataPath := strings.TrimSuffix(path, filepath.Ext(path)) + ".json"
		if err := writeBytesAtomically(metadataPath, "atlas metadata", metadata); err != nil {
			return err
		}
	}
	return nil
}

func marshalPackedAtlasMetadata(imageName, raw string) ([]byte, error) {
	var metadata map[string]any
	if err := json.Unmarshal([]byte(raw), &metadata); err != nil {
		return nil, fmt.Errorf("decode atlas metadata: %w", err)
	}
	if len(metadata) == 0 {
		return nil, fmt.Errorf("atlas metadata must be a JSON object")
	}
	if metadata["format"] == "pixtorio-tilemap-v1" {
		image, ok := metadata["tilesetImage"].(map[string]any)
		if !ok {
			return nil, fmt.Errorf("tileset bundle metadata requires tilesetImage")
		}
		image["file"] = imageName
	} else {
		metadata["image"] = imageName
	}
	data, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode atlas metadata: %w", err)
	}
	return append(data, '\n'), nil
}

func (a *App) SavePNGSequence(width, height int, encodedFrames []string, stem, language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	frames, err := decodeRGBAFrames(width, height, encodedFrames)
	if err != nil {
		return "", err
	}
	dialogs := localizedFileDialogs(language)
	directory, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: dialogs.exportSequenceTitle})
	if err != nil || directory == "" {
		return directory, err
	}
	stem = sanitizeSequenceStem(stem)
	digits := len(strconv.Itoa(len(frames)))
	if digits < 3 {
		digits = 3
	}
	for index, pixels := range frames {
		name := fmt.Sprintf("%s-%0*d.png", stem, digits, index+1)
		if err := pngexport.WriteFile(filepath.Join(directory, name), width, height, pixels); err != nil {
			return "", err
		}
	}
	return directory, nil
}

func sanitizeSequenceStem(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimSuffix(value, filepath.Ext(value))
	value = strings.Map(func(r rune) rune {
		if r < 32 || strings.ContainsRune(`<>:"/\\|?*`, r) {
			return '-'
		}
		return r
	}, value)
	value = strings.Trim(value, " .-")
	if value == "" {
		return "frame"
	}
	return value
}

func (a *App) SaveGIF(width, height int, encodedFrames []string, durationsMS []int, scale, loopCount int, language string) (string, error) {
	return a.SaveGIFWithOptions(width, height, encodedFrames, durationsMS, scale, loopCount, false, 1, 1, language)
}

// SaveGIFWithOptions asks for a destination and writes an animated GIF,
// optionally applying the document pixel aspect ratio.
func (a *App) SaveGIFWithOptions(width, height int, encodedFrames []string, durationsMS []int, scale, loopCount int, applyPixelRatio bool, pixelAspectWidth, pixelAspectHeight int, language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	frames, err := decodeRGBAFrames(width, height, encodedFrames)
	if err != nil {
		return "", err
	}
	dialogs := localizedFileDialogs(language)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: dialogs.exportGIFTitle, DefaultFilename: dialogs.defaultGIF, Filters: []runtime.FileFilter{{DisplayName: dialogs.gifFilter, Pattern: "*.gif"}}})
	if err != nil || path == "" {
		return path, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".gif") {
		path += ".gif"
	}
	if err := pngexport.WriteGIFWithOptions(path, width, height, frames, durationsMS, pngexport.GIFOptions{
		Scale:             scale,
		LoopCount:         loopCount,
		ApplyPixelRatio:   applyPixelRatio,
		PixelAspectWidth:  pixelAspectWidth,
		PixelAspectHeight: pixelAspectHeight,
	}); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) SaveSpriteSheet(width, height int, encodedFrames []string, layout string, columns, scale, borderPadding, shapePadding int, writeJSON bool, language string) (string, error) {
	return a.SaveSpriteSheetWithOptions(width, height, encodedFrames, layout, columns, scale, borderPadding, shapePadding, writeJSON, false, 1, 1, language)
}

// SaveSpriteSheetWithOptions asks for a destination and writes a sprite sheet,
// optionally applying the document pixel aspect ratio.
func (a *App) SaveSpriteSheetWithOptions(width, height int, encodedFrames []string, layout string, columns, scale, borderPadding, shapePadding int, writeJSON bool, applyPixelRatio bool, pixelAspectWidth, pixelAspectHeight int, language string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application is not ready")
	}
	frames, err := decodeRGBAFrames(width, height, encodedFrames)
	if err != nil {
		return "", err
	}
	dialogs := localizedFileDialogs(language)
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{Title: dialogs.exportSheetTitle, DefaultFilename: dialogs.defaultSheet, Filters: []runtime.FileFilter{{DisplayName: dialogs.pngFilter, Pattern: "*.png"}}})
	if err != nil || path == "" {
		return path, err
	}
	if !strings.EqualFold(filepath.Ext(path), ".png") {
		path += ".png"
	}
	layoutResult, err := pngexport.WriteSpriteSheetWithOptions(path, width, height, frames, pngexport.SpriteSheetOptions{
		Layout:            layout,
		Columns:           columns,
		Scale:             scale,
		BorderPadding:     borderPadding,
		ShapePadding:      shapePadding,
		ApplyPixelRatio:   applyPixelRatio,
		PixelAspectWidth:  pixelAspectWidth,
		PixelAspectHeight: pixelAspectHeight,
	})
	if err != nil {
		return "", err
	}
	if writeJSON {
		metadataPath := strings.TrimSuffix(path, filepath.Ext(path)) + ".json"
		if err := writeSpriteSheetAtlasMetadata(metadataPath, filepath.Base(path), layoutResult); err != nil {
			return "", err
		}
	}
	return path, nil
}

func writeSpriteSheetAtlasMetadata(path, imageName string, layout pngexport.SpriteSheetLayoutResult) error {
	if len(layout.FrameRects) == 0 {
		return fmt.Errorf("atlas metadata needs at least one frame")
	}
	metadata := spriteSheetAtlasMetadata{
		Image:       imageName,
		SheetWidth:  layout.Width,
		SheetHeight: layout.Height,
		FrameWidth:  layout.FrameRects[0].Width,
		FrameHeight: layout.FrameRects[0].Height,
		Frames:      layout.FrameRects,
	}
	return writeJSONAtomically(path, metadata)
}

func writeJSONAtomically(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode atlas metadata: %w", err)
	}
	data = append(data, '\n')
	return writeBytesAtomically(path, "atlas metadata", data)
}

func writeBytesAtomically(path, format string, data []byte) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create %s: %w", format, err)
	}
	temporaryPath := temporary.Name()
	removeTemporary := func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}

	if written, err := temporary.Write(data); err != nil {
		removeTemporary()
		return fmt.Errorf("write %s: %w", format, err)
	} else if written != len(data) {
		removeTemporary()
		return fmt.Errorf("write %s: short write", format)
	}
	if err := temporary.Sync(); err != nil {
		removeTemporary()
		return fmt.Errorf("sync %s: %w", format, err)
	}
	if err := temporary.Close(); err != nil {
		removeTemporary()
		return fmt.Errorf("close %s: %w", format, err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		_ = os.Remove(temporaryPath)
		return fmt.Errorf("replace %s: %w", format, err)
	}
	return nil
}

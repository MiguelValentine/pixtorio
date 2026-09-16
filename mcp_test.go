package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"pixtorio/internal/pixio"
)

func setMCPReady(m *desktopMCP) {
	m.mu.Lock()
	m.ready = true
	m.mu.Unlock()
}

func TestMCPAskRequiresReady(t *testing.T) {
	emitted := false
	m := newDesktopMCP(func(mcpCommand) { emitted = true })

	if _, err := m.ask(context.Background(), "list_documents", nil); err == nil || !strings.Contains(err.Error(), "not ready") {
		t.Fatalf("ask() error = %v, want not-ready error", err)
	}
	if emitted {
		t.Fatal("ask() emitted a command before the editor was ready")
	}
}

func TestMCPCancelledAskCannotBeClaimed(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var emitted mcpCommand
	claimedAfterCancel := false
	var m *desktopMCP
	m = newDesktopMCP(func(command mcpCommand) {
		emitted = command
		cancel()
		claimedAfterCancel = m.claim(command.ID)
	})
	setMCPReady(m)

	if _, err := m.ask(ctx, "edit_document", mcpJSON(map[string]any{"documentId": "doc-1"})); err == nil || !strings.Contains(err.Error(), "cancelled") {
		t.Fatalf("cancelled ask() error = %v, want cancellation error", err)
	}
	if emitted.ID == "" {
		t.Fatal("ask() did not emit a command before cancellation")
	}
	if claimedAfterCancel {
		t.Fatal("cancelled MCP command became claimable before ask() cleaned it up")
	}
	if m.claim(emitted.ID) {
		t.Fatal("cancelled MCP command became claimable")
	}
}

func TestMCPDuplicateCompletionDoesNotBlock(t *testing.T) {
	m := newDesktopMCP(nil)
	setMCPReady(m)
	m.emit = func(command mcpCommand) {
		if !m.claim(command.ID) {
			t.Errorf("claim(%q) failed", command.ID)
			return
		}
		m.complete(command.ID, `{"ok":true}`, "")
		m.complete(command.ID, `{"ok":false}`, "")
	}

	type askResult struct {
		value json.RawMessage
		err   error
	}
	done := make(chan askResult, 1)
	go func() {
		value, err := m.ask(context.Background(), "list_documents", nil)
		done <- askResult{value: value, err: err}
	}()

	select {
	case result := <-done:
		if result.err != nil {
			t.Fatalf("ask() error = %v", result.err)
		}
		if string(result.value) != `{"ok":true}` {
			t.Fatalf("ask() result = %s, want first completion", result.value)
		}
	case <-time.After(time.Second):
		t.Fatal("duplicate completion blocked MCP request")
	}
}

func TestMCPDispatchRejectsUnknownCommand(t *testing.T) {
	m := newDesktopMCP(nil)
	if _, err := m.dispatch(context.Background(), "not_a_command", nil); err == nil || !strings.Contains(err.Error(), `unknown command "not_a_command"`) {
		t.Fatalf("dispatch() error = %v, want unknown-command error", err)
	}
}

func TestMCPServeHTTPAuthenticatesAndDispatchesList(t *testing.T) {
	m := newDesktopMCP(nil)
	setMCPReady(m)
	m.emit = func(command mcpCommand) {
		if !m.claim(command.ID) {
			t.Errorf("claim(%q) failed", command.ID)
			return
		}
		m.complete(command.ID, `{"documents":[{"id":"doc-1"}]}`, "")
	}
	server := httptest.NewServer(http.HandlerFunc(m.serveHTTP))
	defer server.Close()
	m.connection = mcpConnection{Address: server.URL, Token: "test-token"}

	tests := []struct {
		name   string
		token  string
		host   string
		origin string
	}{
		{name: "origin", token: "test-token", origin: "http://untrusted.example"},
		{name: "host", token: "test-token", host: "127.0.0.1:1"},
		{name: "token", token: "wrong-token"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			response := postMCPCommand(t, server.URL, test.token, test.host, test.origin, mcpCommand{Name: "list_documents", Args: mcpJSON(map[string]any{})})
			defer response.Body.Close()
			if response.StatusCode != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnauthorized)
			}
		})
	}

	response := postMCPCommand(t, server.URL, "test-token", "", "", mcpCommand{Name: "list_documents", Args: mcpJSON(map[string]any{})})
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("authorized status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	var reply mcpReply
	if err := json.NewDecoder(response.Body).Decode(&reply); err != nil {
		t.Fatal(err)
	}
	if reply.Error != "" {
		t.Fatalf("authorized reply error = %q", reply.Error)
	}
	var result struct {
		Documents []struct {
			ID string `json:"id"`
		} `json:"documents"`
	}
	if err := json.Unmarshal(reply.Result, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Documents) != 1 || result.Documents[0].ID != "doc-1" {
		t.Fatalf("authorized result = %s", reply.Result)
	}

	response = postMCPCommand(t, server.URL, "test-token", "", "", mcpCommand{Name: "unsupported", Args: nil})
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("unknown command status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if err := json.NewDecoder(response.Body).Decode(&reply); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(reply.Error, `unknown command "unsupported"`) {
		t.Fatalf("unknown command error = %q", reply.Error)
	}

	response = postMCPRaw(t, server.URL, "test-token", "", "", []byte("{"))
	defer response.Body.Close()
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("invalid command status = %d, want %d", response.StatusCode, http.StatusBadRequest)
	}
}

func TestMCPDispatchOpenProjectUsesFrontend(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "opened.pixio")
	document := mcpTestDocument("opened.pixio", []byte{10, 20, 30, 255})
	if err := pixio.WriteFile(path, document, nil); err != nil {
		t.Fatal(err)
	}

	m := newDesktopMCP(nil)
	setMCPReady(m)
	var emitted mcpCommand
	m.emit = func(command mcpCommand) {
		emitted = command
		if !m.claim(command.ID) {
			t.Errorf("claim(%q) failed", command.ID)
			return
		}
		if command.Name != "open_document" {
			m.complete(command.ID, "", fmt.Sprintf("unexpected command %q", command.Name))
			return
		}
		m.complete(command.ID, `{"accepted":true}`, "")
	}

	result, err := m.dispatch(context.Background(), "open_project", mcpJSON(mcpFileArgs{Path: path}))
	if err != nil {
		t.Fatalf("open_project error = %v", err)
	}
	var accepted struct {
		Accepted bool `json:"accepted"`
	}
	if err := json.Unmarshal(result, &accepted); err != nil {
		t.Fatal(err)
	}
	if !accepted.Accepted || emitted.Name != "open_document" {
		t.Fatalf("open_project result = %s, emitted = %#v", result, emitted)
	}
	var opened openProjectResult
	if err := json.Unmarshal(emitted.Args, &opened); err != nil {
		t.Fatal(err)
	}
	if opened.Path != path {
		t.Fatalf("open_document path = %q, want %q", opened.Path, path)
	}
	var loaded pixio.Document
	if err := json.Unmarshal([]byte(opened.Document), &loaded); err != nil {
		t.Fatal(err)
	}
	if loaded.Name != document.Name || len(loaded.Cels) != 1 || !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatalf("open_document payload = %#v, want document %#v", loaded, document)
	}
}

func TestMCPDispatchSaveProjectSnapshotsAndPreventsOverwrite(t *testing.T) {
	directory := t.TempDir()
	document := mcpTestDocument("saved.pixio", []byte{1, 2, 3, 255})
	documentJSON, err := json.Marshal(document)
	if err != nil {
		t.Fatal(err)
	}
	m := newDesktopMCP(nil)
	setMCPReady(m)
	var emitted []mcpCommand
	m.emit = func(command mcpCommand) {
		emitted = append(emitted, command)
		if !m.claim(command.ID) {
			t.Errorf("claim(%q) failed", command.ID)
			return
		}
		switch command.Name {
		case "save_snapshot":
			m.complete(command.ID, string(mcpJSON(map[string]any{"document": string(documentJSON), "stateId": 42})), "")
		case "mark_saved":
			m.complete(command.ID, `{"marked":true}`, "")
		default:
			m.complete(command.ID, "", fmt.Sprintf("unexpected command %q", command.Name))
		}
	}

	path := filepath.Join(directory, "saved.pixio")
	result, err := m.dispatch(context.Background(), "save_project", mcpJSON(mcpFileArgs{DocumentID: "doc-1", Path: path}))
	if err != nil {
		t.Fatalf("save_project error = %v", err)
	}
	var saved struct {
		Path    string `json:"path"`
		StateID int    `json:"stateId"`
	}
	if err := json.Unmarshal(result, &saved); err != nil {
		t.Fatal(err)
	}
	if saved.Path != path || saved.StateID != 42 {
		t.Fatalf("save_project result = %s", result)
	}
	if len(emitted) != 2 || emitted[0].Name != "save_snapshot" || emitted[1].Name != "mark_saved" {
		t.Fatalf("save_project emitted commands = %#v", emitted)
	}
	loaded, _, err := pixio.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Name != document.Name || !bytes.Equal(loaded.Cels[0].Pixels, document.Cels[0].Pixels) {
		t.Fatalf("saved document = %#v, want %#v", loaded, document)
	}

	if err := os.WriteFile(path, []byte("keep this project"), 0600); err != nil {
		t.Fatal(err)
	}
	emitted = nil
	if _, err := m.dispatch(context.Background(), "save_project", mcpJSON(mcpFileArgs{DocumentID: "doc-1", Path: path})); err == nil || !strings.Contains(err.Error(), "file already exists") {
		t.Fatalf("overwrite-protected save error = %v", err)
	}
	if len(emitted) != 0 {
		t.Fatalf("overwrite-protected save emitted commands = %#v", emitted)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "keep this project" {
		t.Fatalf("overwrite-protected save changed existing file to %q", data)
	}
}

func TestWriteMCPDestinationRejectsExistingAndCleansFailedReservation(t *testing.T) {
	directory := t.TempDir()
	existing := filepath.Join(directory, "existing.png")
	if err := os.WriteFile(existing, []byte("keep"), 0600); err != nil {
		t.Fatal(err)
	}
	called := false
	if err := writeMCPDestination(existing, false, func() error {
		called = true
		return nil
	}); err == nil || !strings.Contains(err.Error(), "reserve destination") {
		t.Fatalf("existing destination error = %v, want reservation error", err)
	}
	if called {
		t.Fatal("writer ran for an existing destination")
	}
	if data, err := os.ReadFile(existing); err != nil || string(data) != "keep" {
		t.Fatalf("existing destination changed: data=%q err=%v", data, err)
	}

	rejected := filepath.Join(directory, "rejected.png")
	if err := writeMCPDestination(rejected, false, func() error {
		return fmt.Errorf("rejected writer")
	}); err == nil || !strings.Contains(err.Error(), "rejected writer") {
		t.Fatalf("rejected writer error = %v", err)
	}
	if _, err := os.Stat(rejected); !os.IsNotExist(err) {
		t.Fatalf("failed writer left reservation: stat error = %v", err)
	}
}

func TestMCPDispatchExportsPNGGIFSpriteSheetAndTransparentPreview(t *testing.T) {
	directory := t.TempDir()
	frames := [][]byte{
		{255, 0, 0, 0, 1, 2, 3, 255},
		{4, 5, 6, 255, 0, 255, 0, 0},
	}
	m := newDesktopMCP(nil)
	setMCPReady(m)
	m.emit = func(command mcpCommand) {
		if !m.claim(command.ID) {
			t.Errorf("claim(%q) failed", command.ID)
			return
		}
		if command.Name != "export_snapshot" {
			m.complete(command.ID, "", fmt.Sprintf("unexpected command %q", command.Name))
			return
		}
		m.complete(command.ID, string(mcpJSON(map[string]any{
			"width":     2,
			"height":    1,
			"frames":    frames,
			"durations": []int{100, 120},
		})), "")
	}

	pngPath := filepath.Join(directory, "frame.png")
	if _, err := m.dispatch(context.Background(), "export_image", mcpJSON(mcpFileArgs{DocumentID: "doc-1", Path: pngPath, Format: "png"})); err != nil {
		t.Fatalf("PNG export error = %v", err)
	}
	pngData, err := os.ReadFile(pngPath)
	if err != nil {
		t.Fatal(err)
	}
	pngImage, err := png.Decode(bytes.NewReader(pngData))
	if err != nil {
		t.Fatal(err)
	}
	if got := pngImage.Bounds().Size(); got != (image.Point{X: 2, Y: 1}) {
		t.Fatalf("PNG bounds = %v, want 2x1", got)
	}
	if pixel := mcpNRGBAAt(pngImage, 0, 0); pixel.A != 0 || pixel.R != 255 {
		t.Fatalf("PNG transparent pixel = %#v, want red with alpha 0", pixel)
	}

	gifPath := filepath.Join(directory, "animation.gif")
	if _, err := m.dispatch(context.Background(), "export_image", mcpJSON(mcpFileArgs{DocumentID: "doc-1", Path: gifPath, Format: "gif"})); err != nil {
		t.Fatalf("GIF export error = %v", err)
	}
	gifData, err := os.ReadFile(gifPath)
	if err != nil {
		t.Fatal(err)
	}
	decodedGIF, err := gif.DecodeAll(bytes.NewReader(gifData))
	if err != nil {
		t.Fatal(err)
	}
	if len(decodedGIF.Image) != 2 || len(decodedGIF.Delay) != 2 {
		t.Fatalf("GIF frames/delays = %d/%d, want 2/2", len(decodedGIF.Image), len(decodedGIF.Delay))
	}

	sheetPath := filepath.Join(directory, "sheet.png")
	if _, err := m.dispatch(context.Background(), "export_image", mcpJSON(mcpFileArgs{DocumentID: "doc-1", Path: sheetPath, Format: "spritesheet", Columns: 2})); err != nil {
		t.Fatalf("sprite-sheet export error = %v", err)
	}
	sheetData, err := os.ReadFile(sheetPath)
	if err != nil {
		t.Fatal(err)
	}
	sheet, err := png.Decode(bytes.NewReader(sheetData))
	if err != nil {
		t.Fatal(err)
	}
	if got := sheet.Bounds().Size(); got != (image.Point{X: 4, Y: 1}) {
		t.Fatalf("sprite-sheet bounds = %v, want 4x1", got)
	}
	if pixel := mcpNRGBAAt(sheet, 0, 0); pixel.A != 0 {
		t.Fatalf("sprite-sheet transparent pixel alpha = %d, want 0", pixel.A)
	}
	if pixel := mcpNRGBAAt(sheet, 2, 0); pixel.A != 255 || pixel.R != 4 {
		t.Fatalf("sprite-sheet second frame pixel = %#v, want opaque source pixel", pixel)
	}

	preview, err := m.dispatch(context.Background(), "get_preview", mcpJSON(mcpFileArgs{DocumentID: "doc-1"}))
	if err != nil {
		t.Fatalf("preview error = %v", err)
	}
	var previewResult struct {
		PNGBase64 string `json:"pngBase64"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	}
	if err := json.Unmarshal(preview, &previewResult); err != nil {
		t.Fatal(err)
	}
	previewData, err := decodeMCPBase64(previewResult.PNGBase64)
	if err != nil {
		t.Fatal(err)
	}
	previewImage, err := png.Decode(bytes.NewReader(previewData))
	if err != nil {
		t.Fatal(err)
	}
	if previewResult.Width != 2 || previewResult.Height != 1 || previewImage.Bounds().Size() != (image.Point{X: 2, Y: 1}) {
		t.Fatalf("preview dimensions = %dx%d, bounds = %v", previewResult.Width, previewResult.Height, previewImage.Bounds().Size())
	}
	if pixel := mcpNRGBAAt(previewImage, 0, 0); pixel.A != 0 || pixel.R != 255 {
		t.Fatalf("preview transparent pixel = %#v, want red with alpha 0", pixel)
	}
}

func postMCPCommand(t *testing.T, address, token, host, origin string, command mcpCommand) *http.Response {
	t.Helper()
	body, err := json.Marshal(command)
	if err != nil {
		t.Fatal(err)
	}
	return postMCPRaw(t, address, token, host, origin, body)
}

func postMCPRaw(t *testing.T, address, token, host, origin string, body []byte) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, address+"/command", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	if host != "" {
		request.Host = host
	}
	if origin != "" {
		request.Header.Set("Origin", origin)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func mcpTestDocument(name string, pixels []byte) pixio.Document {
	return pixio.Document{
		FormatVersion:    pixio.FormatVersion,
		Name:             name,
		Width:            1,
		Height:           1,
		ColorMode:        "rgba",
		ColorProfile:     pixio.ColorProfile{Type: pixio.ColorProfileSRGB, Name: "sRGB"},
		PixelAspectRatio: pixio.PixelAspectRatio{Width: 1, Height: 1},
		Palette:          pixio.Palette{ID: "palette", Name: "Default", Colors: []string{"#000000ff"}, TransparentIndex: 0},
		Tilesets:         []pixio.Tileset{},
		Layers:           []pixio.Layer{{ID: "layer", Name: "Layer 1", Visible: true, Opacity: 1, Kind: pixio.LayerKindImage, BlendMode: pixio.BlendModeNormal, Role: pixio.LayerRoleStandard}},
		Frames:           []pixio.Frame{{ID: "frame", DurationMS: 100}},
		Tags:             []pixio.FrameTag{},
		Slices:           []pixio.Slice{},
		Guides:           []pixio.Guide{},
		Settings:         pixio.DocumentSettings{GridWidth: 8, GridHeight: 8, SymmetryAxisX: 0.5, SymmetryAxisY: 0.5, OnionOpacity: 0.35, OnionPreviousColor: "#f25b5bff", OnionNextColor: "#4ea3ffff"},
		Cels:             []pixio.Cel{{ID: "cel", LinkID: "link", Opacity: 1, LayerID: "layer", FrameID: "frame", Width: 1, Height: 1, Pixels: pixels}},
		ActiveLayerID:    "layer",
		ActiveFrameID:    "frame",
	}
}

func decodeMCPBase64(value string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(value)
}

func mcpNRGBAAt(source image.Image, x, y int) color.NRGBA {
	return color.NRGBAModel.Convert(source.At(x, y)).(color.NRGBA)
}

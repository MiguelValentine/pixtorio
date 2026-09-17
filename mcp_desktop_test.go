package main

import (
	"bytes"
	"context"
	"encoding/json"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// Opt-in smoke test against a running desktop. It owns and closes only the
// documents it creates, and all output files live in the test temp directory.
func TestMCPDesktopSmoke(t *testing.T) {
	executable := os.Getenv("PIXTORIO_MCP_EXE")
	if executable == "" {
		t.Skip("set PIXTORIO_MCP_EXE and start that desktop executable to test real stdio/Wails integration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	command := exec.Command(executable, "--mcp")
	command.Stderr = os.Stderr
	client := mcp.NewClient(&mcp.Implementation{Name: "pixtorio-smoke", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.CommandTransport{Command: command}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	tools, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("tools: %v, %v", tools, err)
	}
	availableTools := make(map[string]bool, len(tools.Tools))
	for _, tool := range tools.Tools {
		availableTools[tool.Name] = true
	}
	for _, name := range []string{
		"pixtorio_list_documents", "pixtorio_create_document", "pixtorio_get_document",
		"pixtorio_edit_document", "pixtorio_undo", "pixtorio_redo", "pixtorio_read_pixels",
		"pixtorio_get_preview", "pixtorio_save_project", "pixtorio_open_project",
		"pixtorio_export_image", "pixtorio_close_document",
	} {
		if !availableTools[name] {
			t.Fatalf("missing desktop MCP tool %q in %v", name, tools.Tools)
		}
	}
	for attempt := 0; attempt < 30; attempt++ {
		ready, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "pixtorio_list_documents", Arguments: map[string]any{}})
		if err == nil && !ready.IsError {
			break
		}
		if attempt == 29 {
			t.Fatalf("desktop did not become ready: %v, %v", ready, err)
		}
		time.Sleep(200 * time.Millisecond)
	}
	call := func(name string, args any) *mcp.CallToolResult {
		t.Helper()
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "pixtorio_" + name, Arguments: args})
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if result.IsError {
			encoded, _ := json.Marshal(result)
			t.Fatalf("%s: %s", name, encoded)
		}
		return result
	}
	decode := func(result *mcp.CallToolResult, target any) {
		t.Helper()
		for _, content := range result.Content {
			if text, ok := content.(*mcp.TextContent); ok {
				if err := json.Unmarshal([]byte(text.Text), target); err != nil {
					t.Fatal(err)
				}
				return
			}
		}
		t.Fatal("missing JSON text result")
	}
	call("list_documents", map[string]any{})
	var created struct {
		DocumentID string `json:"documentId"`
	}
	decode(call("create_document", map[string]any{"name": "MCP smoke", "width": 8, "height": 8}), &created)
	if created.DocumentID == "" {
		t.Fatal("missing document ID")
	}
	owned := []string{created.DocumentID}
	defer func() {
		for _, id := range owned {
			_, _ = session.CallTool(ctx, &mcp.CallToolParams{Name: "pixtorio_close_document", Arguments: map[string]any{"documentId": id, "discardChanges": true}})
		}
	}()
	args := map[string]any{"documentId": created.DocumentID}
	call("get_document", args)
	call("edit_document", map[string]any{"documentId": created.DocumentID, "operations": []any{
		map[string]any{"type": "set_pixels", "pixels": []any{map[string]any{"x": 0, "y": 0, "color": "#ff000080"}}},
		map[string]any{"type": "set_palette", "colors": []string{"#ff000080", "#00000000"}},
		map[string]any{"type": "add_frame", "durationMs": 150},
	}})
	call("undo", args)
	call("redo", args)
	// add_frame selects the new blank frame; inspect and export the original.
	var meta struct {
		Frames []struct {
			ID string `json:"id"`
		} `json:"frames"`
	}
	decode(call("get_document", args), &meta)
	if len(meta.Frames) != 2 {
		t.Fatalf("frames = %v", meta.Frames)
	}
	var colors []string
	decode(call("read_pixels", map[string]any{"documentId": created.DocumentID, "frameId": meta.Frames[0].ID, "x": 0, "y": 0, "width": 2, "height": 1}), &colors)
	if len(colors) != 2 || colors[0] != "#ff000080" || colors[1] != "#00000000" {
		t.Fatalf("colors = %v", colors)
	}
	preview := call("get_preview", map[string]any{"documentId": created.DocumentID, "frameId": meta.Frames[0].ID})
	foundImage := false
	for _, content := range preview.Content {
		if image, ok := content.(*mcp.ImageContent); ok {
			decoded, err := png.Decode(bytes.NewReader(image.Data))
			if err != nil {
				t.Fatal(err)
			}
			_, _, _, alpha := decoded.At(1, 0).RGBA()
			if alpha != 0 {
				t.Fatal("preview lost transparency")
			}
			foundImage = true
		}
	}
	if !foundImage {
		t.Fatal("missing MCP image content")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "smoke.pixio")
	call("save_project", map[string]any{"documentId": created.DocumentID, "path": path})
	for _, format := range []string{"png", "gif", "spritesheet"} {
		ext := ".png"
		if format == "gif" {
			ext = ".gif"
		}
		destination := filepath.Join(dir, format+ext)
		call("export_image", map[string]any{"documentId": created.DocumentID, "path": destination, "format": format})
		if info, err := os.Stat(destination); err != nil || info.Size() == 0 {
			t.Fatalf("export %s: %v", format, err)
		}
	}
	call("close_document", args)
	owned = nil
	var reopened struct {
		DocumentID string `json:"documentId"`
		Palette    struct {
			Colors []string `json:"colors"`
		} `json:"palette"`
	}
	decode(call("open_project", map[string]any{"path": path}), &reopened)
	owned = append(owned, reopened.DocumentID)
	if len(reopened.Palette.Colors) != 2 || reopened.Palette.Colors[0] != "#ff000080" {
		t.Fatalf("palette alpha lost: %+v", reopened.Palette)
	}
	call("activate_document", map[string]any{"documentId": reopened.DocumentID})
}

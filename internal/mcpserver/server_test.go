package mcpserver

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestNewListsToolsAndGuide(t *testing.T) {
	ctx := context.Background()
	server := New(func(context.Context, string, json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage(`{"ok":true}`), nil
	})
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v1"}, &mcp.ClientOptions{
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	serverSession, clientSession := connect(t, ctx, server, client)
	defer serverSession.Close()
	defer clientSession.Close()

	listed, err := clientSession.ListTools(ctx, nil)
	if err != nil {
		t.Fatalf("ListTools: %v", err)
	}
	wantNames := []string{
		"pixtorio_activate_document",
		"pixtorio_close_document",
		"pixtorio_create_document",
		"pixtorio_edit_document",
		"pixtorio_export_image",
		"pixtorio_get_document",
		"pixtorio_get_preview",
		"pixtorio_list_documents",
		"pixtorio_open_project",
		"pixtorio_read_indexes",
		"pixtorio_read_pixels",
		"pixtorio_read_tilemap",
		"pixtorio_read_tileset",
		"pixtorio_redo",
		"pixtorio_save_project",
		"pixtorio_undo",
	}
	gotNames := make([]string, 0, len(listed.Tools))
	for _, tool := range listed.Tools {
		gotNames = append(gotNames, tool.Name)
		if tool.Annotations == nil {
			t.Errorf("tool %q has no annotations", tool.Name)
		}
		if tool.InputSchema == nil {
			t.Errorf("tool %q has no input schema", tool.Name)
		}
	}
	sort.Strings(gotNames)
	sort.Strings(wantNames)
	if strings.Join(gotNames, "\n") != strings.Join(wantNames, "\n") {
		t.Fatalf("tool names = %v, want %v", gotNames, wantNames)
	}

	resourceList, err := clientSession.ListResources(ctx, nil)
	if err != nil {
		t.Fatalf("ListResources: %v", err)
	}
	if len(resourceList.Resources) != 1 || resourceList.Resources[0].URI != guideURI {
		t.Fatalf("resources = %#v, want %q", resourceList.Resources, guideURI)
	}
	guide, err := clientSession.ReadResource(ctx, &mcp.ReadResourceParams{URI: guideURI})
	if err != nil {
		t.Fatalf("ReadResource: %v", err)
	}
	if len(guide.Contents) != 1 || !strings.Contains(guide.Contents[0].Text, "list_documents") {
		t.Fatalf("guide = %#v", guide.Contents)
	}

	createTool := findTool(listed.Tools, "pixtorio_create_document")
	createSchema, ok := createTool.InputSchema.(map[string]any)
	if !ok {
		t.Fatalf("create schema type = %T", createTool.InputSchema)
	}
	properties, ok := createSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("create properties type = %T", createSchema["properties"])
	}
	width, ok := properties["width"].(map[string]any)
	if !ok || width["default"] != float64(64) {
		t.Fatalf("create width schema = %#v, want default 64", properties["width"])
	}
}

func TestToolDispatchErrorsAreMCPToolErrors(t *testing.T) {
	ctx := context.Background()
	var mu sync.Mutex
	var gotCommand string
	var gotArgs json.RawMessage
	server := New(func(_ context.Context, command string, args json.RawMessage) (json.RawMessage, error) {
		mu.Lock()
		gotCommand = command
		gotArgs = append(gotArgs[:0], args...)
		mu.Unlock()
		return nil, errors.New("document is not open")
	})
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v1"}, nil)
	serverSession, clientSession := connect(t, ctx, server, client)
	defer serverSession.Close()
	defer clientSession.Close()

	result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name:      "pixtorio_get_document",
		Arguments: map[string]any{"documentId": "tab-1"},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if !result.IsError {
		t.Fatalf("CallTool IsError = false, result = %#v", result)
	}
	if len(result.Content) != 1 || result.Content[0].(*mcp.TextContent).Text != "document is not open" {
		t.Fatalf("error content = %#v", result.Content)
	}
	mu.Lock()
	defer mu.Unlock()
	if gotCommand != "get_document" {
		t.Errorf("dispatch command = %q, want get_document", gotCommand)
	}
	var args map[string]any
	if err := json.Unmarshal(gotArgs, &args); err != nil {
		t.Fatalf("dispatch args: %v", err)
	}
	if args["documentId"] != "tab-1" {
		t.Errorf("dispatch args = %#v", args)
	}
}

func TestEditSchemaAdvertisesPixioV4Operations(t *testing.T) {
	server := New(func(context.Context, string, json.RawMessage) (json.RawMessage, error) {
		return json.RawMessage(`{}`), nil
	})
	ctx := context.Background()
	serverSession, clientSession := connect(t, ctx, server, mcp.NewClient(&mcp.Implementation{Name: "schema-client", Version: "v1"}, nil))
	defer serverSession.Close()
	defer clientSession.Close()
	listed, err := clientSession.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	tool := findTool(listed.Tools, "pixtorio_edit_document")
	if tool == nil {
		t.Fatal("missing edit_document tool")
	}
	encoded, err := json.Marshal(tool.InputSchema)
	if err != nil {
		t.Fatal(err)
	}
	schema := string(encoded)
	for _, expected := range []string{"color-burn", "soft-light", "alphaLock", "set_indexes", "set_cel_properties", "update_settings", "add_tag", "add_slice", "add_guide"} {
		if !strings.Contains(schema, expected) {
			t.Errorf("edit schema does not advertise %q: %s", expected, schema)
		}
	}
	if !strings.Contains(schema, `"zIndex"`) || !strings.Contains(schema, `"minimum":-32768`) || !strings.Contains(schema, `"maximum":32767`) {
		t.Errorf("edit schema does not advertise bounded Cel zIndex: %s", schema)
	}
	if !strings.Contains(schema, `"anyOf":[{"required":["opacity"]},{"required":["zIndex"]}]`) {
		t.Errorf("edit schema does not require an opacity or zIndex update: %s", schema)
	}
}

func TestPreviewReturnsImageAndDimensions(t *testing.T) {
	ctx := context.Background()
	pngData := []byte{137, 80, 78, 71, 13, 10, 26, 10}
	server := New(func(_ context.Context, command string, _ json.RawMessage) (json.RawMessage, error) {
		if command != "get_preview" {
			return nil, errors.New("unexpected command")
		}
		return json.Marshal(map[string]any{
			"pngBase64": base64.StdEncoding.EncodeToString(pngData),
			"width":     3,
			"height":    2,
		})
	})
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v1"}, nil)
	serverSession, clientSession := connect(t, ctx, server, client)
	defer serverSession.Close()
	defer clientSession.Close()

	result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name:      "pixtorio_get_preview",
		Arguments: map[string]any{"documentId": "tab-1"},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if result.IsError || len(result.Content) != 2 {
		t.Fatalf("preview result = %#v", result)
	}
	image, ok := result.Content[0].(*mcp.ImageContent)
	if !ok {
		t.Fatalf("preview content[0] = %T, want image", result.Content[0])
	}
	if image.MIMEType != "image/png" || string(image.Data) != string(pngData) {
		t.Errorf("image = %#v", image)
	}
	text, ok := result.Content[1].(*mcp.TextContent)
	if !ok || text.Text != "3x2" {
		t.Errorf("dimensions content = %#v", result.Content[1])
	}
}

func TestSchemaDefaultsAndEditUnion(t *testing.T) {
	ctx := context.Background()
	var calls []struct {
		command string
		args    map[string]any
	}
	server := New(func(_ context.Context, command string, raw json.RawMessage) (json.RawMessage, error) {
		var args map[string]any
		if err := json.Unmarshal(raw, &args); err != nil {
			t.Fatalf("decode dispatched args: %v", err)
		}
		calls = append(calls, struct {
			command string
			args    map[string]any
		}{command: command, args: args})
		return json.RawMessage(`{"ok":true}`), nil
	})
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v1"}, nil)
	serverSession, clientSession := connect(t, ctx, server, client)
	defer serverSession.Close()
	defer clientSession.Close()

	created, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name:      "pixtorio_create_document",
		Arguments: map[string]any{"colorMode": "rgba"},
	})
	if err != nil || created.IsError {
		t.Fatalf("create CallTool = %#v, err=%v", created, err)
	}
	if len(calls) != 1 || calls[0].args["width"] != float64(64) || calls[0].args["height"] != float64(64) {
		t.Fatalf("create defaults = %#v", calls)
	}

	edited, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name: "pixtorio_edit_document",
		Arguments: map[string]any{
			"documentId": "tab-1",
			"operations": []any{
				map[string]any{
					"type": "set_pixels",
					"pixels": []any{map[string]any{
						"x": 1, "y": 2, "color": "#AABBCC80",
					}},
				},
				map[string]any{"type": "rename_document", "name": "Updated"},
			},
		},
	})
	if err != nil || edited.IsError {
		t.Fatalf("edit CallTool = %#v, err=%v", edited, err)
	}
	if len(calls) != 2 || calls[1].command != "edit_document" {
		t.Fatalf("edit dispatches = %#v", calls)
	}

	invalid, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name: "pixtorio_create_document",
		Arguments: map[string]any{
			"width": 2049,
		},
	})
	if err != nil {
		t.Fatalf("invalid create CallTool: %v", err)
	}
	if !invalid.IsError || len(calls) != 2 {
		t.Fatalf("invalid create = %#v, calls = %#v", invalid, calls)
	}
}

func TestCrossFieldBoundsReturnToolErrorsBeforeDispatch(t *testing.T) {
	ctx := context.Background()
	dispatched := false
	server := New(func(context.Context, string, json.RawMessage) (json.RawMessage, error) {
		dispatched = true
		return json.RawMessage(`{}`), nil
	})
	client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "v1"}, nil)
	serverSession, clientSession := connect(t, ctx, server, client)
	defer serverSession.Close()
	defer clientSession.Close()

	result, err := clientSession.CallTool(ctx, &mcp.CallToolParams{
		Name: "pixtorio_read_pixels",
		Arguments: map[string]any{
			"documentId": "tab-1",
			"x":          0,
			"y":          0,
			"width":      129,
			"height":     128,
		},
	})
	if err != nil {
		t.Fatalf("CallTool: %v", err)
	}
	if !result.IsError || dispatched {
		t.Fatalf("result = %#v, dispatched = %v", result, dispatched)
	}
}

func connect(t *testing.T, ctx context.Context, server *mcp.Server, client *mcp.Client) (*mcp.ServerSession, *mcp.ClientSession) {
	t.Helper()
	clientTransport, serverTransport := mcp.NewInMemoryTransports()
	serverSession, err := server.Connect(ctx, serverTransport, nil)
	if err != nil {
		t.Fatalf("server Connect: %v", err)
	}
	clientSession, err := client.Connect(ctx, clientTransport, nil)
	if err != nil {
		_ = serverSession.Close()
		t.Fatalf("client Connect: %v", err)
	}
	return serverSession, clientSession
}

func findTool(tools []*mcp.Tool, name string) *mcp.Tool {
	for _, tool := range tools {
		if tool.Name == name {
			return tool
		}
	}
	return nil
}

package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	pngexport "pixtorio/internal/export"
)

const mcpBodyLimit = 128 << 20

type mcpCommand struct {
	ID   string          `json:"id"`
	Name string          `json:"name"`
	Args json.RawMessage `json:"args"`
}

type mcpReply struct {
	Result json.RawMessage `json:"result,omitempty"`
	Error  string          `json:"error,omitempty"`
}

type mcpPending struct {
	ctx     context.Context
	reply   chan mcpReply
	claimed bool
}

type mcpConnection struct {
	Address string `json:"address"`
	Token   string `json:"token"`
}

type desktopMCP struct {
	mu            sync.Mutex
	ready         bool
	pending       map[string]*mcpPending
	serial        chan struct{}
	next          atomic.Uint64
	emit          func(mcpCommand)
	connection    mcpConnection
	server        *http.Server
	discoveryPath string
}

func newDesktopMCP(emit func(mcpCommand)) *desktopMCP {
	return &desktopMCP{pending: make(map[string]*mcpPending), serial: make(chan struct{}, 1), emit: emit}
}

func mcpDiscoveryPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "Pixtorio", "mcp-connection.json"), nil
}

func (m *desktopMCP) start() error {
	path, err := mcpDiscoveryPath()
	if err != nil {
		return err
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		return err
	}
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		listener.Close()
		return err
	}
	m.connection = mcpConnection{Address: "http://" + listener.Addr().String(), Token: hex.EncodeToString(token)}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		listener.Close()
		return err
	}
	encoded, _ := json.Marshal(m.connection)
	if err := os.WriteFile(path, encoded, 0600); err != nil {
		listener.Close()
		return err
	}
	m.discoveryPath = path
	m.server = &http.Server{Handler: http.HandlerFunc(m.serveHTTP), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 30 * time.Second}
	go func() { _ = m.server.Serve(listener) }()
	return nil
}

func (m *desktopMCP) close() {
	m.mu.Lock()
	m.ready = false
	for id, pending := range m.pending {
		pending.reply <- mcpReply{Error: "Pixtorio is shutting down"}
		delete(m.pending, id)
	}
	m.mu.Unlock()
	if m.server != nil {
		_ = m.server.Close()
	}
	data, err := os.ReadFile(m.discoveryPath)
	var connection mcpConnection
	if err == nil && json.Unmarshal(data, &connection) == nil && connection.Token == m.connection.Token {
		_ = os.Remove(m.discoveryPath)
	}
}

func (m *desktopMCP) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	address, _ := url.Parse(m.connection.Address)
	if r.Header.Get("Origin") != "" || r.Host != address.Host || subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+m.connection.Token)) != 1 {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost || r.URL.Path != "/command" {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	var request mcpCommand
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, mcpBodyLimit))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		http.Error(w, "invalid command", http.StatusBadRequest)
		return
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		http.Error(w, "invalid command", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	select {
	case m.serial <- struct{}{}:
		defer func() { <-m.serial }()
	case <-ctx.Done():
		_ = json.NewEncoder(w).Encode(mcpReply{Error: ctx.Err().Error()})
		return
	}
	result, err := m.dispatch(ctx, request.Name, request.Args)
	reply := mcpReply{Result: result}
	if err != nil {
		reply = mcpReply{Error: err.Error()}
	}
	_ = json.NewEncoder(w).Encode(reply)
}

func (m *desktopMCP) ask(ctx context.Context, name string, args json.RawMessage) (json.RawMessage, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	id := fmt.Sprint(m.next.Add(1))
	pending := &mcpPending{ctx: ctx, reply: make(chan mcpReply, 1)}
	m.mu.Lock()
	if !m.ready {
		m.mu.Unlock()
		return nil, fmt.Errorf("desktop editor is not ready; open Pixtorio and finish any startup dialog")
	}
	m.pending[id] = pending
	m.mu.Unlock()
	defer func() { m.mu.Lock(); delete(m.pending, id); m.mu.Unlock() }()
	m.emit(mcpCommand{ID: id, Name: name, Args: args})
	select {
	case reply := <-pending.reply:
		if reply.Error != "" {
			return nil, fmt.Errorf("%s", reply.Error)
		}
		return reply.Result, nil
	case <-ctx.Done():
		return nil, fmt.Errorf("MCP request cancelled or timed out; if execution already began, inspect document state before retrying: %w", ctx.Err())
	}
}

func (m *desktopMCP) claim(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	pending := m.pending[id]
	if pending == nil || pending.claimed || pending.ctx.Err() != nil {
		return false
	}
	pending.claimed = true
	return true
}

func (m *desktopMCP) complete(id, result, message string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	pending := m.pending[id]
	if pending == nil || !pending.claimed {
		return
	}
	delete(m.pending, id)
	if message == "" && !json.Valid([]byte(result)) {
		message = "editor returned invalid JSON"
	}
	pending.reply <- mcpReply{Result: json.RawMessage(result), Error: message}
}

func mcpJSON(value any) json.RawMessage { data, _ := json.Marshal(value); return data }

type mcpFileArgs struct {
	DocumentID string `json:"documentId"`
	Path       string `json:"path"`
	Overwrite  bool   `json:"overwrite"`
	Format     string `json:"format"`
	Scale      int    `json:"scale"`
	Columns    int    `json:"columns"`
	FrameID    string `json:"frameId"`
}

func validateMCPPath(path, extension string, writing, overwrite bool) error {
	if !filepath.IsAbs(path) || strings.HasPrefix(path, `\\`) || strings.Contains(filepath.Base(path), ":") {
		return fmt.Errorf("path must be an absolute local filesystem path")
	}
	if !strings.EqualFold(filepath.Ext(path), extension) {
		return fmt.Errorf("path must end in %s", extension)
	}
	if writing && !overwrite {
		if _, err := os.Stat(path); err == nil {
			return fmt.Errorf("file already exists; pass overwrite=true to replace it")
		} else if !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

// Reserve new destinations exclusively so another writer cannot race the
// existence check and have its file silently replaced by our atomic encoder.
func writeMCPDestination(path string, overwrite bool, write func() error) error {
	if overwrite {
		return write()
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return fmt.Errorf("reserve destination (use overwrite=true for existing files): %w", err)
	}
	reserved, statErr := file.Stat()
	closeErr := file.Close()
	if statErr != nil {
		return statErr
	}
	defer func() {
		if current, err := os.Stat(path); err == nil && os.SameFile(reserved, current) {
			_ = os.Remove(path)
		}
	}()
	if closeErr != nil {
		return closeErr
	}
	return write()
}

func (m *desktopMCP) dispatch(ctx context.Context, name string, raw json.RawMessage) (json.RawMessage, error) {
	switch name {
	case "list_documents", "create_document", "activate_document", "close_document", "get_document", "edit_document", "read_pixels", "read_indexes", "undo", "redo":
		return m.ask(ctx, name, raw)
	case "open_project", "save_project", "export_image", "get_preview":
	default:
		return nil, fmt.Errorf("unknown command %q", name)
	}
	var args mcpFileArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, err
	}
	if name == "open_project" {
		if err := validateMCPPath(args.Path, ".pixio", false, false); err != nil {
			return nil, err
		}
		args.Path = filepath.Clean(args.Path)
		app := &App{}
		opened, err := app.openProjectResult(args.Path)
		if err != nil {
			return nil, err
		}
		var payload openProjectResult
		if err := json.Unmarshal([]byte(opened), &payload); err != nil {
			return nil, err
		}
		return m.ask(ctx, "open_document", mcpJSON(payload))
	}
	if args.DocumentID == "" {
		return nil, fmt.Errorf("documentId is required")
	}
	if name == "save_project" {
		if err := validateMCPPath(args.Path, ".pixio", true, args.Overwrite); err != nil {
			return nil, err
		}
		args.Path = filepath.Clean(args.Path)
		data, err := m.ask(ctx, "save_snapshot", mcpJSON(args))
		if err != nil {
			return nil, err
		}
		var snapshot struct {
			Document string `json:"document"`
			StateID  int    `json:"stateId"`
		}
		if err := json.Unmarshal(data, &snapshot); err != nil {
			return nil, err
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		app := &App{}
		if err := writeMCPDestination(args.Path, args.Overwrite, func() error {
			_, err := app.SavePixioPath(args.Path, snapshot.Document)
			return err
		}); err != nil {
			return nil, err
		}
		_, err = m.ask(ctx, "mark_saved", mcpJSON(map[string]any{"documentId": args.DocumentID, "path": args.Path, "stateId": snapshot.StateID}))
		if err != nil {
			return nil, fmt.Errorf("file saved to %s but editor acknowledgement failed: %w", args.Path, err)
		}
		return mcpJSON(map[string]any{"path": args.Path, "stateId": snapshot.StateID}), nil
	}
	if args.Scale == 0 {
		args.Scale = 1
	}
	if args.Scale < 1 || args.Scale > 8 {
		return nil, fmt.Errorf("scale must be between 1 and 8")
	}
	if name == "get_preview" {
		args.Format = "png"
	}
	if args.Format != "png" && args.Format != "gif" && args.Format != "spritesheet" {
		return nil, fmt.Errorf("format must be png, gif or spritesheet")
	}
	if name == "export_image" {
		extension := ".png"
		if args.Format == "gif" {
			extension = ".gif"
		}
		if err := validateMCPPath(args.Path, extension, true, args.Overwrite); err != nil {
			return nil, err
		}
	}
	if args.Columns < 0 || args.Columns > 256 {
		return nil, fmt.Errorf("columns must be between 1 and 256 when specified")
	}
	data, err := m.ask(ctx, "export_snapshot", mcpJSON(args))
	if err != nil {
		return nil, err
	}
	var snapshot struct {
		Width     int      `json:"width"`
		Height    int      `json:"height"`
		Frames    [][]byte `json:"frames"`
		Durations []int    `json:"durations"`
	}
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return nil, err
	}
	if !validPNGImportDimensions(snapshot.Width, snapshot.Height) || len(snapshot.Frames) == 0 {
		return nil, fmt.Errorf("invalid export snapshot")
	}
	for _, frame := range snapshot.Frames {
		if len(frame) != snapshot.Width*snapshot.Height*4 {
			return nil, fmt.Errorf("invalid frame buffer")
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if args.Format == "png" {
		width, height := snapshot.Width*args.Scale, snapshot.Height*args.Scale
		pixels := snapshot.Frames[0]
		if args.Scale != 1 {
			if int64(width)*int64(height)*4 > mcpBodyLimit {
				return nil, fmt.Errorf("scaled PNG exceeds 128 MiB")
			}
			pixels = make([]byte, width*height*4)
			for y := 0; y < height; y++ {
				for x := 0; x < width; x++ {
					source := ((y/args.Scale)*snapshot.Width + x/args.Scale) * 4
					copy(pixels[(y*width+x)*4:], snapshot.Frames[0][source:source+4])
				}
			}
		}
		if name == "get_preview" {
			var buffer bytes.Buffer
			if err := png.Encode(&buffer, &image.NRGBA{Pix: pixels, Stride: width * 4, Rect: image.Rect(0, 0, width, height)}); err != nil {
				return nil, err
			}
			return mcpJSON(map[string]any{"pngBase64": base64.StdEncoding.EncodeToString(buffer.Bytes()), "width": width, "height": height}), nil
		}
		err = writeMCPDestination(args.Path, args.Overwrite, func() error {
			return pngexport.WriteFile(args.Path, width, height, pixels)
		})
	} else if args.Format == "gif" {
		err = writeMCPDestination(args.Path, args.Overwrite, func() error {
			return pngexport.WriteGIFWithOptions(args.Path, snapshot.Width, snapshot.Height, snapshot.Frames, snapshot.Durations, pngexport.GIFOptions{Scale: args.Scale})
		})
	} else {
		var layout pngexport.SpriteSheetLayoutResult
		err = writeMCPDestination(args.Path, args.Overwrite, func() error {
			var encodeErr error
			layout, encodeErr = pngexport.WriteSpriteSheetWithOptions(args.Path, snapshot.Width, snapshot.Height, snapshot.Frames, pngexport.SpriteSheetOptions{Layout: "grid", Columns: args.Columns, Scale: args.Scale})
			return encodeErr
		})
		if err == nil {
			return mcpJSON(map[string]any{"path": args.Path, "layout": layout}), nil
		}
	}
	if err != nil {
		return nil, err
	}
	return mcpJSON(map[string]any{"path": args.Path}), nil
}

func callDesktopMCP(ctx context.Context, name string, args json.RawMessage) (json.RawMessage, error) {
	path, err := mcpDiscoveryPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("open the Pixtorio desktop application before using MCP: %w", err)
	}
	var connection mcpConnection
	if err := json.Unmarshal(data, &connection); err != nil {
		return nil, err
	}
	address, err := url.Parse(connection.Address)
	if err != nil || address.Scheme != "http" || address.Hostname() != "127.0.0.1" || address.Port() == "" || len(connection.Token) != 64 {
		return nil, fmt.Errorf("invalid local MCP connection file")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, connection.Address+"/command", bytes.NewReader(mcpJSON(mcpCommand{Name: name, Args: args})))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+connection.Token)
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 35 * time.Second, Transport: &http.Transport{Proxy: nil}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	defer client.CloseIdleConnections()
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("cannot reach Pixtorio; keep the desktop application open: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("desktop MCP HTTP status %d", response.StatusCode)
	}
	var reply mcpReply
	if err := json.NewDecoder(io.LimitReader(response.Body, mcpBodyLimit+1)).Decode(&reply); err != nil {
		return nil, err
	}
	if reply.Error != "" {
		return nil, fmt.Errorf("%s", reply.Error)
	}
	return reply.Result, nil
}

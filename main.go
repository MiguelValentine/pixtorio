package main

import (
	"context"
	"embed"
	"fmt"
	"os"

	"pixtorio/internal/mcpserver"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--mcp" {
		if err := mcpserver.Run(context.Background(), callDesktopMCP); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		return
	}
	app := NewApp()

	if err := wails.Run(&options.App{
		Title:     "Pixtorio",
		Width:     1280,
		Height:    820,
		MinWidth:  960,
		MinHeight: 640,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 30, G: 31, B: 34, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		OnBeforeClose:    app.beforeClose,
		Bind: []interface{}{
			app,
		},
	}); err != nil {
		fmt.Println("Pixtorio failed to start:", err)
	}
}

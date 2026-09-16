//go:build !windows

package main

import "fmt"

func (a *App) ClipboardWriteImage(width, height int, pixelsBase64 string) error {
	return fmt.Errorf("native image clipboard is unavailable on this platform")
}

func (a *App) ClipboardReadImage() (string, error) {
	return "", nil
}

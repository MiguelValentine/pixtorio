//go:build windows

package main

import (
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	clipboardDIBV5 = 17
	globalMoveable = 0x0002
	bitmapV5Size   = 124
)

var (
	user32Clipboard          = windows.NewLazySystemDLL("user32.dll")
	kernel32Clipboard        = windows.NewLazySystemDLL("kernel32.dll")
	procOpenClipboard        = user32Clipboard.NewProc("OpenClipboard")
	procCloseClipboard       = user32Clipboard.NewProc("CloseClipboard")
	procEmptyClipboard       = user32Clipboard.NewProc("EmptyClipboard")
	procSetClipboardData     = user32Clipboard.NewProc("SetClipboardData")
	procGetClipboardData     = user32Clipboard.NewProc("GetClipboardData")
	procIsClipboardAvailable = user32Clipboard.NewProc("IsClipboardFormatAvailable")
	procGlobalAlloc          = kernel32Clipboard.NewProc("GlobalAlloc")
	procGlobalFree           = kernel32Clipboard.NewProc("GlobalFree")
	procGlobalLock           = kernel32Clipboard.NewProc("GlobalLock")
	procGlobalUnlock         = kernel32Clipboard.NewProc("GlobalUnlock")
	procGlobalSize           = kernel32Clipboard.NewProc("GlobalSize")
)

type clipboardImage struct {
	Name   string `json:"name"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Pixels string `json:"pixels"`
}

func (a *App) ClipboardWriteImage(width, height int, pixelsBase64 string) error {
	if width <= 0 || height <= 0 || width > maxPNGImportDimension || height > maxPNGImportDimension {
		return fmt.Errorf("invalid clipboard image dimensions")
	}
	pixels, err := base64.StdEncoding.DecodeString(pixelsBase64)
	if err != nil || len(pixels) != width*height*4 {
		return fmt.Errorf("invalid clipboard image pixels")
	}
	payload := make([]byte, bitmapV5Size+len(pixels))
	binary.LittleEndian.PutUint32(payload[0:4], bitmapV5Size)
	binary.LittleEndian.PutUint32(payload[4:8], uint32(int32(width)))
	binary.LittleEndian.PutUint32(payload[8:12], uint32(int32(-height)))
	binary.LittleEndian.PutUint16(payload[12:14], 1)
	binary.LittleEndian.PutUint16(payload[14:16], 32)
	binary.LittleEndian.PutUint32(payload[16:20], 3) // BI_BITFIELDS
	binary.LittleEndian.PutUint32(payload[20:24], uint32(len(pixels)))
	binary.LittleEndian.PutUint32(payload[40:44], 0x00ff0000)
	binary.LittleEndian.PutUint32(payload[44:48], 0x0000ff00)
	binary.LittleEndian.PutUint32(payload[48:52], 0x000000ff)
	binary.LittleEndian.PutUint32(payload[52:56], 0xff000000)
	binary.LittleEndian.PutUint32(payload[56:60], 0x73524742) // LCS_sRGB
	for index := 0; index < width*height; index++ {
		source := index * 4
		target := bitmapV5Size + source
		payload[target] = pixels[source+2]
		payload[target+1] = pixels[source+1]
		payload[target+2] = pixels[source]
		payload[target+3] = pixels[source+3]
	}

	handle, _, err := procGlobalAlloc.Call(globalMoveable, uintptr(len(payload)))
	if handle == 0 {
		return fmt.Errorf("allocate clipboard image: %w", err)
	}
	owned := true
	defer func() {
		if owned {
			procGlobalFree.Call(handle)
		}
	}()
	pointer, _, err := procGlobalLock.Call(handle)
	if pointer == 0 {
		return fmt.Errorf("lock clipboard image: %w", err)
	}
	copy(unsafe.Slice((*byte)(unsafe.Pointer(pointer)), len(payload)), payload)
	procGlobalUnlock.Call(handle)
	if err := openSystemClipboard(); err != nil {
		return err
	}
	defer procCloseClipboard.Call()
	if result, _, callErr := procEmptyClipboard.Call(); result == 0 {
		return fmt.Errorf("clear clipboard: %w", callErr)
	}
	if result, _, callErr := procSetClipboardData.Call(clipboardDIBV5, handle); result == 0 {
		return fmt.Errorf("set clipboard image: %w", callErr)
	}
	owned = false
	return nil
}

func (a *App) ClipboardReadImage() (string, error) {
	available, _, _ := procIsClipboardAvailable.Call(clipboardDIBV5)
	if available == 0 {
		return "", nil
	}
	if err := openSystemClipboard(); err != nil {
		return "", err
	}
	defer procCloseClipboard.Call()
	handle, _, callErr := procGetClipboardData.Call(clipboardDIBV5)
	if handle == 0 {
		return "", fmt.Errorf("get clipboard image: %w", callErr)
	}
	size, _, _ := procGlobalSize.Call(handle)
	pointer, _, callErr := procGlobalLock.Call(handle)
	if pointer == 0 || size < bitmapV5Size {
		return "", fmt.Errorf("lock clipboard image: %w", callErr)
	}
	defer procGlobalUnlock.Call(handle)
	payload := unsafe.Slice((*byte)(unsafe.Pointer(pointer)), int(size))
	headerSize := int(binary.LittleEndian.Uint32(payload[0:4]))
	width := int(int32(binary.LittleEndian.Uint32(payload[4:8])))
	rawHeight := int32(binary.LittleEndian.Uint32(payload[8:12]))
	height := int(rawHeight)
	topDown := height < 0
	if topDown {
		height = -height
	}
	bits := int(binary.LittleEndian.Uint16(payload[14:16]))
	if width <= 0 || height <= 0 || width > maxPNGImportDimension || height > maxPNGImportDimension || bits != 32 || headerSize < 40 {
		return "", fmt.Errorf("unsupported clipboard bitmap")
	}
	stride := ((width*bits + 31) / 32) * 4
	if headerSize+stride*height > len(payload) {
		return "", fmt.Errorf("truncated clipboard bitmap")
	}
	pixels := make([]byte, width*height*4)
	alphaPresent := false
	for y := 0; y < height; y++ {
		sourceY := y
		if !topDown {
			sourceY = height - 1 - y
		}
		for x := 0; x < width; x++ {
			source := headerSize + sourceY*stride + x*4
			target := (y*width + x) * 4
			pixels[target] = payload[source+2]
			pixels[target+1] = payload[source+1]
			pixels[target+2] = payload[source]
			pixels[target+3] = payload[source+3]
			alphaPresent = alphaPresent || payload[source+3] != 0
		}
	}
	if !alphaPresent {
		for index := 3; index < len(pixels); index += 4 {
			pixels[index] = 255
		}
	}
	encoded, err := json.Marshal(clipboardImage{Name: "Clipboard", Width: width, Height: height, Pixels: base64.StdEncoding.EncodeToString(pixels)})
	return string(encoded), err
}

func openSystemClipboard() error {
	for attempt := 0; attempt < 8; attempt++ {
		if result, _, _ := procOpenClipboard.Call(0); result != 0 {
			return nil
		}
		time.Sleep(8 * time.Millisecond)
	}
	return fmt.Errorf("open clipboard: clipboard is busy")
}

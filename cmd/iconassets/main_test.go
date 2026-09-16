package main

import (
	"bytes"
	"encoding/binary"
	"encoding/xml"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"testing"
)

func TestGeneratedAssetsMatchApprovedDraft(t *testing.T) {
	read := func(path string) []byte {
		t.Helper()
		data, err := os.ReadFile("../../" + path)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	decode := func(data []byte) image.Image {
		t.Helper()
		result, err := png.Decode(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		return result
	}
	source := decode(read("artifacts/logo-draft/pixtorio-pixel-p.png"))
	var svg svgImage
	if err := xml.Unmarshal(read("frontend/public/appicon.svg"), &svg); err != nil {
		t.Fatal(err)
	}
	if svg.Width != 64 || svg.Height != 64 || svg.Render != "crispEdges" {
		t.Fatal("SVG must preserve the original pixel canvas")
	}
	raster := image.NewNRGBA(image.Rect(0, 0, svg.Width, svg.Height))
	for _, rect := range svg.Rects {
		var r, g, b uint8
		if _, err := fmt.Sscanf(rect.Fill, "#%02x%02x%02x", &r, &g, &b); err != nil {
			t.Fatal(err)
		}
		if rect.Opacity != "" {
			t.Fatal("approved draft uses only opaque colors and transparent empty space")
		}
		for y := rect.Y; y < rect.Y+rect.Height; y++ {
			for x := rect.X; x < rect.X+rect.Width; x++ {
				raster.SetNRGBA(x, y, color.NRGBA{R: r, G: g, B: b, A: 255})
			}
		}
	}
	for y := 0; y < 64; y++ {
		for x := 0; x < 64; x++ {
			if raster.NRGBAAt(x, y) != color.NRGBAModel.Convert(source.At(x, y)).(color.NRGBA) {
				t.Fatalf("SVG differs at (%d, %d)", x, y)
			}
		}
	}
	iconData := read("build/windows/icon.ico")
	if !bytes.Equal(iconData, read("build/windows/appicon.ico")) {
		t.Fatal("application and file-association icons differ")
	}
	sizes := []int{16, 24, 32, 48, 64, 128, 256}
	if len(iconData) < 6+16*len(sizes) || binary.LittleEndian.Uint16(iconData[4:6]) != uint16(len(sizes)) {
		t.Fatal("missing icon sizes")
	}
	for index, size := range sizes {
		entry := iconData[6+16*index : 6+16*(index+1)]
		length := binary.LittleEndian.Uint32(entry[8:12])
		offset := binary.LittleEndian.Uint32(entry[12:16])
		if uint64(offset)+uint64(length) > uint64(len(iconData)) {
			t.Fatal("invalid icon payload offset")
		}
		payload := iconData[offset : offset+length]
		decoded := decode(payload)
		if decoded.Bounds().Dx() != size || decoded.Bounds().Dy() != size {
			t.Fatalf("invalid %dpx icon dimensions", size)
		}
		expected, err := resizedPNG(source, size)
		if err != nil || !bytes.Equal(payload, expected) {
			t.Fatalf("%dpx icon differs from approved draft", size)
		}
	}
	expected, err := resizedPNG(source, 1024)
	if err != nil || !bytes.Equal(read("build/appicon.png"), expected) {
		t.Fatal("build PNG differs from approved draft")
	}
}

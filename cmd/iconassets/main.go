// Command iconassets converts the approved pixel-art draft into application assets.
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
	"path/filepath"
)

type svgRect struct {
	X       int    `xml:"x,attr"`
	Y       int    `xml:"y,attr"`
	Width   int    `xml:"width,attr"`
	Height  int    `xml:"height,attr"`
	Fill    string `xml:"fill,attr"`
	Opacity string `xml:"fill-opacity,attr,omitempty"`
}

type svgImage struct {
	XMLName xml.Name  `xml:"svg"`
	XMLNS   string    `xml:"xmlns,attr"`
	Width   int       `xml:"width,attr"`
	Height  int       `xml:"height,attr"`
	ViewBox string    `xml:"viewBox,attr"`
	Render  string    `xml:"shape-rendering,attr"`
	Title   string    `xml:"title"`
	Rects   []svgRect `xml:"rect"`
}

func vectorize(source image.Image) svgImage {
	bounds := source.Bounds()
	result := svgImage{XMLNS: "http://www.w3.org/2000/svg", Width: bounds.Dx(), Height: bounds.Dy(),
		ViewBox: fmt.Sprintf("0 0 %d %d", bounds.Dx(), bounds.Dy()), Render: "crispEdges", Title: "Pixtorio"}
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; {
			pixel := color.NRGBAModel.Convert(source.At(x, y)).(color.NRGBA)
			end := x + 1
			for end < bounds.Max.X && color.NRGBAModel.Convert(source.At(end, y)).(color.NRGBA) == pixel {
				end++
			}
			if pixel.A > 0 {
				rect := svgRect{X: x - bounds.Min.X, Y: y - bounds.Min.Y, Width: end - x, Height: 1,
					Fill: fmt.Sprintf("#%02x%02x%02x", pixel.R, pixel.G, pixel.B)}
				if pixel.A < 255 {
					rect.Opacity = fmt.Sprintf("%.8f", float64(pixel.A)/255)
				}
				result.Rects = append(result.Rects, rect)
			}
			x = end
		}
	}
	return result
}

func resizedPNG(source image.Image, size int) ([]byte, error) {
	bounds := source.Bounds()
	destination := image.NewNRGBA(image.Rect(0, 0, size, size))
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			sx := bounds.Min.X + (2*x+1)*bounds.Dx()/(2*size)
			sy := bounds.Min.Y + (2*y+1)*bounds.Dy()/(2*size)
			destination.Set(x, y, source.At(sx, sy))
		}
	}
	var output bytes.Buffer
	err := png.Encode(&output, destination)
	return output.Bytes(), err
}

func icon(source image.Image) ([]byte, error) {
	sizes := []int{16, 24, 32, 48, 64, 128, 256}
	output := make([]byte, 6+16*len(sizes))
	binary.LittleEndian.PutUint16(output[2:4], 1)
	binary.LittleEndian.PutUint16(output[4:6], uint16(len(sizes)))
	for index, size := range sizes {
		data, err := resizedPNG(source, size)
		if err != nil {
			return nil, err
		}
		entry := output[6+16*index : 6+16*(index+1)]
		// ICO encodes 256 as zero; each entry carries a complete RGBA PNG.
		entry[0], entry[1] = byte(size%256), byte(size%256)
		binary.LittleEndian.PutUint16(entry[4:6], 1)
		binary.LittleEndian.PutUint16(entry[6:8], 32)
		binary.LittleEndian.PutUint32(entry[8:12], uint32(len(data)))
		binary.LittleEndian.PutUint32(entry[12:16], uint32(len(output)))
		output = append(output, data...)
	}
	return output, nil
}

func writeAsset(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return err
	}
	fmt.Println(path)
	return nil
}

func run() error {
	file, err := os.Open("artifacts/logo-draft/pixtorio-pixel-p.png")
	if err != nil {
		return err
	}
	defer file.Close()
	source, err := png.Decode(file)
	if err != nil {
		return err
	}
	vector, err := xml.MarshalIndent(vectorize(source), "", "  ")
	if err != nil {
		return err
	}
	bitmap, err := resizedPNG(source, 1024)
	if err != nil {
		return err
	}
	windowsIcon, err := icon(source)
	if err != nil {
		return err
	}
	for _, asset := range []struct {
		path string
		data []byte
	}{
		{"frontend/public/appicon.svg", append([]byte(xml.Header), append(vector, '\n')...)},
		{"build/appicon.png", bitmap},
		{"build/windows/icon.ico", windowsIcon},
		{"build/windows/appicon.ico", windowsIcon},
	} {
		if err := writeAsset(asset.path, asset.data); err != nil {
			return err
		}
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

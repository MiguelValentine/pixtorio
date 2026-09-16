package export

import (
	"fmt"
	"image"
	"image/color"
	"image/color/palette"
	"image/gif"
	"image/png"
	"os"
	"path/filepath"
	"strings"
)

const (
	maxDimension            = 16384
	maxExportScale          = 8
	maxGIFDelayCentiseconds = 1<<16 - 1
	maxGIFLoopCount         = 1<<16 - 1
)

// GIFOptions controls optional animated GIF export behavior. A zero Scale
// uses 1x output. A LoopCount of 0 means loop forever and -1 means play once.
type GIFOptions struct {
	Scale     int `json:"scale"`
	LoopCount int `json:"loopCount"`
}

// SpriteSheetOptions controls sprite sheet layout. Padding values are in
// output pixels and are left transparent. An empty Layout uses horizontal
// packing, and a zero Columns value uses one column per frame in a grid.
type SpriteSheetOptions struct {
	Layout        string `json:"layout"`
	Columns       int    `json:"columns"`
	Scale         int    `json:"scale"`
	BorderPadding int    `json:"borderPadding"`
	ShapePadding  int    `json:"shapePadding"`
}

const (
	SpriteSheetLayoutHorizontal = "horizontal"
	SpriteSheetLayoutVertical   = "vertical"
	SpriteSheetLayoutGrid       = "grid"
)

// SpriteSheetFrameRect identifies the scaled content rectangle for one frame.
// The rectangle excludes border and shape padding.
type SpriteSheetFrameRect struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// SpriteSheetLayoutResult describes the output dimensions and frame positions.
// It is intentionally made of scalar fields so it can be passed to JSON
// consumers without depending on image.Rectangle's Min/Max representation.
type SpriteSheetLayoutResult struct {
	Width      int                    `json:"width"`
	Height     int                    `json:"height"`
	FrameRects []SpriteSheetFrameRect `json:"frames"`
}

func WriteFile(path string, width, height int, pixels []uint8) error {
	if err := validateImageDimensions(width, height); err != nil {
		return err
	}
	want, err := rgbaBufferSize(width, height)
	if err != nil {
		return err
	}
	if len(pixels) != want {
		return fmt.Errorf("invalid RGBA buffer: got %d bytes, want %d", len(pixels), want)
	}

	img := &image.NRGBA{
		Pix:    pixels,
		Stride: width * 4,
		Rect:   image.Rect(0, 0, width, height),
	}
	return writeAtomically(path, "PNG", func(file *os.File) error {
		return png.Encode(file, img)
	})
}

// WriteGIF writes RGBA animation frames with centisecond delays.
func WriteGIF(path string, width, height int, frames [][]uint8, durationsMS []int) error {
	return WriteGIFWithOptions(path, width, height, frames, durationsMS, GIFOptions{})
}

// WriteGIFWithOptions writes RGBA animation frames with optional nearest
// neighbor scaling and GIF loop count controls.
func WriteGIFWithOptions(path string, width, height int, frames [][]uint8, durationsMS []int, options GIFOptions) error {
	if len(frames) == 0 || len(frames) != len(durationsMS) {
		return fmt.Errorf("GIF frames and durations must be non-empty and equal")
	}
	if err := validateImageDimensions(width, height); err != nil {
		return err
	}
	scale, err := normalizedScale(options.Scale)
	if err != nil {
		return fmt.Errorf("GIF %w", err)
	}
	if options.LoopCount < -1 || options.LoopCount > maxGIFLoopCount {
		return fmt.Errorf("GIF loop count must be between -1 and %d", maxGIFLoopCount)
	}
	scaledWidth, err := scaledDimension(width, scale)
	if err != nil {
		return fmt.Errorf("GIF %w", err)
	}
	scaledHeight, err := scaledDimension(height, scale)
	if err != nil {
		return fmt.Errorf("GIF %w", err)
	}

	opaquePalette := color.Palette(palette.Plan9[:255])
	gifPalette := make(color.Palette, 1, 256)
	gifPalette[0] = color.NRGBA{A: 0}
	gifPalette = append(gifPalette, opaquePalette...)
	delays := make([]int, len(frames))
	for index, pixels := range frames {
		if err := validateRGBA(width, height, pixels); err != nil {
			return err
		}
		delay, err := gifDelayCentiseconds(durationsMS[index])
		if err != nil {
			return err
		}
		delays[index] = delay
	}

	animation := &gif.GIF{
		LoopCount: options.LoopCount,
		Disposal:  make([]byte, len(frames)),
	}
	// Each exported frame is a complete canvas. Clear it after display so
	// transparent pixels in the next frame do not reveal the previous frame.
	for index := range animation.Disposal {
		animation.Disposal[index] = gif.DisposalBackground
	}
	for index, pixels := range frames {
		indexed := image.NewPaletted(image.Rect(0, 0, scaledWidth, scaledHeight), gifPalette)
		source := &image.NRGBA{Pix: pixels, Stride: width * 4, Rect: image.Rect(0, 0, width, height)}
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				pixel := source.NRGBAAt(x, y)
				colorIndex := uint8(0)
				if pixel.A == 0 {
					// Keep the entire scaled source pixel transparent.
				} else {
					pixel.A = 255
					colorIndex = uint8(opaquePalette.Index(pixel) + 1)
				}
				for scaledY := 0; scaledY < scale; scaledY++ {
					for scaledX := 0; scaledX < scale; scaledX++ {
						indexed.SetColorIndex(x*scale+scaledX, y*scale+scaledY, colorIndex)
					}
				}
			}
		}
		animation.Image = append(animation.Image, indexed)
		animation.Delay = append(animation.Delay, delays[index])
	}
	return writeAtomically(path, "GIF", func(file *os.File) error {
		return gif.EncodeAll(file, animation)
	})
}

// WriteSpriteSheet packs equally sized RGBA frames from left to right.
func WriteSpriteSheet(path string, width, height int, frames [][]uint8) error {
	if len(frames) == 0 {
		return fmt.Errorf("sprite sheet needs at least one frame")
	}
	// Keep the legacy error for callers that still use the original horizontal
	// layout API.
	if err := validateRGBA(width, height, frames[0]); err != nil {
		return err
	}
	if width > 0 && width <= maxDimension && len(frames) > maxDimension/width {
		return fmt.Errorf("sprite sheet is too wide")
	}
	_, err := WriteSpriteSheetWithOptions(path, width, height, frames, SpriteSheetOptions{})
	return err
}

// WriteSpriteSheetWithOptions writes a sprite sheet and returns the content
// rectangle of each frame for atlas metadata generation.
func WriteSpriteSheetWithOptions(path string, width, height int, frames [][]uint8, options SpriteSheetOptions) (SpriteSheetLayoutResult, error) {
	if len(frames) == 0 {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet needs at least one frame")
	}
	layout, err := CalculateSpriteSheetLayout(width, height, len(frames), options)
	if err != nil {
		return SpriteSheetLayoutResult{}, err
	}
	for _, pixels := range frames {
		if err := validateRGBA(width, height, pixels); err != nil {
			return SpriteSheetLayoutResult{}, err
		}
	}

	output := image.NewNRGBA(image.Rect(0, 0, layout.Width, layout.Height))
	scale := normalizedScaleOrDefault(options.Scale)
	for index, pixels := range frames {
		rect := layout.FrameRects[index]
		for y := 0; y < height; y++ {
			for x := 0; x < width; x++ {
				sourceOffset := (y*width + x) * 4
				outputOffsetX := rect.X + x*scale
				outputOffsetY := rect.Y + y*scale
				for scaledY := 0; scaledY < scale; scaledY++ {
					rowOffset := (outputOffsetY + scaledY) * output.Stride
					for scaledX := 0; scaledX < scale; scaledX++ {
						destinationOffset := rowOffset + (outputOffsetX+scaledX)*4
						copy(output.Pix[destinationOffset:destinationOffset+4], pixels[sourceOffset:sourceOffset+4])
					}
				}
			}
		}
	}
	if err := writeAtomically(path, "sprite sheet", func(file *os.File) error {
		return png.Encode(file, output)
	}); err != nil {
		return SpriteSheetLayoutResult{}, err
	}
	return layout, nil
}

// CalculateSpriteSheetLayout computes output dimensions and frame rectangles
// without allocating or writing image data.
func CalculateSpriteSheetLayout(width, height, frameCount int, options SpriteSheetOptions) (SpriteSheetLayoutResult, error) {
	if err := validateImageDimensions(width, height); err != nil {
		return SpriteSheetLayoutResult{}, err
	}
	if frameCount <= 0 {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet needs at least one frame")
	}
	if options.Columns < 0 {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet columns must be positive")
	}
	if options.BorderPadding < 0 {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet border padding must not be negative")
	}
	if options.ShapePadding < 0 {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet shape padding must not be negative")
	}
	scale, err := normalizedScale(options.Scale)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet %w", err)
	}
	layout := strings.ToLower(options.Layout)
	if layout == "" {
		layout = SpriteSheetLayoutHorizontal
	}
	if layout != SpriteSheetLayoutHorizontal && layout != SpriteSheetLayoutVertical && layout != SpriteSheetLayoutGrid {
		return SpriteSheetLayoutResult{}, fmt.Errorf("unsupported sprite sheet layout %q", options.Layout)
	}

	scaledWidth, err := scaledDimension(width, scale)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet %w", err)
	}
	scaledHeight, err := scaledDimension(height, scale)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet %w", err)
	}

	columns := frameCount
	rows := 1
	switch layout {
	case SpriteSheetLayoutVertical:
		columns = 1
		rows = frameCount
	case SpriteSheetLayoutGrid:
		columns = options.Columns
		if columns == 0 {
			columns = frameCount
		}
		if columns <= 0 {
			return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet columns must be positive")
		}
		rows = (frameCount-1)/columns + 1
	}

	shapeWidth, err := checkedMul(columns-1, options.ShapePadding)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet width overflows")
	}
	shapeHeight, err := checkedMul(rows-1, options.ShapePadding)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet height overflows")
	}
	contentWidth, err := checkedMul(columns, scaledWidth)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet width overflows")
	}
	contentWidth, err = checkedAdd(contentWidth, shapeWidth)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet width overflows")
	}
	contentHeight, err := checkedMul(rows, scaledHeight)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet height overflows")
	}
	contentHeight, err = checkedAdd(contentHeight, shapeHeight)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet height overflows")
	}
	borderWidth, err := checkedMul(options.BorderPadding, 2)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet width overflows")
	}
	borderHeight, err := checkedMul(options.BorderPadding, 2)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet height overflows")
	}
	outputWidth, err := checkedAdd(contentWidth, borderWidth)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet width overflows")
	}
	outputHeight, err := checkedAdd(contentHeight, borderHeight)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet height overflows")
	}
	if outputWidth <= 0 || outputHeight <= 0 || outputWidth > maxDimension || outputHeight > maxDimension {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet dimensions exceed %d pixels", maxDimension)
	}

	frameRects := make([]SpriteSheetFrameRect, frameCount)
	cellWidth, err := checkedAdd(scaledWidth, options.ShapePadding)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet width overflows")
	}
	cellHeight, err := checkedAdd(scaledHeight, options.ShapePadding)
	if err != nil {
		return SpriteSheetLayoutResult{}, fmt.Errorf("sprite sheet height overflows")
	}
	for index := range frameRects {
		column := index % columns
		row := index / columns
		frameRects[index] = SpriteSheetFrameRect{
			X:      options.BorderPadding + column*cellWidth,
			Y:      options.BorderPadding + row*cellHeight,
			Width:  scaledWidth,
			Height: scaledHeight,
		}
	}
	return SpriteSheetLayoutResult{Width: outputWidth, Height: outputHeight, FrameRects: frameRects}, nil
}

func writeAtomically(path, format string, encode func(*os.File) error) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create %s: %w", format, err)
	}
	temporaryPath := temporary.Name()
	removeTemporary := func() {
		_ = temporary.Close()
		_ = os.Remove(temporaryPath)
	}

	if err := encode(temporary); err != nil {
		removeTemporary()
		return fmt.Errorf("encode %s: %w", format, err)
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
		return fmt.Errorf("rename %s: %w", format, err)
	}
	return nil
}

func gifDelayCentiseconds(durationMS int) (int, error) {
	if durationMS <= 0 {
		return 0, fmt.Errorf("GIF duration must be positive")
	}

	delay := durationMS / 10
	if durationMS%10 >= 5 {
		delay++
	}
	if delay < 1 {
		delay = 1
	}
	if delay > maxGIFDelayCentiseconds {
		return 0, fmt.Errorf("GIF duration exceeds %d centiseconds", maxGIFDelayCentiseconds)
	}
	return delay, nil
}

func validateRGBA(width, height int, pixels []uint8) error {
	if width <= 0 || height <= 0 || width > maxDimension || height > maxDimension {
		return fmt.Errorf("image dimensions must be positive and within limits")
	}
	want, err := rgbaBufferSize(width, height)
	if err != nil {
		return err
	}
	if len(pixels) != want {
		return fmt.Errorf("invalid RGBA buffer: got %d bytes", len(pixels))
	}
	return nil
}

func validateImageDimensions(width, height int) error {
	if width <= 0 || height <= 0 {
		return fmt.Errorf("image dimensions must be positive")
	}
	if width > maxDimension || height > maxDimension {
		return fmt.Errorf("image dimensions exceed %d pixels", maxDimension)
	}
	return nil
}

func rgbaBufferSize(width, height int) (int, error) {
	pixelCount, err := checkedMul(width, height)
	if err != nil {
		return 0, fmt.Errorf("image dimensions overflow")
	}
	bufferSize, err := checkedMul(pixelCount, 4)
	if err != nil {
		return 0, fmt.Errorf("image dimensions overflow")
	}
	return bufferSize, nil
}

func normalizedScale(scale int) (int, error) {
	if scale == 0 {
		return 1, nil
	}
	if scale < 1 || scale > maxExportScale {
		return 0, fmt.Errorf("scale must be between 1 and %d", maxExportScale)
	}
	return scale, nil
}

func normalizedScaleOrDefault(scale int) int {
	if scale == 0 {
		return 1
	}
	return scale
}

func scaledDimension(value, scale int) (int, error) {
	if value <= 0 || scale <= 0 {
		return 0, fmt.Errorf("dimensions must be positive")
	}
	if value > maxDimension/scale {
		return 0, fmt.Errorf("dimensions exceed %d pixels after scaling", maxDimension)
	}
	return value * scale, nil
}

func checkedAdd(a, b int) (int, error) {
	if a < 0 || b < 0 {
		return 0, fmt.Errorf("integer underflow")
	}
	maxInt := int(^uint(0) >> 1)
	if a > maxInt-b {
		return 0, fmt.Errorf("integer overflow")
	}
	return a + b, nil
}

func checkedMul(a, b int) (int, error) {
	if a < 0 || b < 0 {
		return 0, fmt.Errorf("integer underflow")
	}
	if a == 0 || b == 0 {
		return 0, nil
	}
	maxInt := int(^uint(0) >> 1)
	if a > maxInt/b {
		return 0, fmt.Errorf("integer overflow")
	}
	return a * b, nil
}

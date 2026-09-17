package export

import (
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.png")
	pixels := []uint8{
		255, 0, 0, 255,
		0, 255, 0, 128,
	}
	if err := os.WriteFile(path, []byte("old output"), 0600); err != nil {
		t.Fatal(err)
	}

	if err := WriteFile(path, 2, 1, pixels); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	img, err := png.Decode(file)
	if err != nil {
		t.Fatal(err)
	}
	if got := img.Bounds().Dx(); got != 2 {
		t.Fatalf("decoded width = %d, want 2", got)
	}
	if got := img.Bounds().Dy(); got != 1 {
		t.Fatalf("decoded height = %d, want 1", got)
	}
	if got := color.NRGBAModel.Convert(img.At(0, 0)).(color.NRGBA); got != (color.NRGBA{R: 255, A: 255}) {
		t.Fatalf("first pixel = %#v, want opaque red", got)
	}
	if got := color.NRGBAModel.Convert(img.At(1, 0)).(color.NRGBA); got != (color.NRGBA{G: 255, A: 128}) {
		t.Fatalf("second pixel = %#v, want half-transparent green", got)
	}
}

func TestWriteFileRoundTripsFullPixelMatrix(t *testing.T) {
	path := filepath.Join(t.TempDir(), "matrix.png")
	pixels := []uint8{
		255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 0, 0,
		12, 34, 56, 64, 78, 90, 123, 192, 255, 255, 255, 255,
	}
	if err := WriteFile(path, 3, 2, pixels); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(file)
	_ = file.Close()
	if err != nil {
		t.Fatal(err)
	}

	assertDecodedNRGBAMatrix(t, decoded, []color.NRGBA{
		{R: 255, A: 255}, {G: 255, A: 128}, {},
		{R: 12, G: 34, B: 56, A: 64}, {R: 78, G: 90, B: 123, A: 192}, {R: 255, G: 255, B: 255, A: 255},
	})
}

func TestWriteGIFAndSpriteSheet(t *testing.T) {
	first := []uint8{255, 0, 0, 255}
	second := []uint8{0, 0, 255, 255}
	gifPath := filepath.Join(t.TempDir(), "animation.gif")
	if err := os.WriteFile(gifPath, []byte("old GIF"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := WriteGIF(gifPath, 1, 1, [][]uint8{first, second}, []int{100, 250}); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(gifPath)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	animation, err := gif.DecodeAll(file)
	if err != nil {
		t.Fatal(err)
	}
	if len(animation.Image) != 2 || animation.Delay[0] != 10 || animation.Delay[1] != 25 || animation.LoopCount != 0 {
		t.Fatalf("unexpected GIF: delays=%#v loopCount=%d", animation.Delay, animation.LoopCount)
	}
	sheetPath := filepath.Join(t.TempDir(), "sheet.png")
	if err := os.WriteFile(sheetPath, []byte("old sheet"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := WriteSpriteSheet(sheetPath, 1, 1, [][]uint8{first, second}); err != nil {
		t.Fatal(err)
	}
	sheet, err := os.Open(sheetPath)
	if err != nil {
		t.Fatal(err)
	}
	defer sheet.Close()
	image, err := png.Decode(sheet)
	if err != nil {
		t.Fatal(err)
	}
	if image.Bounds().Dx() != 2 || image.Bounds().Dy() != 1 {
		t.Fatal("unexpected sheet dimensions")
	}
	if got := color.NRGBAModel.Convert(image.At(0, 0)).(color.NRGBA); got != (color.NRGBA{R: 255, A: 255}) {
		t.Fatalf("sprite sheet first pixel = %#v, want opaque red", got)
	}
	if got := color.NRGBAModel.Convert(image.At(1, 0)).(color.NRGBA); got != (color.NRGBA{B: 255, A: 255}) {
		t.Fatalf("sprite sheet second pixel = %#v, want opaque blue", got)
	}
}

func TestWriteSpriteSheetRoundTripsFullPixelMatrixInFrameOrder(t *testing.T) {
	path := filepath.Join(t.TempDir(), "matrix-sheet.png")
	frames := [][]uint8{
		{
			255, 0, 0, 255, 0, 255, 0, 128,
			0, 0, 255, 64, 255, 255, 0, 0,
		},
		{
			10, 20, 30, 255, 40, 50, 60, 64,
			70, 80, 90, 192, 100, 110, 120, 0,
		},
		{
			200, 100, 50, 255, 150, 75, 25, 192,
			1, 2, 3, 128, 4, 5, 6, 0,
		},
	}
	if err := WriteSpriteSheet(path, 2, 2, frames); err != nil {
		t.Fatalf("WriteSpriteSheet() error = %v", err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(file)
	_ = file.Close()
	if err != nil {
		t.Fatal(err)
	}

	assertDecodedNRGBAMatrix(t, decoded, []color.NRGBA{
		{R: 255, A: 255}, {G: 255, A: 128}, {R: 10, G: 20, B: 30, A: 255}, {R: 40, G: 50, B: 60, A: 64}, {R: 200, G: 100, B: 50, A: 255}, {R: 150, G: 75, B: 25, A: 192},
		{B: 255, A: 64}, {R: 255, G: 255, A: 0}, {R: 70, G: 80, B: 90, A: 192}, {R: 100, G: 110, B: 120, A: 0}, {R: 1, G: 2, B: 3, A: 128}, {R: 4, G: 5, B: 6, A: 0},
	})
}

func TestWriteGIFPreservesTransparentPixelsAndRoundsDelay(t *testing.T) {
	path := filepath.Join(t.TempDir(), "transparent.gif")
	pixels := []uint8{
		255, 0, 0, 255,
		0, 255, 0, 0,
	}
	if err := WriteGIF(path, 2, 1, [][]uint8{pixels}, []int{17}); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	animation, err := gif.DecodeAll(file)
	if err != nil {
		t.Fatal(err)
	}
	if animation.Delay[0] != 2 {
		t.Fatalf("GIF delay = %d, want 2 centiseconds", animation.Delay[0])
	}
	if got := color.NRGBAModel.Convert(animation.Image[0].At(0, 0)).(color.NRGBA); got.A != 255 || got.R == 0 {
		t.Fatalf("opaque pixel = %#v, want opaque red", got)
	}
	if got := color.NRGBAModel.Convert(animation.Image[0].At(1, 0)).(color.NRGBA); got.A != 0 {
		t.Fatalf("transparent pixel = %#v, want alpha 0", got)
	}
}

func TestWriteGIFDisposesPreviousFrameBeforeTransparentPixels(t *testing.T) {
	path := filepath.Join(t.TempDir(), "disposal.gif")
	frames := [][]uint8{
		{
			255, 0, 0, 255,
			255, 0, 0, 255,
		},
		{
			0, 0, 255, 255,
			0, 0, 0, 0,
		},
		{
			0, 255, 0, 255,
			0, 0, 0, 0,
		},
	}
	if err := WriteGIF(path, 2, 1, frames, []int{100, 100, 100}); err != nil {
		t.Fatal(err)
	}

	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	animation, err := gif.DecodeAll(file)
	_ = file.Close()
	if err != nil {
		t.Fatal(err)
	}
	if len(animation.Disposal) != len(frames) {
		t.Fatalf("GIF disposal count = %d, want %d", len(animation.Disposal), len(frames))
	}
	for index, disposal := range animation.Disposal {
		if disposal != gif.DisposalBackground {
			t.Fatalf("GIF disposal[%d] = %d, want background disposal", index, disposal)
		}
	}

	got := composeGIFFrames(animation)
	want := [][]color.NRGBA{
		{{R: 255, A: 255}, {R: 255, A: 255}},
		{{B: 255, A: 255}, {}},
		{{G: 255, A: 255}, {}},
	}
	if len(got) != len(want) {
		t.Fatalf("composited frame count = %d, want %d", len(got), len(want))
	}
	for index := range want {
		if len(got[index]) != len(want[index]) {
			t.Fatalf("composited frame %d pixel count = %d, want %d", index, len(got[index]), len(want[index]))
		}
		for pixel := range want[index] {
			if got[index][pixel] != want[index][pixel] {
				t.Fatalf("composited frame %d pixel %d = %#v, want %#v", index, pixel, got[index][pixel], want[index][pixel])
			}
		}
	}
}

// composeGIFFrames applies GIF disposal methods to the decoded frame images,
// which are frame rectangles rather than already-composited screenshots.
func composeGIFFrames(animation *gif.GIF) [][]color.NRGBA {
	width, height := animation.Config.Width, animation.Config.Height
	background := color.NRGBA{}
	if palette, ok := animation.Config.ColorModel.(color.Palette); ok && int(animation.BackgroundIndex) < len(palette) {
		background = color.NRGBAModel.Convert(palette[animation.BackgroundIndex]).(color.NRGBA)
	}
	canvas := make([]color.NRGBA, width*height)
	for index := range canvas {
		canvas[index] = background
	}
	composited := make([][]color.NRGBA, 0, len(animation.Image))
	for index, frame := range animation.Image {
		previous := append([]color.NRGBA(nil), canvas...)
		bounds := frame.Bounds()
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			for x := bounds.Min.X; x < bounds.Max.X; x++ {
				pixel := color.NRGBAModel.Convert(frame.At(x, y)).(color.NRGBA)
				if pixel.A != 0 {
					canvas[y*width+x] = pixel
				}
			}
		}
		composited = append(composited, append([]color.NRGBA(nil), canvas...))

		disposal := byte(0)
		if index < len(animation.Disposal) {
			disposal = animation.Disposal[index]
		}
		switch disposal {
		case gif.DisposalBackground:
			for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
				for x := bounds.Min.X; x < bounds.Max.X; x++ {
					canvas[y*width+x] = background
				}
			}
		case gif.DisposalPrevious:
			copy(canvas, previous)
		}
	}
	return composited
}

func TestWriteGIFWithOptionsScalesAndSetsLoopCount(t *testing.T) {
	path := filepath.Join(t.TempDir(), "scaled.gif")
	pixels := []uint8{
		255, 0, 0, 255,
		0, 255, 0, 0,
	}
	if err := WriteGIFWithOptions(path, 2, 1, [][]uint8{pixels, pixels}, []int{100, 100}, GIFOptions{Scale: 2, LoopCount: 3}); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	animation, err := gif.DecodeAll(file)
	if err != nil {
		t.Fatal(err)
	}
	if animation.Image[0].Bounds().Dx() != 4 || animation.Image[0].Bounds().Dy() != 2 {
		t.Fatalf("scaled GIF bounds = %v, want 4x2", animation.Image[0].Bounds())
	}
	if animation.LoopCount != 3 {
		t.Fatalf("GIF loop count = %d, want 3", animation.LoopCount)
	}
	for _, point := range [][2]int{{0, 0}, {1, 0}, {0, 1}, {1, 1}} {
		if got := color.NRGBAModel.Convert(animation.Image[0].At(point[0], point[1])).(color.NRGBA); got.A != 255 || got.R == 0 {
			t.Fatalf("scaled red pixel at %v = %#v", point, got)
		}
	}
	for _, point := range [][2]int{{2, 0}, {3, 0}, {2, 1}, {3, 1}} {
		if got := color.NRGBAModel.Convert(animation.Image[0].At(point[0], point[1])).(color.NRGBA); got.A != 0 {
			t.Fatalf("scaled transparent pixel at %v = %#v", point, got)
		}
	}
}

func TestApplyPixelAspectRatioExpandsNearestNeighbor(t *testing.T) {
	pixels := []uint8{
		255, 0, 0, 255,
		0, 255, 0, 128,
	}
	width, height, expanded, err := ApplyPixelAspectRatio(2, 1, pixels, PixelAspectRatio{Width: 2, Height: 1})
	if err != nil {
		t.Fatal(err)
	}
	if width != 4 || height != 1 {
		t.Fatalf("expanded dimensions = %dx%d, want 4x1", width, height)
	}
	want := []uint8{
		255, 0, 0, 255, 255, 0, 0, 255,
		0, 255, 0, 128, 0, 255, 0, 128,
	}
	if string(expanded) != string(want) {
		t.Fatalf("expanded pixels = %v, want %v", expanded, want)
	}
}

func TestWriteFileWithOptionsAppliesPixelAspectRatio(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ratio.png")
	pixels := []uint8{255, 0, 0, 255, 0, 0, 255, 255}
	if err := WriteFileWithOptions(path, 2, 1, pixels, PNGOptions{
		ApplyPixelRatio:   true,
		PixelAspectWidth:  2,
		PixelAspectHeight: 1,
	}); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	output, err := png.Decode(file)
	if err != nil {
		t.Fatal(err)
	}
	if output.Bounds().Dx() != 4 || output.Bounds().Dy() != 1 {
		t.Fatalf("PNG bounds = %v, want 4x1", output.Bounds())
	}
}

func TestWriteGIFWithOptionsAppliesPixelAspectRatio(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ratio.gif")
	pixels := []uint8{255, 0, 0, 255}
	if err := WriteGIFWithOptions(path, 1, 1, [][]uint8{pixels}, []int{100}, GIFOptions{
		ApplyPixelRatio:   true,
		PixelAspectWidth:  1,
		PixelAspectHeight: 2,
	}); err != nil {
		t.Fatal(err)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	animation, err := gif.DecodeAll(file)
	if err != nil {
		t.Fatal(err)
	}
	if animation.Image[0].Bounds().Dx() != 1 || animation.Image[0].Bounds().Dy() != 2 {
		t.Fatalf("GIF bounds = %v, want 1x2", animation.Image[0].Bounds())
	}
}

func TestCalculateSpriteSheetLayoutAppliesPixelAspectRatio(t *testing.T) {
	layout, err := CalculateSpriteSheetLayout(2, 3, 2, SpriteSheetOptions{
		Layout:            SpriteSheetLayoutHorizontal,
		ApplyPixelRatio:   true,
		PixelAspectWidth:  2,
		PixelAspectHeight: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if layout.Width != 8 || layout.Height != 3 {
		t.Fatalf("layout dimensions = %dx%d, want 8x3", layout.Width, layout.Height)
	}
	if layout.FrameRects[0].Width != 4 || layout.FrameRects[0].Height != 3 {
		t.Fatalf("frame rect = %#v, want 4x3", layout.FrameRects[0])
	}
}

func TestWriteGIFWithOptionsRejectsInvalidScaleLoopAndOutputSize(t *testing.T) {
	valid := []uint8{1, 2, 3, 255}
	for _, test := range []struct {
		name    string
		width   int
		height  int
		options GIFOptions
	}{
		{name: "scale too small", width: 1, height: 1, options: GIFOptions{Scale: -1}},
		{name: "scale too large", width: 1, height: 1, options: GIFOptions{Scale: 9}},
		{name: "loop count too small", width: 1, height: 1, options: GIFOptions{LoopCount: -2}},
		{name: "loop count too large", width: 1, height: 1, options: GIFOptions{LoopCount: maxGIFLoopCount + 1}},
		{name: "scaled width too large", width: maxDimension, height: 1, options: GIFOptions{Scale: 2}},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "invalid.gif")
			if err := os.WriteFile(path, []byte("existing GIF"), 0600); err != nil {
				t.Fatal(err)
			}
			err := WriteGIFWithOptions(path, test.width, test.height, [][]uint8{valid}, []int{100}, test.options)
			if err == nil {
				t.Fatal("WriteGIFWithOptions() expected an error")
			}
			assertFileContents(t, path, []byte("existing GIF"))
		})
	}
}

func TestCalculateSpriteSheetLayout(t *testing.T) {
	for _, test := range []struct {
		name          string
		options       SpriteSheetOptions
		wantWidth     int
		wantHeight    int
		wantFrameRect []SpriteSheetFrameRect
	}{
		{
			name:       "horizontal",
			options:    SpriteSheetOptions{Layout: SpriteSheetLayoutHorizontal, BorderPadding: 2, ShapePadding: 1},
			wantWidth:  12,
			wantHeight: 7,
			wantFrameRect: []SpriteSheetFrameRect{
				{X: 2, Y: 2, Width: 2, Height: 3},
				{X: 5, Y: 2, Width: 2, Height: 3},
				{X: 8, Y: 2, Width: 2, Height: 3},
			},
		},
		{
			name:       "vertical",
			options:    SpriteSheetOptions{Layout: SpriteSheetLayoutVertical, BorderPadding: 2, ShapePadding: 1},
			wantWidth:  6,
			wantHeight: 15,
			wantFrameRect: []SpriteSheetFrameRect{
				{X: 2, Y: 2, Width: 2, Height: 3},
				{X: 2, Y: 6, Width: 2, Height: 3},
				{X: 2, Y: 10, Width: 2, Height: 3},
			},
		},
		{
			name:       "grid scaled",
			options:    SpriteSheetOptions{Layout: SpriteSheetLayoutGrid, Columns: 2, Scale: 2, BorderPadding: 1, ShapePadding: 1},
			wantWidth:  11,
			wantHeight: 15,
			wantFrameRect: []SpriteSheetFrameRect{
				{X: 1, Y: 1, Width: 4, Height: 6},
				{X: 6, Y: 1, Width: 4, Height: 6},
				{X: 1, Y: 8, Width: 4, Height: 6},
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			got, err := CalculateSpriteSheetLayout(2, 3, 3, test.options)
			if err != nil {
				t.Fatal(err)
			}
			if got.Width != test.wantWidth || got.Height != test.wantHeight {
				t.Fatalf("layout dimensions = %dx%d, want %dx%d", got.Width, got.Height, test.wantWidth, test.wantHeight)
			}
			if len(got.FrameRects) != len(test.wantFrameRect) {
				t.Fatalf("frame rect count = %d, want %d", len(got.FrameRects), len(test.wantFrameRect))
			}
			for index := range got.FrameRects {
				if got.FrameRects[index] != test.wantFrameRect[index] {
					t.Fatalf("frame rect %d = %#v, want %#v", index, got.FrameRects[index], test.wantFrameRect[index])
				}
			}
		})
	}
}

func TestWriteSpriteSheetWithOptionsPreservesPaddingAndReturnsRects(t *testing.T) {
	path := filepath.Join(t.TempDir(), "grid.png")
	frames := [][]uint8{
		{255, 0, 0, 255},
		{0, 255, 0, 255},
		{0, 0, 255, 0},
	}
	options := SpriteSheetOptions{Layout: SpriteSheetLayoutGrid, Columns: 2, Scale: 2, BorderPadding: 1, ShapePadding: 1}
	layout, err := WriteSpriteSheetWithOptions(path, 1, 1, frames, options)
	if err != nil {
		t.Fatal(err)
	}
	if layout.Width != 7 || layout.Height != 7 || len(layout.FrameRects) != 3 {
		t.Fatalf("layout = %#v, want 7x7 and 3 rects", layout)
	}
	file, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	output, err := png.Decode(file)
	if err != nil {
		t.Fatal(err)
	}
	if output.Bounds().Dx() != 7 || output.Bounds().Dy() != 7 {
		t.Fatalf("sheet bounds = %v, want 7x7", output.Bounds())
	}
	if got := color.NRGBAModel.Convert(output.At(1, 1)).(color.NRGBA); got.A != 255 || got.R == 0 {
		t.Fatalf("first frame pixel = %#v, want red", got)
	}
	if got := color.NRGBAModel.Convert(output.At(2, 2)).(color.NRGBA); got.A != 255 || got.R == 0 {
		t.Fatalf("scaled first frame pixel = %#v, want red", got)
	}
	if got := color.NRGBAModel.Convert(output.At(3, 1)).(color.NRGBA); got.A != 0 {
		t.Fatalf("shape padding pixel = %#v, want transparent", got)
	}
	if got := color.NRGBAModel.Convert(output.At(0, 0)).(color.NRGBA); got.A != 0 {
		t.Fatalf("border pixel = %#v, want transparent", got)
	}
	if got := color.NRGBAModel.Convert(output.At(1, 4)).(color.NRGBA); got.A != 0 {
		t.Fatalf("transparent frame pixel = %#v, want transparent", got)
	}
}

func TestCalculateSpriteSheetLayoutRejectsInvalidOptionsAndOutput(t *testing.T) {
	for _, test := range []struct {
		name    string
		width   int
		height  int
		frames  int
		options SpriteSheetOptions
	}{
		{name: "unknown layout", width: 1, height: 1, frames: 1, options: SpriteSheetOptions{Layout: "diagonal"}},
		{name: "negative columns", width: 1, height: 1, frames: 1, options: SpriteSheetOptions{Layout: SpriteSheetLayoutGrid, Columns: -1}},
		{name: "negative border", width: 1, height: 1, frames: 1, options: SpriteSheetOptions{BorderPadding: -1}},
		{name: "negative shape", width: 1, height: 1, frames: 1, options: SpriteSheetOptions{ShapePadding: -1}},
		{name: "invalid scale", width: 1, height: 1, frames: 1, options: SpriteSheetOptions{Scale: 9}},
		{name: "horizontal too wide", width: maxDimension, height: 1, frames: 2, options: SpriteSheetOptions{}},
		{name: "scaled too wide", width: maxDimension, height: 1, frames: 1, options: SpriteSheetOptions{Scale: 2}},
	} {
		t.Run(test.name, func(t *testing.T) {
			if _, err := CalculateSpriteSheetLayout(test.width, test.height, test.frames, test.options); err == nil {
				t.Fatal("CalculateSpriteSheetLayout() expected an error")
			}
		})
	}
}

func TestWriteFileRejectsInvalidBuffer(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.png")
	want := []byte("existing PNG")
	if err := os.WriteFile(path, want, 0600); err != nil {
		t.Fatal(err)
	}
	err := WriteFile(path, 2, 2, []uint8{0})
	if err == nil {
		t.Fatal("WriteFile() expected an error")
	}
	assertFileContents(t, path, want)
}

func TestWriteFileRejectsInvalidDimensions(t *testing.T) {
	for _, test := range []struct {
		name          string
		width, height int
	}{
		{name: "zero width", width: 0, height: 1},
		{name: "zero height", width: 1, height: 0},
		{name: "negative width", width: -1, height: 1},
		{name: "too wide", width: 16385, height: 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := WriteFile(filepath.Join(t.TempDir(), "invalid.png"), test.width, test.height, nil)
			if err == nil {
				t.Fatalf("WriteFile(%d, %d) expected an error", test.width, test.height)
			}
		})
	}
}

func TestWriteGIFRejectsInvalidInputs(t *testing.T) {
	valid := []uint8{1, 2, 3, 255}
	for _, test := range []struct {
		name      string
		width     int
		height    int
		frames    [][]uint8
		durations []int
	}{
		{name: "no frames", width: 1, height: 1},
		{name: "duration count mismatch", width: 1, height: 1, frames: [][]uint8{valid}},
		{name: "invalid pixel buffer", width: 1, height: 1, frames: [][]uint8{{0, 1, 2}}, durations: []int{100}},
		{name: "invalid dimensions", width: 0, height: 1, frames: [][]uint8{{}}, durations: []int{100}},
		{name: "dimensions exceed limit", width: 16385, height: 1, frames: [][]uint8{{}}, durations: []int{100}},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := WriteGIF(filepath.Join(t.TempDir(), "invalid.gif"), test.width, test.height, test.frames, test.durations)
			if err == nil {
				t.Fatal("WriteGIF() expected an error")
			}
		})
	}
}

func TestWriteGIFRejectsInvalidDurations(t *testing.T) {
	valid := []uint8{1, 2, 3, 255}
	path := filepath.Join(t.TempDir(), "invalid-duration.gif")
	for _, test := range []struct {
		name     string
		duration int
	}{
		{name: "zero", duration: 0},
		{name: "negative", duration: -1},
		{name: "rounded above uint16", duration: (maxGIFDelayCentiseconds*10 + 5)},
	} {
		t.Run(test.name, func(t *testing.T) {
			want := []byte("existing GIF")
			if err := os.WriteFile(path, want, 0600); err != nil {
				t.Fatal(err)
			}
			err := WriteGIF(path, 1, 1, [][]uint8{valid}, []int{test.duration})
			if err == nil {
				t.Fatal("WriteGIF() expected an error")
			}
			assertFileContents(t, path, want)
		})
	}
}

func TestWriteGIFFeelsCentisecondBoundaries(t *testing.T) {
	valid := []uint8{1, 2, 3, 255}
	for _, test := range []struct {
		name     string
		duration int
		want     int
	}{
		{name: "minimum positive", duration: 1, want: 1},
		{name: "round down", duration: maxGIFDelayCentiseconds*10 + 4, want: maxGIFDelayCentiseconds},
		{name: "maximum representable", duration: maxGIFDelayCentiseconds * 10, want: maxGIFDelayCentiseconds},
	} {
		t.Run(test.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "boundary.gif")
			if err := WriteGIF(path, 1, 1, [][]uint8{valid}, []int{test.duration}); err != nil {
				t.Fatal(err)
			}
			file, err := os.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			animation, err := gif.DecodeAll(file)
			_ = file.Close()
			if err != nil {
				t.Fatal(err)
			}
			if got := animation.Delay[0]; got != test.want {
				t.Fatalf("GIF delay = %d, want %d", got, test.want)
			}
		})
	}
}

func TestWriteSpriteSheetRejectsInvalidInputs(t *testing.T) {
	for _, test := range []struct {
		name   string
		width  int
		height int
		frames [][]uint8
	}{
		{name: "no frames", width: 1, height: 1},
		{name: "invalid pixel buffer", width: 1, height: 1, frames: [][]uint8{{0, 1, 2}}},
		{name: "invalid height", width: 1, height: 0, frames: [][]uint8{{}}},
		{name: "dimensions exceed limit", width: 16385, height: 1, frames: [][]uint8{{}}},
		{name: "zero width", width: 0, height: 1, frames: [][]uint8{{}}},
	} {
		t.Run(test.name, func(t *testing.T) {
			err := WriteSpriteSheet(filepath.Join(t.TempDir(), "invalid.png"), test.width, test.height, test.frames)
			if err == nil {
				t.Fatal("WriteSpriteSheet() expected an error")
			}
		})
	}
}

func TestWriteAtomicallyKeepsExistingTargetOnEncodeFailure(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "output.png")
	want := []byte("existing output")
	if err := os.WriteFile(path, want, 0600); err != nil {
		t.Fatal(err)
	}

	err := writeAtomically(path, "PNG", func(*os.File) error {
		return errors.New("test encoder failure")
	})
	if err == nil || !strings.HasPrefix(err.Error(), "encode PNG:") {
		t.Fatalf("writeAtomically() error = %v, want encode PNG prefix", err)
	}
	assertFileContents(t, path, want)
	assertNoTemporaryFiles(t, directory, path)
}

func TestWriteAtomicallyKeepsExistingTargetOnRenameFailure(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "output.png")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}

	err := WriteFile(path, 1, 1, []uint8{1, 2, 3, 255})
	if err == nil || !strings.HasPrefix(err.Error(), "rename PNG:") {
		t.Fatalf("WriteFile() error = %v, want rename PNG prefix", err)
	}
	if info, statErr := os.Stat(path); statErr != nil || !info.IsDir() {
		t.Fatalf("existing target changed: stat error=%v info=%v", statErr, info)
	}
	assertNoTemporaryFiles(t, directory, path)
}

func assertFileContents(t *testing.T, path string, want []byte) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(want) {
		t.Fatalf("file contents = %q, want %q", got, want)
	}
}

func assertDecodedNRGBAMatrix(t *testing.T, decoded image.Image, want []color.NRGBA) {
	t.Helper()
	bounds := decoded.Bounds()
	if got := bounds.Dx() * bounds.Dy(); got != len(want) {
		t.Fatalf("decoded pixel count = %d, want %d", got, len(want))
	}

	index := 0
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			got := color.NRGBAModel.Convert(decoded.At(x, y)).(color.NRGBA)
			if got != want[index] {
				t.Fatalf("decoded pixel (%d,%d) = %#v, want %#v", x, y, got, want[index])
			}
			index++
		}
	}
}

func assertNoTemporaryFiles(t *testing.T, directory, path string) {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(directory, "."+filepath.Base(path)+".tmp-*"))
	if err != nil {
		t.Fatal(err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary export files remain: %v", matches)
	}
}

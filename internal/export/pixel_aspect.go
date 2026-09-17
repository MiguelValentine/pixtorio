package export

import "fmt"

// PixelAspectRatio describes the physical width and height of one source pixel.
// Values are reduced before export so equivalent ratios produce the same image.
type PixelAspectRatio struct {
	Width  int `json:"width"`
	Height int `json:"height"`
}

// ApplyPixelAspectRatio expands each source pixel into a nearest-neighbor block.
func ApplyPixelAspectRatio(width, height int, pixels []uint8, ratio PixelAspectRatio) (int, int, []uint8, error) {
	if err := validateRGBA(width, height, pixels); err != nil {
		return 0, 0, nil, err
	}
	normalized, err := normalizePixelAspectRatio(ratio.Width, ratio.Height)
	if err != nil {
		return 0, 0, nil, err
	}
	return resizeRGBA(width, height, pixels, normalized.Width, normalized.Height)
}

func exportPixelRatio(apply bool, width, height int) (int, int, error) {
	if !apply {
		return 1, 1, nil
	}
	ratio, err := normalizePixelAspectRatio(width, height)
	if err != nil {
		return 0, 0, err
	}
	return ratio.Width, ratio.Height, nil
}

func applyRatioIfRequested(width, height int, pixels []uint8, apply bool, ratioWidth, ratioHeight int) (int, int, []uint8, error) {
	if !apply {
		return width, height, pixels, nil
	}
	return ApplyPixelAspectRatio(width, height, pixels, PixelAspectRatio{Width: ratioWidth, Height: ratioHeight})
}

func normalizePixelAspectRatio(width, height int) (PixelAspectRatio, error) {
	if width == 0 {
		width = 1
	}
	if height == 0 {
		height = 1
	}
	if width < 1 || height < 1 {
		return PixelAspectRatio{}, fmt.Errorf("pixel aspect ratio must be positive")
	}
	divisor := greatestCommonDivisor(width, height)
	return PixelAspectRatio{Width: width / divisor, Height: height / divisor}, nil
}

func resizeRGBA(width, height int, pixels []uint8, scaleX, scaleY int) (int, int, []uint8, error) {
	scaledWidth, err := scaledDimension(width, scaleX)
	if err != nil {
		return 0, 0, nil, err
	}
	scaledHeight, err := scaledDimension(height, scaleY)
	if err != nil {
		return 0, 0, nil, err
	}
	size, err := rgbaBufferSize(scaledWidth, scaledHeight)
	if err != nil {
		return 0, 0, nil, err
	}
	output := make([]uint8, size)
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			sourceOffset := (y*width + x) * 4
			for scaledY := 0; scaledY < scaleY; scaledY++ {
				rowOffset := ((y*scaleY+scaledY)*scaledWidth + x*scaleX) * 4
				for scaledX := 0; scaledX < scaleX; scaledX++ {
					copy(output[rowOffset+scaledX*4:rowOffset+scaledX*4+4], pixels[sourceOffset:sourceOffset+4])
				}
			}
		}
	}
	return scaledWidth, scaledHeight, output, nil
}

func greatestCommonDivisor(left, right int) int {
	for right != 0 {
		left, right = right, left%right
	}
	return left
}

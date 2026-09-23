package pixio

import (
	"image"
	"image/png"
	"math"
	"sort"
)

func renderThumbnail(document Document) ([]byte, error) {
	canvas := image.NewNRGBA(image.Rect(0, 0, document.Width, document.Height))
	cels := make(map[celReference]*Cel, len(document.Cels))
	for index := range document.Cels {
		cel := &document.Cels[index]
		cels[celReference{layerID: cel.LayerID, frameID: cel.FrameID}] = cel
	}
	composited := compositeThumbnailLayerChildren(document, document.ActiveFrameID, "", make(map[string]bool), cels)
	copy(canvas.Pix, composited.Pix)

	thumbnailWidth, thumbnailHeight := thumbnailDimensions(document.Width, document.Height)
	thumbnail := image.NewNRGBA(image.Rect(0, 0, thumbnailWidth, thumbnailHeight))
	for y := 0; y < thumbnailHeight; y++ {
		sourceY := y * document.Height / thumbnailHeight
		for x := 0; x < thumbnailWidth; x++ {
			sourceX := x * document.Width / thumbnailWidth
			sourceIndex := sourceY*canvas.Stride + sourceX*4
			targetIndex := y*thumbnail.Stride + x*4
			copy(thumbnail.Pix[targetIndex:targetIndex+4], canvas.Pix[sourceIndex:sourceIndex+4])
		}
	}

	var encoded limitedBuffer
	encoded.maximum = maxThumbnailBytes
	if err := png.Encode(&encoded, thumbnail); err != nil {
		return nil, err
	}
	return encoded.Bytes(), nil
}

func thumbnailDimensions(width, height int) (int, int) {
	if width <= maxThumbnailDimension && height <= maxThumbnailDimension {
		return width, height
	}
	scale := math.Min(float64(maxThumbnailDimension)/float64(width), float64(maxThumbnailDimension)/float64(height))
	thumbnailWidth := max(1, int(math.Round(float64(width)*scale)))
	thumbnailHeight := max(1, int(math.Round(float64(height)*scale)))
	return thumbnailWidth, thumbnailHeight
}

func compositeThumbnailLayerChildren(document Document, frameID, parentID string, visiting map[string]bool, cels map[celReference]*Cel) *image.NRGBA {
	output := image.NewNRGBA(image.Rect(0, 0, document.Width, document.Height))
	type orderedLayer struct {
		layer Layer
		index int
		z     int
	}
	layers := make([]orderedLayer, 0)
	for _, layer := range document.Layers {
		if layer.ParentID != parentID {
			continue
		}
		z := 0
		if cel := cels[celReference{layerID: layer.ID, frameID: frameID}]; cel != nil && layer.Kind != LayerKindGroup && layer.Role != LayerRoleBackground {
			z = cel.ZIndex
		}
		layers = append(layers, orderedLayer{layer, len(layers), z})
	}
	sort.SliceStable(layers, func(i, j int) bool {
		a, b := layers[i], layers[j]
		if a.layer.Role == LayerRoleBackground || b.layer.Role == LayerRoleBackground {
			return a.layer.Role == LayerRoleBackground && b.layer.Role != LayerRoleBackground
		}
		if a.index+a.z != b.index+b.z {
			return a.index+a.z < b.index+b.z
		}
		if a.z != b.z {
			return a.z < b.z
		}
		return a.index < b.index
	})
	for _, entry := range layers {
		layer := entry.layer
		if layer.ParentID != parentID || layer.Role == LayerRoleReference || !layer.Visible || layer.Opacity <= 0 {
			continue
		}
		if layer.Kind == LayerKindGroup {
			if visiting[layer.ID] {
				continue
			}
			visiting[layer.ID] = true
			group := compositeThumbnailLayerChildren(document, frameID, layer.ID, visiting, cels)
			delete(visiting, layer.ID)
			compositeThumbnailBuffer(output, group, layer.Opacity, layer.BlendMode)
			continue
		}
		cel := cels[celReference{layerID: layer.ID, frameID: frameID}]
		if cel != nil {
			compositeThumbnailCelWithMode(output, *cel, layer.Opacity, layer.BlendMode)
		}
	}
	return output
}

func compositeThumbnailCel(canvas *image.NRGBA, cel Cel, opacity float64) {
	compositeThumbnailCelWithMode(canvas, cel, opacity, BlendModeNormal)
}

func compositeThumbnailCelWithMode(canvas *image.NRGBA, cel Cel, opacity float64, blendMode BlendMode) {
	layerOpacity := math.Max(0, math.Min(1, opacity*cel.Opacity))
	// Clip before adding the arbitrary integer offset to avoid overflow for a
	// valid but far-outside Cel position.
	if cel.X >= canvas.Rect.Dx() || cel.X < -cel.Width || cel.Y >= canvas.Rect.Dy() || cel.Y < -cel.Height {
		return
	}
	celXStart, celXEnd := 0, cel.Width
	if cel.X < 0 {
		celXStart = -cel.X
	}
	if cel.X+celXEnd > canvas.Rect.Dx() {
		celXEnd = canvas.Rect.Dx() - cel.X
	}
	celYStart, celYEnd := 0, cel.Height
	if cel.Y < 0 {
		celYStart = -cel.Y
	}
	if cel.Y+celYEnd > canvas.Rect.Dy() {
		celYEnd = canvas.Rect.Dy() - cel.Y
	}
	for celY := celYStart; celY < celYEnd; celY++ {
		canvasY := cel.Y + celY
		for celX := celXStart; celX < celXEnd; celX++ {
			canvasX := cel.X + celX
			sourceIndex := (celY*cel.Width + celX) * 4
			targetIndex := canvasY*canvas.Stride + canvasX*4
			blendThumbnailPixelWithMode(canvas.Pix, targetIndex, cel.Pixels, sourceIndex, layerOpacity, blendMode)
		}
	}
}

func blendThumbnailPixel(target []byte, targetIndex int, source []byte, sourceIndex int, opacity float64) {
	blendThumbnailPixelWithMode(target, targetIndex, source, sourceIndex, opacity, BlendModeNormal)
}

func compositeThumbnailBuffer(target, source *image.NRGBA, opacity float64, blendMode BlendMode) {
	for offset := 0; offset < len(target.Pix) && offset < len(source.Pix); offset += 4 {
		blendThumbnailPixelWithMode(target.Pix, offset, source.Pix, offset, opacity, blendMode)
	}
}

func blendThumbnailPixelWithMode(target []byte, targetIndex int, source []byte, sourceIndex int, opacity float64, blendMode BlendMode) {
	sourceAlpha := (float64(source[sourceIndex+3]) / 255) * opacity
	if sourceAlpha <= 0 {
		return
	}
	targetAlpha := float64(target[targetIndex+3]) / 255
	outputAlpha := sourceAlpha + targetAlpha*(1-sourceAlpha)
	backdrop := [3]float64{float64(target[targetIndex]) / 255, float64(target[targetIndex+1]) / 255, float64(target[targetIndex+2]) / 255}
	sourceColor := [3]float64{float64(source[sourceIndex]) / 255, float64(source[sourceIndex+1]) / 255, float64(source[sourceIndex+2]) / 255}
	blendedColor, nonSeparable := blendThumbnailNonSeparable(backdrop, sourceColor, blendMode)
	for channel := 0; channel < 3; channel++ {
		sourceValue := sourceColor[channel]
		targetValue := backdrop[channel]
		blended := blendThumbnailChannel(targetValue, sourceValue, blendMode)
		if nonSeparable {
			blended = blendedColor[channel]
		}
		value := sourceValue*sourceAlpha*(1-targetAlpha) + targetValue*targetAlpha*(1-sourceAlpha) + blended*sourceAlpha*targetAlpha
		target[targetIndex+channel] = uint8(math.Round(255 * value / outputAlpha))
	}
	target[targetIndex+3] = uint8(math.Round(outputAlpha * 255))
}

func blendThumbnailNonSeparable(backdrop, source [3]float64, mode BlendMode) ([3]float64, bool) {
	switch mode {
	case BlendModeHue:
		return setBlendLuminosity(setBlendSaturation(source, blendSaturation(backdrop)), blendLuminosity(backdrop)), true
	case BlendModeSaturation:
		return setBlendLuminosity(setBlendSaturation(backdrop, blendSaturation(source)), blendLuminosity(backdrop)), true
	case BlendModeColor:
		return setBlendLuminosity(source, blendLuminosity(backdrop)), true
	case BlendModeLuminosity:
		return setBlendLuminosity(backdrop, blendLuminosity(source)), true
	default:
		return [3]float64{}, false
	}
}

func blendLuminosity(color [3]float64) float64 {
	return 0.3*color[0] + 0.59*color[1] + 0.11*color[2]
}

func blendSaturation(color [3]float64) float64 {
	return math.Max(color[0], math.Max(color[1], color[2])) - math.Min(color[0], math.Min(color[1], color[2]))
}

func setBlendLuminosity(color [3]float64, target float64) [3]float64 {
	delta := target - blendLuminosity(color)
	return clipBlendColor([3]float64{color[0] + delta, color[1] + delta, color[2] + delta})
}

func clipBlendColor(color [3]float64) [3]float64 {
	lightness := blendLuminosity(color)
	minimum := math.Min(color[0], math.Min(color[1], color[2]))
	maximum := math.Max(color[0], math.Max(color[1], color[2]))
	if minimum < 0 {
		for index, component := range color {
			color[index] = lightness + ((component-lightness)*lightness)/(lightness-minimum)
		}
	}
	if maximum > 1 {
		for index, component := range color {
			color[index] = lightness + ((component-lightness)*(1-lightness))/(maximum-lightness)
		}
	}
	for index, component := range color {
		color[index] = math.Max(0, math.Min(1, component))
	}
	return color
}

func setBlendSaturation(color [3]float64, target float64) [3]float64 {
	order := [3]int{0, 1, 2}
	for left := 0; left < len(order)-1; left++ {
		for right := left + 1; right < len(order); right++ {
			if color[order[left]] > color[order[right]] {
				order[left], order[right] = order[right], order[left]
			}
		}
	}
	minimum, middle, maximum := order[0], order[1], order[2]
	result := [3]float64{}
	if color[maximum] > color[minimum] {
		result[middle] = ((color[middle] - color[minimum]) * target) / (color[maximum] - color[minimum])
		result[maximum] = target
	}
	return result
}

func blendThumbnailChannel(backdrop, source float64, mode BlendMode) float64 {
	switch mode {
	case BlendModeDarken:
		return math.Min(backdrop, source)
	case BlendModeMultiply:
		return backdrop * source
	case BlendModeColorBurn:
		if source <= 0 {
			return 0
		}
		return 1 - math.Min(1, (1-backdrop)/source)
	case BlendModeLighten:
		return math.Max(backdrop, source)
	case BlendModeScreen:
		return backdrop + source - backdrop*source
	case BlendModeColorDodge:
		if source >= 1 {
			return 1
		}
		return math.Min(1, backdrop/(1-source))
	case BlendModeOverlay:
		if backdrop <= 0.5 {
			return 2 * backdrop * source
		}
		return 1 - 2*(1-backdrop)*(1-source)
	case BlendModeSoftLight:
		if source <= 0.5 {
			return backdrop - (1-2*source)*backdrop*(1-backdrop)
		}
		curve := math.Sqrt(backdrop)
		if backdrop <= 0.25 {
			curve = ((16*backdrop-12)*backdrop + 4) * backdrop
		}
		return backdrop + (2*source-1)*(curve-backdrop)
	case BlendModeHardLight:
		if source <= 0.5 {
			return 2 * backdrop * source
		}
		return 1 - 2*(1-backdrop)*(1-source)
	case BlendModeDifference:
		return math.Abs(backdrop - source)
	case BlendModeExclusion:
		return backdrop + source - 2*backdrop*source
	case BlendModeAddition:
		return math.Min(1, backdrop+source)
	case BlendModeSubtract:
		return math.Max(0, backdrop-source)
	case BlendModeDivide:
		if source <= 0 {
			return 1
		}
		return math.Min(1, backdrop/source)
	default:
		return source
	}
}

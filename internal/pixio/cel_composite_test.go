package pixio

import (
	"image/color"
	"testing"
)

func TestCelAppearanceComposite(t *testing.T) {
	document := Document{Width: 1, Height: 1, Layers: []Layer{
		{ID: "bottom", Kind: LayerKindImage, Role: LayerRoleStandard, Visible: true, Opacity: 1, BlendMode: BlendModeNormal},
		{ID: "top", Kind: LayerKindImage, Role: LayerRoleStandard, Visible: true, Opacity: 0.5, BlendMode: BlendModeNormal},
	}}
	bottom := &Cel{Width: 1, Height: 1, Opacity: 1, Pixels: []byte{255, 0, 0, 255}}
	top := &Cel{Width: 1, Height: 1, Opacity: 0.5, Pixels: []byte{0, 0, 255, 255}}
	cels := map[celReference]*Cel{{layerID: "bottom", frameID: "f"}: bottom, {layerID: "top", frameID: "f"}: top}
	check := func(want color.NRGBA) {
		t.Helper()
		got := compositeThumbnailLayerChildren(document, "f", "", make(map[string]bool), cels).NRGBAAt(0, 0)
		if got != want {
			t.Fatalf("composite = %v, want %v", got, want)
		}
	}
	check(color.NRGBA{191, 0, 64, 255})
	bottom.ZIndex = 1
	check(color.NRGBA{255, 0, 0, 255})
	bottom.ZIndex = 0
	top.ZIndex = -1
	check(color.NRGBA{255, 0, 0, 255})
	top.ZIndex = 0
	top.Opacity = 0
	check(color.NRGBA{255, 0, 0, 255})
	// An inner cel cannot escape the isolated group even with a negative index.
	top.Opacity = 0.5
	top.ZIndex = -100
	document.Layers[1].Opacity = 1
	document.Layers[1].ParentID = "group"
	document.Layers = append(document.Layers, Layer{ID: "group", Kind: LayerKindGroup, Role: LayerRoleStandard, Visible: true, Opacity: 0.5, BlendMode: BlendModeNormal})
	check(color.NRGBA{191, 0, 64, 255})
}

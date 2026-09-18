import {useCallback, useLayoutEffect, useState, type CSSProperties} from "react";

export type MenuRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type MenuViewport = {
  width: number;
  height: number;
};

export type MenuPlacementKind = "main" | "submenu";

export type MenuPlacement = {
  left: number;
  top: number;
  maxWidth: number;
  maxHeight: number;
  widthConstrained: boolean;
  scrollable: boolean;
  horizontal: "start" | "right" | "left";
  vertical: "below" | "above" | "clamped";
};

type MenuElementRef = {
  current: HTMLElement | null;
};

type MenuPositionOptions = {
  open: boolean;
  anchorRef: MenuElementRef;
  menuRef: MenuElementRef;
  uiScalePercent: number;
  kind: MenuPlacementKind;
  viewportPadding?: number;
  gap?: number;
};

const DEFAULT_VIEWPORT_PADDING = 8;
const DEFAULT_GAP = 6;

function normalizedScale(uiScalePercent: number) {
  return Math.max(0.01, uiScalePercent / 100);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function rectOf(element: HTMLElement): MenuRect {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function borderHeight(element: HTMLElement) {
  const computed = getComputedStyle(element);
  const parsePixels = (value: string) => Number.parseFloat(value) || 0;
  return parsePixels(computed.borderTopWidth) + parsePixels(computed.borderBottomWidth);
}

function naturalMenuRect(element: HTMLElement, uiScalePercent: number): MenuRect {
  const rect = rectOf(element);
  const naturalHeight = (element.scrollHeight + borderHeight(element)) * normalizedScale(uiScalePercent);
  return {...rect, height: Math.max(rect.height, naturalHeight)};
}

export function constrainMenuPlacement({
  anchor,
  menu,
  viewport,
  uiScalePercent,
  kind,
  viewportPadding = DEFAULT_VIEWPORT_PADDING,
  gap = DEFAULT_GAP,
}: {
  anchor: MenuRect;
  menu: Pick<MenuRect, "width" | "height">;
  viewport: MenuViewport;
  uiScalePercent: number;
  kind: MenuPlacementKind;
  viewportPadding?: number;
  gap?: number;
}): MenuPlacement {
  const scale = normalizedScale(uiScalePercent);
  const padding = Math.max(0, viewportPadding) * scale;
  const spacing = Math.max(0, gap) * scale;
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);
  const width = Math.min(Math.max(1, menu.width), availableWidth);
  const widthConstrained = menu.width > availableWidth + 0.5;

  if (kind === "main") {
    const belowSpace = Math.max(1, viewport.height - padding - (anchor.bottom + spacing));
    const aboveSpace = Math.max(1, anchor.top - spacing - padding);
    const fitsBelow = menu.height <= belowSpace;
    const fitsAbove = menu.height <= aboveSpace;
    const useAbove = !fitsBelow && (fitsAbove || aboveSpace > belowSpace);
    const availableMenuHeight = useAbove ? aboveSpace : belowSpace;
    const height = Math.min(Math.max(1, menu.height), availableMenuHeight, availableHeight);
    const preferredTop = useAbove
      ? anchor.top - spacing - height
      : anchor.bottom + spacing;
    const top = clamp(preferredTop, padding, Math.max(padding, viewport.height - padding - height));
    const left = clamp(anchor.left, padding, Math.max(padding, viewport.width - padding - width));

    return {
      left,
      top,
      maxWidth: availableWidth,
      maxHeight: height,
      widthConstrained,
      scrollable: menu.height > height + 0.5,
      horizontal: "start",
      vertical: useAbove ? "above" : "below",
    };
  }

  const rightSpace = Math.max(1, viewport.width - padding - (anchor.right + spacing));
  const leftSpace = Math.max(1, anchor.left - spacing - padding);
  const fitsRight = width <= rightSpace;
  const fitsLeft = width <= leftSpace;
  const useLeft = !fitsRight && (fitsLeft || leftSpace > rightSpace);
  const preferredLeft = useLeft
    ? anchor.left - spacing - width
    : anchor.right + spacing;
  const left = clamp(preferredLeft, padding, Math.max(padding, viewport.width - padding - width));
  const height = Math.min(Math.max(1, menu.height), availableHeight);
  const preferredTop = anchor.top - spacing;
  const top = clamp(preferredTop, padding, Math.max(padding, viewport.height - padding - height));

  return {
    left,
    top,
    maxWidth: availableWidth,
    maxHeight: height,
    widthConstrained,
    scrollable: menu.height > height + 0.5,
    horizontal: useLeft ? "left" : "right",
    vertical: "clamped",
  };
}

export function toZoomedMenuStyleValues(placement: MenuPlacement, uiScalePercent: number) {
  const scale = normalizedScale(uiScalePercent);
  return {
    left: `${placement.left / scale}px`,
    top: `${placement.top / scale}px`,
    maxWidth: `${placement.maxWidth / scale}px`,
    maxHeight: `${placement.maxHeight / scale}px`,
  };
}

function currentViewport(): MenuViewport {
  if (typeof window === "undefined") return {width: 1, height: 1};
  const visualViewport = window.visualViewport;
  return {
    width: Math.max(1, visualViewport?.width ?? window.innerWidth),
    height: Math.max(1, visualViewport?.height ?? window.innerHeight),
  };
}

function scrollParentsOf(element: HTMLElement) {
  const parents: HTMLElement[] = [];
  let parent = element.parentElement;
  while (parent) {
    const computed = getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(`${computed.overflowX} ${computed.overflowY}`)) parents.push(parent);
    parent = parent.parentElement;
  }
  return parents;
}

function samePositionStyle(left: string, top: string, maxWidth: string, maxHeight: string, previous: CSSProperties) {
  return previous.left === left
    && previous.top === top
    && previous.maxWidth === maxWidth
    && previous.maxHeight === maxHeight;
}

export function useConstrainedMenuStyle({
  open,
  anchorRef,
  menuRef,
  uiScalePercent,
  kind,
  viewportPadding = DEFAULT_VIEWPORT_PADDING,
  gap = DEFAULT_GAP,
}: MenuPositionOptions): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  const measure = useCallback(() => {
    if (!open) {
      setStyle({});
      return;
    }
    const anchorElement = anchorRef.current;
    const menuElement = menuRef.current;
    if (!anchorElement || !menuElement) return;

    const placement = constrainMenuPlacement({
      anchor: rectOf(anchorElement),
      menu: naturalMenuRect(menuElement, uiScalePercent),
      viewport: currentViewport(),
      uiScalePercent,
      kind,
      viewportPadding,
      gap,
    });
    const coordinates = toZoomedMenuStyleValues(placement, uiScalePercent);
    setStyle((previous) => {
      if (samePositionStyle(coordinates.left, coordinates.top, coordinates.maxWidth, coordinates.maxHeight, previous)
        && previous.overflowY === "auto"
        && previous.visibility === "visible"
        && previous.minWidth === (placement.widthConstrained ? "0px" : undefined)) {
        return previous;
      }
      return {
        position: "fixed",
        pointerEvents: "auto",
        zIndex: kind === "submenu" ? 21 : 20,
        ...coordinates,
        minWidth: placement.widthConstrained ? "0px" : undefined,
        overflowY: "auto",
        visibility: "visible",
      };
    });
  }, [anchorRef, gap, kind, menuRef, open, uiScalePercent, viewportPadding]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle({});
      return;
    }

    measure();
    let frame: number | null = null;
    const scheduleMeasure = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    };
    const visualViewport = window.visualViewport;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);
    const scrollParents = anchorRef.current ? scrollParentsOf(anchorRef.current) : [];
    if (observer) {
      if (anchorRef.current) observer.observe(anchorRef.current);
      if (menuRef.current) observer.observe(menuRef.current);
    }
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, true);
    scrollParents.forEach((parent) => parent.addEventListener("scroll", scheduleMeasure, {passive: true}));
    visualViewport?.addEventListener("resize", scheduleMeasure);
    visualViewport?.addEventListener("scroll", scheduleMeasure);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure, true);
      scrollParents.forEach((parent) => parent.removeEventListener("scroll", scheduleMeasure));
      visualViewport?.removeEventListener("resize", scheduleMeasure);
      visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [anchorRef, measure, menuRef, open]);

  if (!open) return {};
  return {
    position: "fixed",
    visibility: style.visibility === "visible" ? "visible" : "hidden",
    ...style,
  };
}

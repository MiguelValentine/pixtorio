
export function normalizePanelDimensionInput(rawValue: string, currentValue: number, minimum: number, maximum: number) {
  if (rawValue.trim() === "") return currentValue;
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return currentValue;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

export function calculatePanelResizeValue(startValue: number, startClient: number, currentClient: number, uiScalePercent: number, minimum: number, maximum: number) {
  const uiScale = Math.max(0.01, uiScalePercent / 100);
  const delta = (startClient - currentClient) / uiScale;
  return Math.max(minimum, Math.min(maximum, Math.round(startValue + delta)));
}

export type TimelineScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function getTimelineScrollTopForPeer(source: TimelineScrollMetrics, target: TimelineScrollMetrics) {
  const targetMax = Math.max(0, target.scrollHeight - target.clientHeight);
  return Math.max(0, Math.min(targetMax, source.scrollTop));
}

export function syncTimelineScrollPositions(source: TimelineScrollMetrics, target: TimelineScrollMetrics) {
  const scrollTop = getTimelineScrollTopForPeer(source, target);
  source.scrollTop = scrollTop;
  target.scrollTop = scrollTop;
  return scrollTop;
}

export function getTimelineHorizontalScrollbarHeight(surface: {offsetHeight: number; clientHeight: number}) {
  return Math.max(0, surface.offsetHeight - surface.clientHeight);
}

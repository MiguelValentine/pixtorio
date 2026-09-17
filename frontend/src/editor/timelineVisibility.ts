export interface TimelineStructure {
  tabID: string;
  layers: number;
  frames: number;
}

export function timelineStructure(tabID: string, layers: number, frames: number): TimelineStructure {
  return {tabID, layers, frames};
}

export function shouldAutoShowTimeline(
  previous: TimelineStructure,
  current: TimelineStructure,
  enabled: boolean,
): boolean {
  if (!enabled || previous.tabID !== current.tabID) return false;
  return current.layers > previous.layers || current.frames > previous.frames;
}

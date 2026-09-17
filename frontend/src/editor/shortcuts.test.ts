import {describe, expect, it} from "vitest";
import {assignCommandShortcut, commandForShortcutEvent, commandShortcutIDs, defaultCommandShortcuts, documentOptionalCommandIDs, formatShortcutForPlatform, normalizeShortcut, shortcutFromEvent} from "./shortcuts";

describe("command shortcuts", () => {
  it("normalizes modifier order and platform command keys", () => {
    expect(normalizeShortcut("shift+cmd+s")).toBe("Ctrl+Shift+S");
    expect(shortcutFromEvent({key: "s", metaKey: true, shiftKey: true})).toBe("Ctrl+Shift+S");
    expect(commandForShortcutEvent({key: "z", ctrlKey: true}, defaultCommandShortcuts)).toBe("undo");
  });

  it("removes conflicts when assigning a command", () => {
    const next = assignCommandShortcut(defaultCommandShortcuts, "redo", "Ctrl+Z");
    expect(next.redo).toBe("Ctrl+Z");
    expect(next.undo).toBe("");
  });

  it("keeps the complete command registry and unique default shortcuts", () => {
    expect(Object.keys(defaultCommandShortcuts).sort()).toEqual([...commandShortcutIDs].sort());
    const assigned = commandShortcutIDs
      .map((command) => normalizeShortcut(defaultCommandShortcuts[command]))
      .filter(Boolean);
    expect(new Set(assigned).size).toBe(assigned.length);
    expect(documentOptionalCommandIDs.has("openPreferences")).toBe(true);
    expect(defaultCommandShortcuts.toggleCanvasOnly).toBe("Tab");
    expect(defaultCommandShortcuts.toggleFullscreen).toBe("F11");
    expect(documentOptionalCommandIDs.has("showAllPanels")).toBe(true);
    expect(documentOptionalCommandIDs.has("save")).toBe(false);
    expect(defaultCommandShortcuts.newEmptyFrame).toBe("Alt+Shift+N");
    expect(defaultCommandShortcuts.previousFrame).toBe(",");
    expect(defaultCommandShortcuts.nextFrame).toBe(".");
    expect(defaultCommandShortcuts.duplicateSprite).toBe("Ctrl+Alt+D");
    expect(defaultCommandShortcuts.copySelectedFramesToDocument).toBe("Ctrl+Alt+Shift+J");
    expect(defaultCommandShortcuts.copySelectedLayersToDocument).toBe("Ctrl+Alt+Shift+K");
  });

  it("formats normalized modifiers for the current platform", () => {
    expect(formatShortcutForPlatform("shift+cmd+s", "MacIntel")).toBe("Cmd+Shift+S");
    expect(formatShortcutForPlatform("shift+cmd+s", "Win32")).toBe("Ctrl+Shift+S");
    expect(commandForShortcutEvent({key: "]", ctrlKey: true, altKey: true}, defaultCommandShortcuts)).toBe("growSelection");
    expect(commandForShortcutEvent({key: "Tab"}, defaultCommandShortcuts)).toBe("toggleCanvasOnly");
    expect(commandForShortcutEvent({key: ","}, defaultCommandShortcuts)).toBe("previousFrame");
    expect(commandForShortcutEvent({key: "."}, defaultCommandShortcuts)).toBe("nextFrame");
  });
});

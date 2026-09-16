import {describe, expect, it} from "vitest";
import {assignCommandShortcut, commandForShortcutEvent, defaultCommandShortcuts, normalizeShortcut, shortcutFromEvent} from "./shortcuts";

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
});

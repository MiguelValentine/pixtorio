export type CommandShortcutID = "new" | "open" | "save" | "saveAs" | "undo" | "redo" | "selectAll" | "deselect" | "copy" | "cut" | "paste" | "delete";

export const defaultCommandShortcuts: Record<CommandShortcutID, string> = {
  new: "Ctrl+N",
  open: "Ctrl+O",
  save: "Ctrl+S",
  saveAs: "Ctrl+Shift+S",
  undo: "Ctrl+Z",
  redo: "Ctrl+Shift+Z",
  selectAll: "Ctrl+A",
  deselect: "Ctrl+D",
  copy: "Ctrl+C",
  cut: "Ctrl+X",
  paste: "Ctrl+V",
  delete: "Delete",
};

export interface ShortcutEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function shortcutFromEvent(event: ShortcutEventLike) {
  const raw = event.key.length === 1 ? event.key.toUpperCase() : normalizeKeyName(event.key);
  if (["Control", "Shift", "Alt", "Meta"].includes(raw)) return "";
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(raw);
  return parts.join("+");
}

export function normalizeShortcut(value: string) {
  const tokens = value.split("+").map((token) => token.trim()).filter(Boolean);
  const modifiers = new Set(tokens.slice(0, -1).map((token) => token.toLowerCase()));
  const key = normalizeKeyName(tokens.at(-1) ?? "");
  if (!key) return "";
  const result: string[] = [];
  if (modifiers.has("ctrl") || modifiers.has("control") || modifiers.has("cmd") || modifiers.has("meta")) result.push("Ctrl");
  if (modifiers.has("alt") || modifiers.has("option")) result.push("Alt");
  if (modifiers.has("shift")) result.push("Shift");
  result.push(key.length === 1 ? key.toUpperCase() : key);
  return result.join("+");
}

export function commandForShortcutEvent(event: ShortcutEventLike, assignments: Readonly<Record<CommandShortcutID, string>>) {
  const shortcut = shortcutFromEvent(event);
  return (Object.keys(assignments) as CommandShortcutID[]).find((command) => normalizeShortcut(assignments[command]) === shortcut) ?? null;
}

export function assignCommandShortcut(assignments: Readonly<Record<CommandShortcutID, string>>, command: CommandShortcutID, shortcut: string) {
  const normalized = normalizeShortcut(shortcut);
  const next = {...assignments, [command]: normalized};
  for (const candidate of Object.keys(next) as CommandShortcutID[]) {
    if (candidate !== command && normalized && next[candidate] === normalized) next[candidate] = "";
  }
  return next;
}

function normalizeKeyName(key: string) {
  const aliases: Record<string, string> = {" ": "Space", escape: "Escape", esc: "Escape", del: "Delete", delete: "Delete", backspace: "Backspace", enter: "Enter", tab: "Tab"};
  return aliases[key.toLowerCase()] ?? (key.length === 1 ? key.toUpperCase() : key);
}

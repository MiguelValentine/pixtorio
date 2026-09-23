import {useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent} from "react";
import {assignCommandShortcut, defaultCommandShortcuts, normalizeShortcut, shortcutFromEvent, type CommandShortcutID} from "../editor/shortcuts";
import {toolShortcuts, type ToolID} from "../editor/tools";
import {tools} from "./toolDefinitions";

type ToolShortcutAssignments = Record<ToolID, string>;

function defaultToolShortcutAssignments(): ToolShortcutAssignments {
  const assignments = Object.fromEntries(tools.map(({id}) => [id, ""])) as ToolShortcutAssignments;
  for (const [key, tool] of Object.entries(toolShortcuts)) assignments[tool] = key;
  return assignments;
}

function storedToolShortcutAssignments(): ToolShortcutAssignments {
  const fallback = defaultToolShortcutAssignments();
  try {
    const parsed = JSON.parse(localStorage.getItem("pixtorio-tool-shortcuts") ?? "null") as Record<string, unknown> | null;
    if (!parsed) return fallback;
    const used = new Set<string>();
    for (const {id} of tools) {
      const key = typeof parsed[id] === "string" ? parsed[id].toLowerCase() : fallback[id];
      if (key && (!/^[a-z0-9]$/.test(key) || used.has(key))) continue;
      fallback[id] = key;
      if (key) used.add(key);
    }
  } catch {
    return fallback;
  }
  return fallback;
}

function storedCommandShortcutAssignments(): Record<CommandShortcutID, string> {
  let assignments = {...defaultCommandShortcuts};
  try {
    const parsed = JSON.parse(localStorage.getItem("pixtorio-command-shortcuts") ?? "null") as Record<string, unknown> | null;
    if (!parsed) return assignments;
    for (const command of Object.keys(assignments) as CommandShortcutID[]) {
      if (typeof parsed[command] === "string") assignments = assignCommandShortcut(assignments, command, normalizeShortcut(parsed[command]));
    }
  } catch {
    return assignments;
  }
  return assignments;
}

export function useShortcuts() {
  const [shortcutAssignments, setShortcutAssignments] = useState<ToolShortcutAssignments>(storedToolShortcutAssignments);

  const [commandShortcutAssignments, setCommandShortcutAssignments] = useState<Record<CommandShortcutID, string>>(storedCommandShortcutAssignments);

  const shortcutToolByKey = useMemo(() => {
    const entries = Object.entries(shortcutAssignments)
      .filter((entry): entry is [ToolID, string] => Boolean(entry[1]));
    return Object.fromEntries(entries.map(([tool, key]) => [key, tool])) as Record<string, ToolID>;
  }, [shortcutAssignments]);

  const updateToolShortcut = useCallback((tool: ToolID, rawKey: string) => {
    const key = rawKey.trim().slice(-1).toLowerCase();
    if (key && !/^[a-z0-9]$/.test(key)) return;
    if (key) {
      setCommandShortcutAssignments((current) => {
        const next = {...current};
        for (const command of Object.keys(next) as CommandShortcutID[]) {
          if (normalizeShortcut(next[command]) === key.toUpperCase()) next[command] = "";
        }
        return next;
      });
    }
    setShortcutAssignments((current) => {
      const next = {...current};
      const previous = current[tool];
      const conflict = (Object.keys(current) as ToolID[]).find((candidate) => candidate !== tool && current[candidate] === key);
      next[tool] = key;
      if (conflict) next[conflict] = previous;
      return next;
    });
  }, []);

  const captureCommandShortcut = useCallback((command: CommandShortcutID, event: ReactKeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Backspace") {
      setCommandShortcutAssignments((current) => assignCommandShortcut(current, command, ""));
      return;
    }
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (shortcut) {
      if (/^[A-Z0-9]$/.test(shortcut)) {
        setShortcutAssignments((current) => Object.fromEntries(Object.entries(current).map(([tool, key]) => [tool, key === shortcut.toLowerCase() ? "" : key])) as ToolShortcutAssignments);
      }
      setCommandShortcutAssignments((current) => assignCommandShortcut(current, command, shortcut));
    }
  }, []);

  const resetToolShortcuts = useCallback(() => {
    const defaults = defaultToolShortcutAssignments();
    const defaultKeys = new Set(Object.values(defaults).filter(Boolean).map((key) => key.toUpperCase()));
    setShortcutAssignments(defaults);
    setCommandShortcutAssignments((current) => Object.fromEntries(Object.entries(current).map(([command, shortcut]) => [command, defaultKeys.has(normalizeShortcut(shortcut)) ? "" : shortcut])) as Record<CommandShortcutID, string>);
  }, []);

  useEffect(() => { localStorage.setItem("pixtorio-tool-shortcuts", JSON.stringify(shortcutAssignments)); }, [shortcutAssignments]);

  useEffect(() => { localStorage.setItem("pixtorio-command-shortcuts", JSON.stringify(commandShortcutAssignments)); }, [commandShortcutAssignments]);
  return {shortcutAssignments, commandShortcutAssignments, setCommandShortcutAssignments, shortcutToolByKey, updateToolShortcut, captureCommandShortcut, resetToolShortcuts};
}

import {describe, expect, it} from "vitest";
import {defaultPreferences, preferencesStorageKey, readPreferences, resetPreferences, savePreferences} from "./preferences";

function storage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === preferencesStorageKey ? value : null,
    setItem: (key: string, next: string) => { if (key === preferencesStorageKey) value = next; },
    removeItem: (key: string) => { if (key === preferencesStorageKey) value = null; },
    current: () => value,
  };
}

describe("application preferences", () => {
  it("defaults to the Chinese light interface", () => {
    expect(defaultPreferences().general).toMatchObject({language: "zh", theme: "light"});
  });

  it("round trips the complete preference model", () => {
    const target = storage();
    const preferences = defaultPreferences();
    preferences.general.theme = "light";
    preferences.editor.zoomFromCenter = true;
    preferences.grid.offsetX = -12;
    preferences.cursor.preview = "both";
    savePreferences(target, preferences);
    expect(readPreferences(target)).toEqual(preferences);
  });

  it("returns independent defaults when storage is absent or malformed", () => {
    const first = readPreferences(storage());
    const second = readPreferences(storage("{bad"));
    first.grid.width = 99;
    expect(second.grid.width).toBe(8);
  });

  it("rejects unknown, missing and out-of-range fields without migration", () => {
    const valid = defaultPreferences();
    expect(readPreferences(storage(JSON.stringify({...valid, version: 0})))).toEqual(defaultPreferences());
    expect(readPreferences(storage(JSON.stringify({...valid, extra: true})))).toEqual(defaultPreferences());
    expect(readPreferences(storage(JSON.stringify({...valid, files: {...valid.files, autosaveSeconds: 1}})))).toEqual(defaultPreferences());
  });

  it("rejects invalid values on save", () => {
    const target = storage();
    const invalid = defaultPreferences();
    invalid.cursor.color = "white";
    expect(() => savePreferences(target, invalid)).toThrow("Invalid Pixtorio preferences");
    expect(target.current()).toBeNull();
  });

  it("removes saved data when reset", () => {
    const target = storage();
    savePreferences(target, defaultPreferences());
    expect(resetPreferences(target)).toEqual(defaultPreferences());
    expect(target.current()).toBeNull();
  });
});

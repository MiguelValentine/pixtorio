import {describe, expect, it} from "vitest";
import {isEditableTarget} from "./App";

function target(nodeName: string, isContentEditable = false) {
  return {nodeName, isContentEditable} as unknown as EventTarget;
}

describe("global shortcut editable-target guard", () => {
  it.each(["INPUT", "TEXTAREA", "SELECT"])("recognizes %s as editable", (nodeName) => {
    expect(isEditableTarget(target(nodeName))).toBe(true);
  });

  it("recognizes contenteditable targets as editable", () => {
    expect(isEditableTarget(target("DIV", true))).toBe(true);
  });

  it("does not block canvas shortcuts for non-editable targets", () => {
    expect(isEditableTarget(target("CANVAS"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

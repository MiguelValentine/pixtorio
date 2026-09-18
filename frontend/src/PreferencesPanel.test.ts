import {Fragment, createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {PreferencesPanel} from "./PreferencesPanel";
import {defaultPreferences} from "./editor/preferences";

function renderPreferencesMarkup(zh: boolean) {
  return renderToStaticMarkup(
    createElement(PreferencesPanel, {
      preferences: defaultPreferences(),
      onChange: () => undefined,
      zh,
      afterGeneral: createElement(
        Fragment,
        null,
        createElement("details", null, createElement("summary", null, zh ? "工作区布局" : "Workspace Layouts")),
        createElement("details", null, createElement("summary", null, zh ? "快捷键" : "Shortcuts")),
      ),
    }),
  );
}

function renderSections(zh: boolean) {
  const markup = renderPreferencesMarkup(zh);

  return [...markup.matchAll(/<details( open="")?>\s*<summary>([^<]*)<\/summary>/g)].map(([, open, summary]) => ({
    open: Boolean(open),
    summary: summary.replace(/&amp;/g, "&"),
  }));
}

function sectionBody(markup: string, summary: string) {
  const escapedSummary = summary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return markup.match(new RegExp(`<details(?: open="")?>\\s*<summary>${escapedSummary}<\\/summary>\\s*<div[^>]*>([\\s\\S]*?)<\\/div>\\s*<\\/details>`))?.[1] ?? "";
}

function controlOrder(markup: string) {
  return [...markup.matchAll(/<label class="([^"]+)">[\s\S]*?(?:<input type="([^"]+)"|<select\b)/g)].map(([, className, inputType]) => ({
    className,
    kind: inputType ?? "select",
  }));
}

describe("PreferencesPanel afterGeneral sections", () => {
  it.each([
    {
      language: "中文",
      zh: true,
      expected: ["常规", "工作区布局", "快捷键", "文件与恢复", "颜色", "提醒", "编辑器", "选区", "时间轴", "光标", "透明背景", "网格", "辅助线与切片", "历史记录", "绘制"],
    },
    {
      language: "English",
      zh: false,
      expected: ["General", "Workspace Layouts", "Shortcuts", "Files & Recovery", "Color", "Alerts", "Editor", "Selection", "Timeline", "Cursors", "Background", "Grid", "Guides & Slices", "Undo", "Drawing"],
    },
  ])("places workspace and shortcut details after general in $language", ({zh, expected}) => {
    const sections = renderSections(zh);

    expect(sections.map(({summary}) => summary)).toEqual(expected);
    expect(sections.slice(1, 3).map(({open}) => open)).toEqual([false, false]);
  });

  it("keeps the background and grid layout classes on their section bodies", () => {
    const markup = renderPreferencesMarkup(true);
    const backgroundClasses = markup.match(/<details>\s*<summary>透明背景<\/summary>\s*<div class="([^"]+)">/)?.[1] ?? "";
    const gridClasses = markup.match(/<details>\s*<summary>网格<\/summary>\s*<div class="([^"]+)">/)?.[1] ?? "";

    expect(backgroundClasses.split(/\s+/)).toEqual(expect.arrayContaining(["preferences-section-body", "preferences-general"]));
    expect(gridClasses.split(/\s+/)).toEqual(expect.arrayContaining(["preferences-section-body", "preferences-field-grid"]));
  });

  it("keeps heterogeneous preference controls on the intended rows", () => {
    const markup = renderPreferencesMarkup(true);
    const general = sectionBody(markup, "常规");
    const files = sectionBody(markup, "文件与恢复");
    const timeline = sectionBody(markup, "时间轴");
    const background = sectionBody(markup, "透明背景");
    const grid = sectionBody(markup, "网格");
    const undo = sectionBody(markup, "历史记录");

    expect(general).toMatch(/<label class="dialog-field dialog-field-wide"><span>界面缩放<\/span><select\b/);
    expect(files).toMatch(/<label class="dialog-checkbox dialog-field-wide"><input type="checkbox"[^>]*>启用恢复数据<\/label>/);
    expect(timeline).toMatch(/<label class="dialog-checkbox dialog-field-wide"><input type="checkbox"[^>]*>编辑画布时保留时间轴选区<\/label>/);
    expect(background).toMatch(/<label class="dialog-field dialog-field-wide"><span>新建项目背景<\/span><select\b/);
    expect(background).toMatch(/<label class="dialog-field dialog-field-wide"><span>棋盘格尺寸<\/span><input type="number"[^>]*>/);
    expect(undo).toMatch(/<label class="dialog-field dialog-field-wide"><span>历史内存上限（MB）<\/span><input type="number"[^>]*>/);
    expect(controlOrder(grid)).toEqual([
      {className: "dialog-field", kind: "number"},
      {className: "dialog-field", kind: "number"},
      {className: "dialog-field", kind: "number"},
      {className: "dialog-field", kind: "number"},
      {className: "dialog-field", kind: "number"},
      {className: "dialog-field", kind: "number"},
      {className: "dialog-checkbox dialog-field-wide", kind: "checkbox"},
      {className: "dialog-color-field", kind: "color"},
      {className: "dialog-color-field", kind: "color"},
    ]);
  });
});

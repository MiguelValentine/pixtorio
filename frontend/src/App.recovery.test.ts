import {describe, expect, it} from "vitest";
import {createDocument} from "./editor/document";
import {encodeProject} from "./editor/serialization";
import {createEditorTab, decodeRecoveryPayload, encodeRecoveryPayload, isActivationKey, localizeStatus, parsePNGResponse, parsePNGSequenceResponse, parseProjectResponse, projectPathKey} from "./App";

describe("recovery snapshots", () => {
  it("distinguishes the startup placeholder from explicit unsaved documents", () => {
    const document = createDocument({width: 1, height: 1});
    expect(createEditorTab(document).history.isDirty).toBe(false);
    expect(createEditorTab(document, "new-tab", undefined, true).history.isDirty).toBe(true);
  });

  it("stores only dirty documents and keeps a dirty active fallback", () => {
    const clean = createDocument({name: "clean.pixio", width: 1, height: 1});
    const dirty = createDocument({name: "dirty.pixio", width: 2, height: 1});
    const secondDirty = createDocument({name: "second-dirty.pixio", width: 3, height: 1});
    const payload = encodeRecoveryPayload([
      {id: "clean-tab", document: clean, isDirty: false},
      {id: "dirty-tab", filePath: "C:/Art/dirty.pixio", document: dirty, isDirty: true},
      {id: "second-dirty-tab", document: secondDirty, isDirty: true},
    ], "clean-tab");

    expect(payload).not.toBeNull();
    const raw = JSON.parse(payload!) as {format: string; activeTabId: string; documents: Array<{tabId: string; filePath?: string; document: string}>};
    expect(raw.format).toBe("pixtorio-recovery-v2");
    expect(raw.activeTabId).toBe("dirty-tab");
    expect(raw.documents).toHaveLength(2);
    expect(raw.documents[0].tabId).toBe("dirty-tab");
    expect(raw.documents[0].filePath).toBe("C:/Art/dirty.pixio");
    expect(raw.documents[1].tabId).toBe("second-dirty-tab");
    expect(raw.documents[1].filePath).toBeUndefined();

    const restored = decodeRecoveryPayload(payload!);
    expect(restored.activeTabId).toBe("dirty-tab");
    expect(restored.documents).toHaveLength(2);
    expect(restored.documents[0].document.name).toBe("dirty.pixio");
    expect(restored.documents[0].document.width).toBe(2);
    expect(restored.documents[0].filePath).toBe("C:/Art/dirty.pixio");
    expect(restored.documents[1].document.name).toBe("second-dirty.pixio");
    expect(restored.documents[1].document.width).toBe(3);
    expect(restored.documents[1].filePath).toBeUndefined();
  });

  it("returns no snapshot when every document is clean", () => {
    const document = createDocument({width: 1, height: 1});
    expect(encodeRecoveryPayload([{id: "tab", document, isDirty: false}], "tab")).toBeNull();
  });

  it("rejects legacy single-document recovery payloads", () => {
    const document = createDocument({name: "legacy.pixio", width: 1, height: 1});
    expect(() => decodeRecoveryPayload(encodeProject(document))).toThrow("Recovery JSON is invalid");
  });

  it("uses a stable error for malformed recovery JSON", () => {
    expect(() => decodeRecoveryPayload("not-json")).toThrow("Recovery JSON is invalid");
    expect(localizeStatus("Recovery JSON is invalid", "zh")).toBe("恢复文件 JSON 无效");
  });

  it.each([null, "", " ", "project.png", " project.pixio"]) ("rejects invalid recovery file paths %s", (filePath) => {
    const document = createDocument({width: 1, height: 1});
    const payload = encodeRecoveryPayload([{id: "tab", filePath: filePath as string, document, isDirty: true}], "tab");
    expect(() => decodeRecoveryPayload(payload!)).toThrow("Recovery document entry is invalid");
  });
});

describe("project paths", () => {
  it("compares Windows paths case-insensitively and normalizes separators", () => {
    expect(projectPathKey("C:/Art/Hero.PIXIO")).toBe(projectPathKey("c:\\art\\hero.pixio"));
  });
});

describe("serialization status localization", () => {
  it("localizes editing statuses in Chinese while preserving English", () => {
    const statuses = [
      ["Add Layer Group", "新建图层组"],
      ["Delete Layer", "删除图层"],
      ["Change Blend Mode", "修改混合模式"],
      ["Add Palette Color", "添加调色板颜色"],
      ["Edit Palette Color", "编辑调色板颜色"],
      ["Remove Palette Color", "移除调色板颜色"],
      ["Link Cels", "链接所选动画格"],
      ["Unlink Cels", "取消链接所选动画格"],
      ["Add Frame Tag", "添加帧标签"],
      ["Edit Frame Tag", "编辑帧标签"],
      ["Delete Frame Tag", "删除帧标签"],
      ["Scale Selection", "缩放选区"],
      ["Cut Selection", "剪切选区"],
      ["Rotate Selection Clockwise", "顺时针旋转选区"],
      ["Rotate Selection Counterclockwise", "逆时针旋转选区"],
      ["Flip Selection Horizontally", "水平翻转选区"],
      ["Flip Selection Vertically", "垂直翻转选区"],
      ["Select an image layer", "请选择图像图层"],
      ["Pause playback to edit", "暂停播放后才能编辑"],
      ["Unsupported clipboard content", "剪贴板内容不受支持"],
      ["Selected Cels", "已选择动画格"],
      ["Copied Cels", "已复制动画格"],
      ["Cut Cels", "剪切动画格"],
      ["Clear Cels", "清除动画格"],
      ["Paste Cels", "粘贴动画格"],
      ["Selected cels are locked", "所选动画格已锁定"],
      ["Cels cannot be pasted here", "无法在此处粘贴动画格"],
      ["selected project is already open", "所选项目已在其他标签中打开"],
    ] as const;

    for (const [source, expected] of statuses) {
      expect(localizeStatus(source, "zh")).toBe(expected);
      expect(localizeStatus(source, "en")).toBe(source);
    }
  });

  it("localizes newer text, effect, tilemap, color, transform and history statuses", () => {
    const statuses = [
      ["Text", "文字"],
      ["Outline", "轮廓"],
      ["Shading", "明暗处理"],
      ["Brightness / Contrast", "亮度 / 对比度"],
      ["Hue / Saturation / Lightness", "色相 / 饱和度 / 明度"],
      ["Invert Colors", "反相颜色"],
      ["Convolution", "卷积滤镜"],
      ["Median Filter", "中值滤波"],
      ["Despeckle", "去斑"],
      ["Color Curves", "颜色曲线"],
      ["HSV / HSL Adjustment", "HSV / HSL 调整"],
      ["Channel Mask", "通道掩码"],
      ["Add Tilemap Layer", "新建图块图层"],
      ["Convert Layer to Tilemap", "将图层转换为图块地图"],
      ["Add Tile", "添加图块"],
      ["Delete Tile", "删除图块"],
      ["Draw Tiles", "绘制图块"],
      ["Draw Tile Pixels", "绘制图块像素"],
      ["Change Color Mode", "修改颜色模式"],
      ["Assign Color Profile", "分配颜色配置文件"],
      ["Convert Color Profile", "转换颜色配置文件"],
      ["Assign Embedded Color Profile", "分配嵌入式颜色配置文件"],
      ["Import Palette", "导入调色板"],
      ["Extract Palette", "提取调色板"],
      ["Sort Palette", "整理调色板"],
      ["Resize Sprite", "调整精灵内容尺寸"],
      ["Trim Canvas", "裁去画布透明边缘"],
      ["Rotate Sprite Clockwise", "顺时针旋转精灵"],
      ["Rotate Sprite Counterclockwise", "逆时针旋转精灵"],
      ["Rotate Sprite 180", "旋转精灵 180°"],
      ["Flip Sprite Horizontally", "水平翻转精灵"],
      ["Flip Sprite Vertically", "垂直翻转精灵"],
      ["Transform Cels", "变换动画格"],
      ["Rasterize Cels", "将动画格栅格化到画布"],
      ["Add Guide", "添加辅助线"],
      ["Move Guide", "移动辅助线"],
      ["Delete Guide", "删除辅助线"],
      ["Change Grid", "修改网格"],
      ["Change Grid Snapping", "修改网格吸附"],
      ["Change Onion Skin", "修改洋葱皮"],
      ["History state restored", "已恢复历史状态"],
      ["Text rendering failed", "文字渲染失败"],
      ["No editable cels selected", "没有选择可编辑的动画格"],
      ["No editable image cels", "没有可编辑的图像动画格"],
      ["Sequence export failed", "序列导出失败"],
      ["Exported packed atlas", "已导出紧凑图集"],
    ] as const;

    for (const [source, expected] of statuses) {
      expect(localizeStatus(source, "zh")).toBe(expected);
      expect(localizeStatus(source, "en")).toBe(source);
    }
  });

  it("localizes dynamic sequence and history status messages", () => {
    expect(localizeStatus("Exporting PNG sequence...", "zh")).toBe("正在导出 PNG 序列...");
    expect(localizeStatus("Exported 12 PNG frames", "zh")).toBe("已导出 12 个 PNG 帧");
    expect(localizeStatus("Exported tag sprite sheets", "zh")).toBe("已导出按帧标签拆分的精灵图");
    expect(localizeStatus("Exported layer sprite sheets", "zh")).toBe("已导出按图层拆分的精灵图");
    expect(localizeStatus("Undid Brightness / Contrast", "zh")).toBe("已撤销：亮度 / 对比度");
    expect(localizeStatus("Redid Text", "zh")).toBe("已重做：文字");
    expect(localizeStatus("Exported 12 PNG frames", "en")).toBe("Exported 12 PNG frames");
  });

  it("localizes every decodeProject validation error", () => {
    expect(localizeStatus("Project JSON is invalid", "zh")).toBe("项目 JSON 无效");
    expect(localizeStatus("Project document is invalid", "zh")).toBe("项目文档无效");
    expect(localizeStatus("Project cels are missing", "zh")).toBe("项目缺少动画格");
    expect(localizeStatus("Project cel pixels are invalid", "zh")).toBe("动画格像素数据无效");
    expect(localizeStatus("Project cel dimensions are invalid", "zh")).toBe("动画格尺寸无效");
    expect(localizeStatus("Project contains duplicate cels", "zh")).toBe("项目包含重复的动画格");
  });

  it.each([
    ["invalid project entry \"../manifest.json\"", "无效的项目条目 \"../manifest.json\""],
    ["duplicate project entry \"manifest.json\"", "重复的项目条目 \"manifest.json\""],
    ["project entry \"manifest.json\" is too large", "项目条目 \"manifest.json\" 过大"],
    ["cel \"cels/a.png\" dimensions do not match manifest", "动画格 \"cels/a.png\" 的尺寸与项目清单不一致"],
    ["encode GIF: disk full", "编码 GIF 失败：disk full"],
    ["close sprite sheet: denied", "关闭精灵图失败：denied"],
    ["rewind PNG: seek failed", "重置 PNG 读取位置失败：seek failed"],
    ["sync PNG: disk full", "同步 PNG 失败：disk full"],
    ["rename GIF: denied", "替换 GIF 失败：denied"],
    ["sync temporary project: disk full", "同步临时项目失败：disk full"],
    ["GIF duration exceeds 65535 centiseconds", "GIF 帧时长超过 65535 个百分之一秒"],
    ["thumbnail exceeds 8388608 bytes", "缩略图超过 8388608 字节限制"],
    ["manifest exceeds 8388608 bytes", "项目清单超过 8388608 字节限制"],
  ])("localizes import and export error %s", (source, expected) => {
    expect(localizeStatus(source, "zh")).toBe(expected);
    expect(localizeStatus(source, "en")).toBe(source);
  });
});

describe("desktop bridge response parsing", () => {
  it("validates the outer project response for startup and file opening", () => {
    expect(() => parseProjectResponse("not-json")).toThrow("Invalid project response");
    expect(() => parseProjectResponse(JSON.stringify({path: "project.pixio"}))).toThrow("Invalid project response");
    expect(() => parseProjectResponse(JSON.stringify({path: "project.pixio", document: {}}))).toThrow("Invalid project response");
    expect(parseProjectResponse(JSON.stringify({path: "project.pixio", document: "{}"}))).toEqual({path: "project.pixio", document: "{}"});
  });

  it("decodes and validates PNG bridge responses", () => {
    expect(() => parsePNGResponse("not-json")).toThrow("Invalid PNG response");
    expect(() => parsePNGResponse(JSON.stringify({name: "image.png", width: 1, height: 1, pixels: "not-base64!"}))).toThrow("Invalid PNG response");
    const parsed = parsePNGResponse(JSON.stringify({name: "image.png", width: 1, height: 1, pixels: btoa("\x01\x02\x03\x04")}));
    expect(parsed.name).toBe("image.png");
    expect(Array.from(parsed.pixels)).toEqual([1, 2, 3, 4]);
  });

  it("decodes and validates PNG sequence bridge responses", () => {
    const frame = {name: "frame-001.png", width: 1, height: 1, pixels: btoa("\x01\x02\x03\x04")};
    expect(parsePNGSequenceResponse(JSON.stringify({frames: [frame]}))).toHaveLength(1);
    expect(() => parsePNGSequenceResponse(JSON.stringify({frames: []}))).toThrow("Invalid PNG sequence response");
    expect(() => parsePNGSequenceResponse(JSON.stringify({frames: [{...frame, width: 0}]}))).toThrow("Invalid PNG response");
  });

  it("recognizes only Enter and Space as row activation keys", () => {
    expect(isActivationKey("Enter")).toBe(true);
    expect(isActivationKey(" ")).toBe(true);
    expect(isActivationKey("Tab")).toBe(false);
  });
});

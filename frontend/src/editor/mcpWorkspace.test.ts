import {describe, expect, it} from "vitest";
import {createDocument} from "./document";
import {CommandHistory} from "./history";
import {handleMCPWorkspaceCommand, type MCPWorkspaceHost, type MCPWorkspaceTab} from "./mcpWorkspace";

function workspace() {
  let busy = false;
  let serial = 0;
  const host: MCPWorkspaceHost = {
    tabs: [], activeDocumentId: "",
    assertIdle() { if (busy) throw new Error("busy"); },
    open(document, filePath, dirty) {
      const tab: MCPWorkspaceTab = {id: `tab-${++serial}`, document, filePath, history: new CommandHistory()};
      if (dirty) tab.history.markDirty();
      host.tabs.push(tab);
      host.activeDocumentId = tab.id;
      return tab;
    },
    activate(tab) { host.activeDocumentId = tab.id; },
    close(tab) { host.tabs.splice(host.tabs.indexOf(tab), 1); },
    edited() {}, saved() {},
  };
  const call = (name: string, args: Record<string, unknown> = {}) => handleMCPWorkspaceCommand(host, name, args) as Record<string, unknown>;
  return {host, call, setBusy(value: boolean) { busy = value; }};
}

describe("MCP workspace", () => {
  it("starts empty, creates default documents and switches by stable ID", () => {
    const {host, call} = workspace();
    expect(call("list_documents")).toEqual({activeDocumentId: null, documents: []});
    const first = call("create_document");
    expect(first).toMatchObject({width: 64, height: 64, dirty: true});
    call("create_document", {name: "Second", width: 16, height: 32});
    call("activate_document", {documentId: first.documentId});
    expect(host.activeDocumentId).toBe(first.documentId);
    expect(host.tabs).toHaveLength(2);
  });

  it("edits the requested tab, uses undo/redo and retains palette alpha", () => {
    const {host, call} = workspace();
    const first = call("create_document");
    call("create_document");
    call("edit_document", {documentId: first.documentId, operations: [{type: "set_palette", colors: ["#ff000080"]}]});
    expect(host.tabs[0].document.palette.colors).toEqual(["#ff000080"]);
    expect(host.tabs[1].document.palette.colors).not.toEqual(["#ff000080"]);
    expect(host.tabs[0].history.undoCount).toBe(1);
    call("undo", {documentId: first.documentId});
    expect(host.tabs[0].document.palette.colors).not.toEqual(["#ff000080"]);
    call("redo", {documentId: first.documentId});
    expect(host.tabs[0].document.palette.colors).toEqual(["#ff000080"]);
  });

  it("requires explicit permission to discard dirty documents", () => {
    const {host, call} = workspace();
    const {documentId} = call("create_document");
    expect(() => call("close_document", {documentId})).toThrow("unsaved");
    expect(() => call("close_document", {documentId, discardChanges: "true"})).toThrow("boolean");
    call("close_document", {documentId, discardChanges: true});
    expect(host.tabs).toHaveLength(0);
  });

  it("rejects busy editing while allowing discovery", () => {
    const {call, setBusy} = workspace();
    setBusy(true);
    expect(() => call("create_document")).toThrow("busy");
    expect(call("list_documents").documents).toEqual([]);
  });

  it("does not mark intervening edits as saved", () => {
    const {host, call} = workspace();
    const {documentId} = call("create_document");
    const snapshot = call("save_snapshot", {documentId, path: "C:\\art.pixio"});
    call("edit_document", {documentId, operations: [{type: "rename_document", name: "Changed"}]});
    call("mark_saved", {documentId, path: "C:\\art.pixio", stateId: snapshot.stateId});
    expect(host.tabs[0].history.isDirty).toBe(true);
    expect(host.tabs[0].filePath).toBe("C:\\art.pixio");
  });

  it("rejects paths already owned by another tab", () => {
    const {host, call} = workspace();
    const first = host.open(createDocument({width: 2, height: 2}), "C:\\Art.pixio");
    const second = call("create_document");
    expect(() => call("save_snapshot", {documentId: second.documentId, path: "c:/art.pixio"})).toThrow("another open document");
    expect(call("save_snapshot", {documentId: first.id, path: "C:\\Art.pixio"}).document).toBeTypeOf("string");
  });

  it("exports transparent straight RGBA and frame durations", () => {
    const {call} = workspace();
    const {documentId} = call("create_document", {width: 2, height: 1});
    call("edit_document", {documentId, operations: [{type: "set_pixels", pixels: [{x: 0, y: 0, color: "#ff000080"}]}]});
    const snapshot = call("export_snapshot", {documentId, format: "png"});
    expect(snapshot).toMatchObject({width: 2, height: 1, durations: [100]});
    expect(Array.from(atob((snapshot.frames as string[])[0]), (char) => char.charCodeAt(0))).toEqual([255, 0, 0, 128, 0, 0, 0, 0]);
    expect(() => call("export_snapshot", {documentId, format: "png", frameId: "missing"})).toThrow("Frame");
  });

  it("routes indexed Cel reads and lazy Cel writes", () => {
    const {call} = workspace();
    const created = call("create_document", {width: 2, height: 2, colorMode: "indexed"});
    expect(call("read_indexes", {documentId: created.documentId, x: 0, y: 0, width: 2, height: 2})).toEqual([0, 0, 0, 0]);
    call("edit_document", {documentId: created.documentId, operations: [{type: "set_indexes", pixels: [{x: 1, y: 1, index: 2}], frameId: created.activeFrameId}]});
    expect(call("read_indexes", {documentId: created.documentId, x: 0, y: 0, width: 2, height: 2})).toEqual([0, 0, 0, 2]);
  });

  it("routes tileset and tilemap reads for the requested document", () => {
    const {call} = workspace();
    const created = call("create_document", {width: 2, height: 1});
    call("edit_document", {documentId: created.documentId, operations: [
      {type: "add_tileset", tilesetId: "terrain", name: "Terrain", tileWidth: 1, tileHeight: 1},
      {type: "add_tile", tilesetId: "terrain", tileId: 1, pixels: ["#ff0000ff"]},
      {type: "add_layer", name: "Map", kind: "tilemap", tilesetId: "terrain"},
      {type: "set_tile_cells", cells: [{x: 1, y: 0, value: 1}]},
    ]});
    const tileset = call("read_tileset", {documentId: created.documentId, tilesetId: "terrain"});
    expect(tileset).toMatchObject({id: "terrain", tiles: [{id: 1, pixels: ["#ff0000ff"]}]});
    const tilemap = call("read_tilemap", {documentId: created.documentId});
    expect(tilemap).toMatchObject({tilesetId: "terrain", columns: 2, rows: 1, tiles: [0, 1]});
  });

  it("validates dimensions and missing targets", () => {
    const {call} = workspace();
    expect(() => call("create_document", {width: 2049})).toThrow("Dimensions");
    expect(() => call("create_document", {colorMode: "unknown"})).toThrow("color mode");
    expect(() => call("get_document", {documentId: "missing"})).toThrow("not open");
  });
});

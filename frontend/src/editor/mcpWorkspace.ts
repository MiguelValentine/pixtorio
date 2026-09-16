import {compositeFrameForExport, createDocument, type PixelDocument} from "./document";
import {type CommandHistory} from "./history";
import {
  applyMCPEdits,
  readMCPIndexes,
  readMCPPixels,
  readMCPTilemap,
  readMCPTileset,
  summarizeMCPDocument,
  type ReadMCPIndexesArgs,
  type ReadMCPPixelsArgs,
  type ReadMCPTilemapArgs,
  type ReadMCPTilesetArgs,
} from "./mcp";
import {bytesToBase64, decodeProject, encodeProject} from "./serialization";

export interface MCPWorkspaceTab {
  id: string;
  filePath?: string;
  document: PixelDocument;
  history: CommandHistory<PixelDocument>;
}

export interface MCPWorkspaceHost {
  tabs: MCPWorkspaceTab[];
  activeDocumentId: string;
  assertIdle(): void;
  open(document: PixelDocument, path?: string, dirty?: boolean): MCPWorkspaceTab;
  activate(tab: MCPWorkspaceTab): void;
  close(tab: MCPWorkspaceTab): void;
  edited(tab: MCPWorkspaceTab): void;
  saved(tab: MCPWorkspaceTab): void;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Arguments must be an object");
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function dimension(value: unknown): number {
  if (value === undefined) return 64;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 2048) throw new Error("Dimensions must be integers between 1 and 2048");
  return value;
}

const pathKey = (path: string) => path.replaceAll("\\", "/").toLowerCase();

function summary(tab: MCPWorkspaceTab) {
  return {...summarizeMCPDocument(tab.document), documentId: tab.id, path: tab.filePath ?? null,
    dirty: tab.history.isDirty, stateId: tab.history.stateID, canUndo: tab.history.canUndo, canRedo: tab.history.canRedo};
}

export function handleMCPWorkspaceCommand(host: MCPWorkspaceHost, name: string, value: unknown): unknown {
  const args = record(value);
  // A completed save acknowledgement only changes bookkeeping, never pixels.
  if (name !== "mark_saved" && name !== "list_documents") host.assertIdle();
  if (name === "list_documents") {
    return {activeDocumentId: host.activeDocumentId || null, documents: host.tabs.map(summary)};
  }
  if (name === "create_document") {
    const colorMode = args.colorMode ?? "rgba";
    if (colorMode !== "rgba" && colorMode !== "grayscale" && colorMode !== "indexed") throw new Error("Invalid color mode");
    const doc = createDocument({width: dimension(args.width), height: dimension(args.height), colorMode,
      name: args.name === undefined ? "untitled.pixio" : string(args.name, "name")});
    return summary(host.open(doc, undefined, true));
  }
  if (name === "open_document") {
    return summary(host.open(decodeProject(string(args.document, "document")), string(args.path, "path")));
  }
  const id = string(args.documentId, "documentId");
  const tab = host.tabs.find((candidate) => candidate.id === id);
  if (!tab) throw new Error("Document is not open; call pixtorio_list_documents for current IDs");
  const doc = tab.document;
  switch (name) {
    case "get_document": return summary(tab);
    case "activate_document": host.activate(tab); return summary(tab);
    case "close_document":
      if (args.discardChanges !== undefined && typeof args.discardChanges !== "boolean") throw new Error("discardChanges must be boolean");
      if (tab.history.isDirty && args.discardChanges !== true) throw new Error("Document has unsaved changes; save it or pass discardChanges=true");
      host.close(tab);
      return {closedDocumentId: id};
    case "edit_document": {
      if (!Array.isArray(args.operations)) throw new Error("operations must be an array");
      const command = applyMCPEdits(doc, args.operations);
      if (command) {
        tab.history.commit(command);
        host.edited(tab);
      }
      return {...summary(tab), changed: Boolean(command)};
    }
    case "undo":
    case "redo": {
      const command = tab.history[name](doc);
      if (command) host.edited(tab);
      return {...summary(tab), changed: Boolean(command)};
    }
    case "read_pixels": {
      const region = {...args};
      delete region.documentId;
      return readMCPPixels(doc, region as ReadMCPPixelsArgs);
    }
    case "read_indexes": {
      const region = {...args};
      delete region.documentId;
      return readMCPIndexes(doc, region as ReadMCPIndexesArgs);
    }
    case "read_tileset": {
      const request = {...args};
      delete request.documentId;
      return readMCPTileset(doc, request as unknown as ReadMCPTilesetArgs);
    }
    case "read_tilemap": {
      const request = {...args};
      delete request.documentId;
      return readMCPTilemap(doc, request as ReadMCPTilemapArgs);
    }
    case "save_snapshot": {
      const path = string(args.path, "path");
      if (host.tabs.some((candidate) => candidate !== tab && candidate.filePath && pathKey(candidate.filePath) === pathKey(path))) {
        throw new Error("The destination belongs to another open document");
      }
      const document = encodeProject(doc);
      if (document.length > 96 * 1024 * 1024) throw new Error("Project exceeds the MCP transfer limit of 96 MiB; save it from the File menu");
      return {document, stateId: tab.history.stateID};
    }
    case "mark_saved": {
      const path = string(args.path, "path");
      if (typeof args.stateId !== "number") throw new Error("Invalid saved state");
      if (host.tabs.some((candidate) => candidate !== tab && candidate.filePath && pathKey(candidate.filePath) === pathKey(path))) {
        throw new Error("The saved path now belongs to another open document");
      }
      tab.history.markSaved(args.stateId);
      tab.filePath = path;
      host.saved(tab);
      return summary(tab);
    }
    case "export_snapshot": {
      const frameId = args.frameId === undefined || args.frameId === "" ? doc.activeFrameId : string(args.frameId, "frameId");
      if (!doc.frames.some((frame) => frame.id === frameId)) throw new Error("Frame does not exist");
      const frames = args.format === "png" ? doc.frames.filter((frame) => frame.id === frameId) : doc.frames;
      if (doc.width * doc.height * frames.length * 4 > 64 * 1024 * 1024) throw new Error("Frames exceed the MCP transfer limit of 64 MiB; export from the File menu");
      return {width: doc.width, height: doc.height, frames: frames.map((frame) => bytesToBase64(compositeFrameForExport(doc, frame.id))),
        durations: frames.map((frame) => frame.durationMs)};
    }
    default: throw new Error(`Unknown editor command: ${name}`);
  }
}

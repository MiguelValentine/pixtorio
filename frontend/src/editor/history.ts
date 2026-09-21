import {
  cloneDocument,
  estimateDocumentBytes,
  getCelByID,
  getLayerByID,
  replaceDocument,
  type PixelDocument,
} from "./document";
import {applyPatch, type PixelPatch} from "./pixels";
import {refreshTilemapCaches, syncIndexedCel} from "./colorModes";
import {recalculateTerrainCells} from "./terrain";
import {tilesetGridLayout} from "./tilemap";

export interface HistoryCommand<T> {
  readonly label: string;
  readonly byteSize: number;
  undo(target: T): void;
  redo(target: T): void;
}

interface HistoryEntry<T> {
  command: HistoryCommand<T>;
  beforeState: number;
  afterState: number;
}

export interface HistoryState {
  stateID: number;
  label: string;
  current: boolean;
  saved: boolean;
}

export const defaultHistoryLimitBytes = 128 * 1024 * 1024;

export class CommandHistory<T> {
  private readonly undoStack: Array<HistoryEntry<T>> = [];
  private readonly redoStack: Array<HistoryEntry<T>> = [];
  private currentState = 0;
  private savedState = 0;
  private nextState = 1;
  private retainedBytes = 0;

  constructor(private limitBytes = defaultHistoryLimitBytes) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0) {
      throw new Error("History memory limit must be a positive integer");
    }
  }

  get maxBytes() {
    return this.limitBytes;
  }

  setMaxBytes(maxBytes: number) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new Error("History memory limit must be a positive integer");
    }
    this.limitBytes = maxBytes;
    this.enforceMemoryLimit();
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get isDirty() {
    return this.currentState !== this.savedState;
  }

  get memoryBytes() {
    return this.retainedBytes;
  }

  get undoCount() {
    return this.undoStack.length;
  }

  get redoCount() {
    return this.redoStack.length;
  }

  get stateID() {
    return this.currentState;
  }

  get states(): readonly HistoryState[] {
    const entries = [
      ...this.undoStack,
      ...[...this.redoStack].reverse(),
    ];
    const baseState = entries[0]?.beforeState ?? this.currentState;
    return [
      {stateID: baseState, label: baseState === 0 ? "Initial State" : "Oldest Retained State", current: this.currentState === baseState, saved: this.savedState === baseState},
      ...entries.map((entry) => ({
        stateID: entry.afterState,
        label: entry.command.label,
        current: this.currentState === entry.afterState,
        saved: this.savedState === entry.afterState,
      })),
    ];
  }

  commit(command: HistoryCommand<T>) {
    validateCommand(command);
    for (const entry of this.redoStack) {
      this.retainedBytes -= entry.command.byteSize;
    }
    this.redoStack.length = 0;

    const entry: HistoryEntry<T> = {
      command,
      beforeState: this.currentState,
      afterState: this.nextState++,
    };
    this.undoStack.push(entry);
    this.retainedBytes += command.byteSize;
    this.currentState = entry.afterState;
    this.enforceMemoryLimit();
  }

  undo(target: T) {
    const entry = this.undoStack.at(-1);
    if (!entry) return null;
    entry.command.undo(target);
    this.undoStack.pop();
    this.redoStack.push(entry);
    this.currentState = entry.beforeState;
    return entry.command;
  }

  redo(target: T) {
    const entry = this.redoStack.at(-1);
    if (!entry) return null;
    entry.command.redo(target);
    this.redoStack.pop();
    this.undoStack.push(entry);
    this.currentState = entry.afterState;
    return entry.command;
  }

  jumpTo(target: T, stateID: number) {
    if (!Number.isSafeInteger(stateID) || !this.states.some((state) => state.stateID === stateID)) {
      throw new Error("History state is not reachable");
    }
    while (this.currentState !== stateID) {
      if (this.currentState > stateID) {
        if (!this.undo(target)) throw new Error("History state is not reachable");
      } else if (!this.redo(target)) {
        throw new Error("History state is not reachable");
      }
    }
  }

  markSaved(stateID = this.currentState) {
    if (!Number.isSafeInteger(stateID) || stateID < 0 || stateID >= this.nextState) {
      throw new Error("Saved history state is invalid");
    }
    this.savedState = stateID;
  }

  markDirty() {
    if (!this.isDirty) this.savedState = -1;
  }

  private enforceMemoryLimit() {
    while (this.retainedBytes > this.limitBytes && this.undoStack.length + this.redoStack.length > 1) {
      const discarded = this.undoStack.length > 1
        ? this.undoStack.shift()
        : this.redoStack.length > 1
          ? this.redoStack.shift()
          : this.undoStack.shift() ?? this.redoStack.shift();
      if (discarded) this.retainedBytes -= discarded.command.byteSize;
    }
  }
}

export class PixelEditCommand implements HistoryCommand<PixelDocument> {
  readonly byteSize: number;

  constructor(
    readonly celId: string,
    readonly patch: PixelPatch,
    readonly label: string,
  ) {
    this.byteSize = patch.before.byteLength + patch.after.byteLength + 64;
  }

  undo(document: PixelDocument) {
    this.apply(document, "before");
  }

  redo(document: PixelDocument) {
    this.apply(document, "after");
  }

  private apply(document: PixelDocument, direction: "before" | "after") {
    const cel = getCelByID(document, this.celId);
    if (!cel) throw new Error(`Cannot apply history command: cel ${this.celId} does not exist`);
    applyPatch(cel.pixels, cel.width, this.patch, direction);
    syncIndexedCel(document, cel);
  }
}

export interface TilemapCellChange {
  index: number;
  before: number;
  after: number;
}

export class TilemapCellsCommand implements HistoryCommand<PixelDocument> {
  readonly byteSize: number;
  readonly changes: readonly TilemapCellChange[];

  constructor(
    readonly celId: string,
    changes: readonly TilemapCellChange[],
    readonly label: string,
  ) {
    const indexes = new Set<number>();
    this.changes = changes.map((change) => {
      if (!Number.isSafeInteger(change.index) || change.index < 0
        || !Number.isInteger(change.before) || change.before < -0x80000000 || change.before > 0xffffffff
        || !Number.isInteger(change.after) || change.after < -0x80000000 || change.after > 0xffffffff
        || indexes.has(change.index)) {
        throw new Error("Tilemap history changes are invalid");
      }
      indexes.add(change.index);
      return {index: change.index, before: change.before >>> 0, after: change.after >>> 0};
    });
    this.byteSize = this.changes.length * 12 + 64;
  }

  undo(document: PixelDocument) {
    this.apply(document, "before");
  }

  redo(document: PixelDocument) {
    this.apply(document, "after");
  }

  private apply(document: PixelDocument, direction: "before" | "after") {
    const cel = getCelByID(document, this.celId);
    if (!cel?.tilemap) throw new Error(`Cannot apply tilemap history command: cel ${this.celId} does not exist`);
    for (const change of this.changes) {
      if (change.index >= cel.tilemap.tiles.length) throw new Error("Cannot apply tilemap history command: cell is outside the tilemap");
    }
    for (const change of this.changes) {
      cel.tilemap.tiles[change.index] = change[direction];
    }
    refreshTilemapCaches(document);
  }
}

export interface TerrainCellChange {
  index: number;
  before: number;
  after: number;
}

export class TerrainCellsCommand implements HistoryCommand<PixelDocument> {
  readonly byteSize: number;
  readonly changes: readonly TerrainCellChange[];

  constructor(
    readonly celId: string,
    changes: readonly TerrainCellChange[],
    readonly label: string,
  ) {
    const indexes = new Set<number>();
    this.changes = changes.map((change) => {
      if (!Number.isSafeInteger(change.index) || change.index < 0
        || !Number.isInteger(change.before) || change.before < 0 || change.before > 0xffff
        || !Number.isInteger(change.after) || change.after < 0 || change.after > 0xffff
        || indexes.has(change.index)) {
        throw new Error("Terrain history changes are invalid");
      }
      indexes.add(change.index);
      return {...change};
    });
    this.byteSize = this.changes.length * 8 + 64;
  }

  undo(document: PixelDocument) {
    this.apply(document, "before");
  }

  redo(document: PixelDocument) {
    this.apply(document, "after");
  }

  private apply(document: PixelDocument, direction: "before" | "after") {
    const cel = getCelByID(document, this.celId);
    if (!cel?.tilemap || !cel.terrainmap) {
      throw new Error(`Cannot apply Terrain history command: cel ${this.celId} does not exist`);
    }
    const layer = getLayerByID(document, cel.layerId);
    const tileset = layer?.tilesetId
      ? document.tilesets.find((candidate) => candidate.id === layer.tilesetId)
      : undefined;
    if (!layer || layer.kind !== "tilemap" || !tileset) {
      throw new Error("Cannot apply Terrain history command: tileset does not exist");
    }
    for (const change of this.changes) {
      if (change.index >= cel.terrainmap.terrains.length) {
        throw new Error("Cannot apply Terrain history command: cell is outside the terrain map");
      }
    }
    const changedCells = this.changes.map((change) => ({
      column: change.index % cel.terrainmap!.columns,
      row: Math.floor(change.index / cel.terrainmap!.columns),
    }));
    for (const change of this.changes) cel.terrainmap.terrains[change.index] = change[direction];
    recalculateTerrainCells(
      cel.terrainmap,
      tileset.terrains,
      tilesetGridLayout(tileset, cel.tilemap),
      cel.tilemap.tiles,
      changedCells,
    );
    refreshTilemapCaches(document);
  }
}

export class DocumentStateCommand implements HistoryCommand<PixelDocument> {
  readonly byteSize: number;

  constructor(
    readonly before: PixelDocument,
    readonly after: PixelDocument,
    readonly label: string,
  ) {
    this.before = cloneDocument(before);
    this.after = cloneDocument(after);
    this.byteSize = estimateDocumentBytes(this.before) + estimateDocumentBytes(this.after);
  }

  undo(document: PixelDocument) {
    replaceDocument(document, this.before);
  }

  redo(document: PixelDocument) {
    replaceDocument(document, this.after);
  }
}

function validateCommand<T>(command: HistoryCommand<T>) {
  if (!Number.isSafeInteger(command.byteSize) || command.byteSize < 0) {
    throw new Error("History command byte size must be a non-negative integer");
  }
}

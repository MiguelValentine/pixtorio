import {describe, expect, it} from "vitest";

import {celKey, cloneDocument, createCel, createDocument, type PixelDocument} from "./document";
import {
  CommandHistory,
  DocumentStateCommand,
  PixelEditCommand,
  type HistoryCommand,
} from "./history";
import {createPatch, setPixel} from "./pixels";

interface Counter {
  value: number;
}

function command(
  label: string,
  byteSize: number,
  delta: number,
  calls: string[] = [],
): HistoryCommand<Counter> {
  return {
    label,
    byteSize,
    undo(target) {
      calls.push(`${label}:undo`);
      target.value -= delta;
    },
    redo(target) {
      calls.push(`${label}:redo`);
      target.value += delta;
    },
  };
}

function pixelAt(document: PixelDocument, celId: string, x: number, y: number) {
  const cel = Object.values(document.cels).find((candidate) => candidate.id === celId);
  if (!cel) throw new Error(`Test cel ${celId} does not exist`);
  const index = (y * cel.width + x) * 4;
  return Array.from(cel.pixels.subarray(index, index + 4));
}

describe("CommandHistory", () => {
  it("applies a smaller memory limit to already retained commands", () => {
    const history = new CommandHistory<Counter>(100);
    history.commit(command("first", 40, 1));
    history.commit(command("second", 40, 1));
    history.commit(command("third", 40, 1));

    history.setMaxBytes(50);

    expect(history.maxBytes).toBe(50);
    expect(history.undoCount).toBe(1);
    expect(history.memoryBytes).toBe(40);
    expect(() => history.setMaxBytes(0)).toThrow("History memory limit must be a positive integer");
  });

  it("lists only reachable states after memory eviction", () => {
    const history = new CommandHistory<Counter>(8);
    const target = {value: 3};
    history.commit(command("first", 4, 1));
    history.commit(command("second", 4, 1));
    history.commit(command("third", 4, 1));

    expect(history.states.map((state) => state.stateID)).toEqual([1, 2, 3]);
    expect(history.states[0].label).toBe("Oldest Retained State");
    history.jumpTo(target, 1);
    expect(target.value).toBe(1);
    expect(() => history.jumpTo(target, 0)).toThrow("History state is not reachable");
  });

  it("trims the farthest redo entries when a live limit is reduced", () => {
    const history = new CommandHistory<Counter>(100);
    const target = {value: 3};
    history.commit(command("first", 30, 1));
    history.commit(command("second", 30, 1));
    history.commit(command("third", 30, 1));
    history.jumpTo(target, 0);

    history.setMaxBytes(35);

    expect(history.memoryBytes).toBe(30);
    expect(history.redoCount).toBe(1);
    expect(history.states.map((state) => state.stateID)).toEqual([0, 1]);
  });

  it("commits commands and undoes/redoes them in stack order", () => {
    const history = new CommandHistory<Counter>();
    const target = {value: 6};
    const calls: string[] = [];
    const first = command("first", 10, 2, calls);
    const second = command("second", 20, 4, calls);

    history.commit(first);
    history.commit(second);

    expect(history.undoCount).toBe(2);
    expect(history.redoCount).toBe(0);
    expect(history.isDirty).toBe(true);

    expect(history.undo(target)).toBe(second);
    expect(target.value).toBe(2);
    expect(history.undo(target)).toBe(first);
    expect(target.value).toBe(0);
    expect(history.redo(target)).toBe(first);
    expect(target.value).toBe(2);
    expect(history.redo(target)).toBe(second);
    expect(target.value).toBe(6);
    expect(calls).toEqual([
      "second:undo",
      "first:undo",
      "first:redo",
      "second:redo",
    ]);
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it("returns null without changing state when either stack is empty", () => {
    const history = new CommandHistory<Counter>();
    const target = {value: 12};

    expect(history.undo(target)).toBeNull();
    expect(history.redo(target)).toBeNull();
    expect(target.value).toBe(12);
    expect(history.undoCount).toBe(0);
    expect(history.redoCount).toBe(0);
    expect(history.memoryBytes).toBe(0);
    expect(history.isDirty).toBe(false);
  });

  it("round-trips dirty state around a saved history state", () => {
    const history = new CommandHistory<Counter>();
    const target = {value: 1};

    history.commit(command("first", 5, 1));
    expect(history.isDirty).toBe(true);

    history.markSaved();
    expect(history.isDirty).toBe(false);

    history.commit(command("second", 5, 1));
    expect(history.isDirty).toBe(true);
    history.undo(target);
    expect(history.isDirty).toBe(false);
    history.redo(target);
    expect(history.isDirty).toBe(true);
  });

  it("marks a restored state as unsaved until it is explicitly saved", () => {
    const history = new CommandHistory<Counter>();

    history.markDirty();
    expect(history.isDirty).toBe(true);
    expect(history.canUndo).toBe(false);

    history.markSaved();
    expect(history.isDirty).toBe(false);
  });

  it("marks the captured save state without hiding edits made while saving", () => {
    const history = new CommandHistory<Counter>();
    const target = {value: 2};
    history.commit(command("included in save", 1, 1));
    const savedState = history.stateID;

    history.commit(command("edited while saving", 1, 1));
    history.markSaved(savedState);
    expect(history.isDirty).toBe(true);

    history.undo(target);
    expect(history.isDirty).toBe(false);
    history.redo(target);
    expect(history.isDirty).toBe(true);
  });

  it("rejects invalid saved state identifiers", () => {
    const history = new CommandHistory<Counter>();
    expect(() => history.markSaved(-1)).toThrow("Saved history state is invalid");
    expect(() => history.markSaved(1)).toThrow("Saved history state is invalid");
    expect(history.isDirty).toBe(false);
  });

  it("clears redo on a new branch without reusing a saved state identity", () => {
    const history = new CommandHistory<Counter>();
    const target = {value: 3};
    const first = command("first", 1, 1);
    const savedBranch = command("saved-branch", 1, 1);
    const newBranch = command("new-branch", 1, 1);

    history.commit(first);
    history.commit(savedBranch);
    history.markSaved();
    history.undo(target);
    expect(history.isDirty).toBe(true);
    expect(history.canRedo).toBe(true);

    history.commit(newBranch);

    expect(history.canRedo).toBe(false);
    expect(history.redoCount).toBe(0);
    expect(history.isDirty).toBe(true);
    expect(history.undo(target)).toBe(newBranch);
    expect(history.isDirty).toBe(true);
    expect(history.redo(target)).toBe(newBranch);
    expect(history.isDirty).toBe(true);
  });

  it("lists reachable states and jumps non-linearly through undo and redo", () => {
    const history = new CommandHistory<Counter>();
    const target = {value: 6};
    history.commit(command("first", 1, 2));
    history.commit(command("second", 1, 4));
    history.markSaved();

    expect(history.states.map((state) => ({label: state.label, current: state.current, saved: state.saved}))).toEqual([
      {label: "Initial State", current: false, saved: false},
      {label: "first", current: false, saved: false},
      {label: "second", current: true, saved: true},
    ]);

    history.jumpTo(target, 0);
    expect(target.value).toBe(0);
    expect(history.stateID).toBe(0);
    history.jumpTo(target, 2);
    expect(target.value).toBe(6);
    expect(history.stateID).toBe(2);
    expect(() => history.jumpTo(target, 99)).toThrow("History state is not reachable");
  });

  it("evicts the oldest commands when the byte limit is exceeded", () => {
    const history = new CommandHistory<Counter>(10);

    history.commit(command("oldest", 4, 1));
    history.commit(command("middle", 4, 1));
    history.commit(command("latest", 4, 1));

    expect(history.memoryBytes).toBe(8);
    expect(history.undoCount).toBe(2);
    expect(history.undo({value: 3})?.label).toBe("latest");
    expect(history.undo({value: 2})?.label).toBe("middle");
    expect(history.undo({value: 1})).toBeNull();
  });

  it("keeps a single oversized latest command instead of discarding it", () => {
    const history = new CommandHistory<Counter>(10);

    history.commit(command("small", 4, 1));
    history.commit(command("oversized", 20, 1));

    expect(history.memoryBytes).toBe(20);
    expect(history.undoCount).toBe(1);
    expect(history.undo({value: 2})?.label).toBe("oversized");
    expect(history.undoCount).toBe(0);
  });

  it("rejects invalid command byte sizes without changing the stacks", () => {
    const history = new CommandHistory<Counter>();
    const valid = command("valid", 8, 1);
    history.commit(valid);

    for (const byteSize of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalid = command("invalid", byteSize, 1);
      expect(() => history.commit(invalid)).toThrow(/non-negative integer/);
      expect(history.undoCount).toBe(1);
      expect(history.redoCount).toBe(0);
      expect(history.memoryBytes).toBe(8);
    }
  });

  it("leaves history stacks and state unchanged when undo or redo throws", () => {
    const undoError = new Error("undo failed");
    const undoHistory = new CommandHistory<Counter>();
    const undoTarget = {value: 1};
    undoHistory.commit({
      label: "undo-error",
      byteSize: 4,
      undo() {
        throw undoError;
      },
      redo() {
        throw new Error("redo should not run");
      },
    });

    expect(() => undoHistory.undo(undoTarget)).toThrow(undoError);
    expect(undoTarget.value).toBe(1);
    expect(undoHistory.undoCount).toBe(1);
    expect(undoHistory.redoCount).toBe(0);
    expect(undoHistory.isDirty).toBe(true);

    const redoError = new Error("redo failed");
    const redoHistory = new CommandHistory<Counter>();
    const redoTarget = {value: 1};
    redoHistory.commit({
      label: "redo-error",
      byteSize: 4,
      undo(target) {
        target.value = 0;
      },
      redo() {
        throw redoError;
      },
    });
    redoHistory.markSaved();
    redoHistory.undo(redoTarget);

    expect(() => redoHistory.redo(redoTarget)).toThrow(redoError);
    expect(redoTarget.value).toBe(0);
    expect(redoHistory.undoCount).toBe(0);
    expect(redoHistory.redoCount).toBe(1);
    expect(redoHistory.isDirty).toBe(true);
  });
});

describe("PixelEditCommand", () => {
  it("applies before and after data to the exact Cel", () => {
    const document = createDocument({width: 4, height: 3});
    const targetCel = Object.values(document.cels)[0];
    const otherLayerId = "other-layer";
    const otherCel = createCel(otherLayerId, document.activeFrameId, 4, 3);
    otherCel.pixels.fill(77);
    document.cels[celKey(otherLayerId, document.activeFrameId)] = otherCel;

    const before = targetCel.pixels.slice();
    const after = before.slice();
    setPixel(after, targetCel.width, targetCel.height, 2, 1, [12, 34, 56, 255]);
    setPixel(after, targetCel.width, targetCel.height, 3, 2, [200, 100, 50, 128]);
    const patch = createPatch(before, after, targetCel.width, targetCel.height);

    expect(patch).not.toBeNull();
    if (patch === null) return;
    const edit = new PixelEditCommand(targetCel.id, patch, "paint");
    targetCel.pixels.set(after);

    edit.undo(document);
    expect(Array.from(targetCel.pixels)).toEqual(Array.from(before));
    expect(pixelAt(document, otherCel.id, 0, 0)).toEqual([77, 77, 77, 77]);

    edit.redo(document);
    expect(Array.from(targetCel.pixels)).toEqual(Array.from(after));
    expect(pixelAt(document, targetCel.id, 2, 1)).toEqual([12, 34, 56, 255]);
    expect(pixelAt(document, targetCel.id, 3, 2)).toEqual([200, 100, 50, 128]);
    expect(edit.byteSize).toBe(patch.before.byteLength + patch.after.byteLength + 64);
  });

  it("throws a useful error when its Cel no longer exists", () => {
    const document = createDocument({width: 2, height: 2});
    const patch = {
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      before: new Uint8ClampedArray(4),
      after: Uint8ClampedArray.from([1, 2, 3, 255]),
    };
    const edit = new PixelEditCommand("missing-cel", patch, "paint");

    expect(() => edit.undo(document)).toThrow("cel missing-cel does not exist");
    expect(() => edit.redo(document)).toThrow("cel missing-cel does not exist");
  });
});

describe("DocumentStateCommand", () => {
  it("restores structural and pixel state from defensive snapshots", () => {
    const target = createDocument({name: "target.pixio", width: 2, height: 1});
    const before = cloneDocument(target);
    const after = cloneDocument(target);
    const addedLayer = {
      id: "layer-after",
      name: "Highlights",
      visible: true,
      locked: false,
       opacity: 0.5,
       kind: "image" as const,
       blendMode: "normal" as const,
       role: "standard" as const,
       continuous: false,
       alphaLock: false,
    };
    after.layers.push(addedLayer);
    const addedCel = createCel(addedLayer.id, after.activeFrameId, after.width, after.height);
    setPixel(addedCel.pixels, after.width, after.height, 1, 0, [12, 34, 56, 255]);
    after.cels[celKey(addedLayer.id, after.activeFrameId)] = addedCel;
    after.activeLayerId = addedLayer.id;

    const command = new DocumentStateCommand(before, after, "add layer");

    // Mutating the caller-owned snapshots must not alter the command history.
    before.name = "mutated before";
    after.layers[0].name = "mutated after";
    target.name = "changed target";

    command.undo(target);
    expect(target.name).toBe("target.pixio");
    expect(target.layers).toHaveLength(1);
    expect(target.activeLayerId).toBe(before.activeLayerId);
    expect(Array.from(target.cels[celKey(target.activeLayerId, target.activeFrameId)].pixels)).toEqual([
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);

    target.layers[0].name = "mutated undo result";
    command.redo(target);
    expect(target.layers).toHaveLength(2);
    expect(target.activeLayerId).toBe("layer-after");
    expect(target.layers[1].name).toBe("Highlights");
    expect(Array.from(target.cels[celKey("layer-after", target.activeFrameId)].pixels)).toEqual([
      0, 0, 0, 0,
      12, 34, 56, 255,
    ]);
    expect(command.byteSize).toBeGreaterThan(0);
  });
});

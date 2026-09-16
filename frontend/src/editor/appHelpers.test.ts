import {describe, expect, it} from "vitest";
import {deserializePixelClipboard, enqueueSerialTask, orderFrameIDs, serializePixelClipboard} from "./appHelpers";

describe("system clipboard payloads", () => {
  it("round-trips an irregular selection mask", () => {
    const payload = serializePixelClipboard({
      width: 2,
      height: 2,
      pixels: Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]),
      mask: Uint8Array.from([1, 0, 0, 1]),
    });
    expect(deserializePixelClipboard(payload)).toEqual({
      width: 2,
      height: 2,
      pixels: Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]),
      mask: Uint8Array.from([1, 0, 0, 1]),
    });
  });

  it("round-trips soft selection coverage", () => {
    const payload = serializePixelClipboard({
      width: 3,
      height: 1,
      pixels: new Uint8ClampedArray(12),
      mask: Uint8Array.from([0, 128, 255]),
    });
    expect(deserializePixelClipboard(payload)?.mask).toEqual(Uint8Array.from([0, 128, 255]));
  });

  it("keeps legacy rectangular payloads without a mask valid", () => {
    const payload = serializePixelClipboard({
      width: 1,
      height: 2,
      pixels: Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]),
    });
    expect(deserializePixelClipboard(payload)).toEqual({
      width: 1,
      height: 2,
      pixels: Uint8ClampedArray.from([1, 2, 3, 255, 4, 5, 6, 255]),
    });
  });

  it("rejects masks with the wrong length or non-byte values", () => {
    const base = {format: "pixtorio-selection-v1", width: 2, height: 2, pixels: new Array(16).fill(0)};
    expect(deserializePixelClipboard(JSON.stringify({...base, mask: [1, 0, 1]}))).toBeNull();
    expect(deserializePixelClipboard(JSON.stringify({...base, mask: [1, 0, 256, 1]}))).toBeNull();
    expect(deserializePixelClipboard(JSON.stringify({...base, mask: null}))).toBeNull();
  });

  it("rejects malformed clipboard pixels", () => {
    expect(deserializePixelClipboard(JSON.stringify({
      format: "pixtorio-selection-v1",
      width: 1,
      height: 1,
      pixels: [0, 0, 0, 256],
    }))).toBeNull();
  });
});

describe("export frame ordering", () => {
  const frames = ["a", "b", "c", "d"];

  it("keeps forward order and reverses reverse tags", () => {
    expect(orderFrameIDs(frames, "forward")).toEqual(["a", "b", "c", "d"]);
    expect(orderFrameIDs(frames, "reverse")).toEqual(["d", "c", "b", "a"]);
  });

  it("does not duplicate ping-pong endpoints", () => {
    expect(orderFrameIDs(frames, "pingpong")).toEqual(["a", "b", "c", "d", "c", "b"]);
    expect(orderFrameIDs(["a", "b"], "pingpong")).toEqual(["a", "b"]);
    expect(orderFrameIDs(["a"], "pingpong")).toEqual(["a"]);
  });
});

describe("serialized tasks", () => {
  it("runs tasks for one key in request order", async () => {
    const queues = new Map<string, Promise<void>>();
    const calls: string[] = [];
    let releaseFirst!: () => void;
    let signalFirstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve; });

    const first = enqueueSerialTask(queues, "tab", async () => {
      calls.push("first:start");
      signalFirstStarted();
      await firstGate;
      calls.push("first:end");
    });
    const second = enqueueSerialTask(queues, "tab", async () => {
      calls.push("second:start");
      calls.push("second:end");
    });

    await firstStarted;
    expect(calls).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(calls).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("does not let a failed task block the next save", async () => {
    const queues = new Map<string, Promise<void>>();
    const calls: string[] = [];
    const failed = enqueueSerialTask(queues, "tab", async () => {
      calls.push("failed");
      throw new Error("disk full");
    });
    const next = enqueueSerialTask(queues, "tab", async () => { calls.push("next"); });

    await expect(failed).rejects.toThrow("disk full");
    await next;
    expect(calls).toEqual(["failed", "next"]);
  });
});

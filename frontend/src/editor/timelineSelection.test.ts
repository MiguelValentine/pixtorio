import {describe, expect, it} from "vitest";
import {
  addLayer,
  addLayerGroup,
  addFrame,
  celKey,
  createDocument,
  deleteFrame,
  deleteLayer,
} from "./document";
import {
  celSelectionKey,
  normalizeCelSelection,
  selectTimelineCel,
  selectedCelAddresses,
  type CelAddress,
} from "./timelineSelection";

function address(layerId: string, frameId: string): CelAddress {
  return {layerId, frameId};
}

function setupDocument() {
  const document = createDocument({name: "selection.pixio", width: 4, height: 4});
  const firstLayer = document.layers[0];
  const secondLayer = addLayer(document, "Layer 2");
  const group = addLayerGroup(document, "Group");
  const firstFrame = document.frames[0];
  const secondFrame = addFrame(document, 120);
  const thirdFrame = addFrame(document, 120);
  document.activeLayerId = firstLayer.id;
  document.activeFrameId = firstFrame.id;
  return {document, firstLayer, secondLayer, group, firstFrame, secondFrame, thirdFrame};
}

describe("selectedCelAddresses", () => {
  it("returns unique valid image cels in layer then frame order", () => {
    const {document, firstLayer, secondLayer, firstFrame, secondFrame} = setupDocument();
    const groupKey = celSelectionKey("missing-group", firstFrame.id);
    const keys = [
      celKey(secondLayer.id, secondFrame.id),
      celKey(firstLayer.id, secondFrame.id),
      celKey(secondLayer.id, secondFrame.id),
      groupKey,
      celKey("missing-layer", firstFrame.id),
    ];

    expect(selectedCelAddresses(document, keys)).toEqual([
      address(firstLayer.id, secondFrame.id),
      address(secondLayer.id, secondFrame.id),
    ]);
  });
});

describe("selectTimelineCel", () => {
  it("selects only the clicked cel without a modifier", () => {
    const {document, firstLayer, secondLayer, firstFrame, thirdFrame} = setupDocument();
    expect(selectTimelineCel(
      document,
      [secondLayer.id, firstLayer.id],
      [],
      null,
      address(firstLayer.id, thirdFrame.id),
      {},
    )).toEqual({
      keys: [celKey(firstLayer.id, thirdFrame.id)],
      anchor: address(firstLayer.id, thirdFrame.id),
    });
  });

  it("selects a closed rectangle in visible-row and frame-column order", () => {
    const {document, firstLayer, secondLayer, firstFrame, thirdFrame} = setupDocument();
    const result = selectTimelineCel(
      document,
      [secondLayer.id, firstLayer.id],
      [],
      address(secondLayer.id, firstFrame.id),
      address(firstLayer.id, thirdFrame.id),
      {extend: true},
    );

    expect(result.keys).toEqual([
      celKey(firstLayer.id, firstFrame.id),
      celKey(firstLayer.id, document.frames[1].id),
      celKey(firstLayer.id, thirdFrame.id),
      celKey(secondLayer.id, firstFrame.id),
      celKey(secondLayer.id, document.frames[1].id),
      celKey(secondLayer.id, thirdFrame.id),
    ]);
    expect(result.anchor).toEqual(address(secondLayer.id, firstFrame.id));
  });

  it("handles a reverse rectangle while keeping the original anchor", () => {
    const {document, firstLayer, secondLayer, firstFrame, thirdFrame} = setupDocument();
    const result = selectTimelineCel(
      document,
      [firstLayer.id, secondLayer.id],
      [],
      address(firstLayer.id, thirdFrame.id),
      address(secondLayer.id, firstFrame.id),
      {extend: true},
    );

    expect(result.keys).toHaveLength(6);
    expect(result.keys[0]).toBe(celKey(firstLayer.id, firstFrame.id));
    expect(result.keys.at(-1)).toBe(celKey(secondLayer.id, thirdFrame.id));
    expect(result.anchor).toEqual(address(firstLayer.id, thirdFrame.id));
  });

  it("adds and removes with Ctrl while protecting the active cel and last cell", () => {
    const {document, firstLayer, secondLayer, firstFrame, secondFrame} = setupDocument();
    const active = address(firstLayer.id, firstFrame.id);
    const added = selectTimelineCel(
      document,
      [firstLayer.id, secondLayer.id],
      [celKey(firstLayer.id, firstFrame.id)],
      active,
      address(secondLayer.id, secondFrame.id),
      {toggle: true, active},
    );
    expect(added.keys).toEqual([
      celKey(firstLayer.id, firstFrame.id),
      celKey(secondLayer.id, secondFrame.id),
    ]);

    const removed = selectTimelineCel(
      document,
      [firstLayer.id, secondLayer.id],
      added.keys,
      active,
      address(secondLayer.id, secondFrame.id),
      {toggle: true, active},
    );
    expect(removed.keys).toEqual([celKey(firstLayer.id, firstFrame.id)]);

    const cannotRemoveLast = selectTimelineCel(
      document,
      [firstLayer.id, secondLayer.id],
      removed.keys,
      active,
      active,
      {toggle: true, active: address(secondLayer.id, secondFrame.id)},
    );
    expect(cannotRemoveLast.keys).toEqual(removed.keys);
  });

  it("gives Shift priority over Ctrl and rejects group, missing, and hidden-row targets", () => {
    const {document, firstLayer, group, firstFrame, secondFrame} = setupDocument();
    const current = [celKey(firstLayer.id, firstFrame.id)];
    const target = address(firstLayer.id, secondFrame.id);
    expect(selectTimelineCel(document, [firstLayer.id], current, address(firstLayer.id, firstFrame.id), target, {
      extend: true,
      toggle: true,
    }).keys).toEqual([celKey(firstLayer.id, firstFrame.id), celKey(firstLayer.id, secondFrame.id)]);

    const groupTarget = selectTimelineCel(document, [firstLayer.id], current, null, address(group.id, firstFrame.id), {});
    expect(groupTarget.keys).toEqual(current);
    expect(groupTarget.anchor).toEqual(address(firstLayer.id, firstFrame.id));

    const hiddenTarget = selectTimelineCel(document, [firstLayer.id], current, null, address(document.layers[1].id, firstFrame.id), {});
    expect(hiddenTarget.keys).toEqual(current);
    expect(hiddenTarget.anchor).toEqual(address(firstLayer.id, firstFrame.id));

    const missingTarget = selectTimelineCel(document, [firstLayer.id], current, null, address(firstLayer.id, "deleted-frame"), {});
    expect(missingTarget.keys).toEqual(current);
  });
});

describe("normalizeCelSelection", () => {
  it("keeps cels scope non-empty by selecting the active image cel", () => {
    const {document, firstLayer, firstFrame, secondFrame} = setupDocument();
    document.activeLayerId = firstLayer.id;
    document.activeFrameId = secondFrame.id;

    expect(normalizeCelSelection(
      document,
      [celKey("deleted-layer", firstFrame.id)],
      address("deleted-layer", firstFrame.id),
      "cels",
    )).toEqual({
      keys: [celKey(firstLayer.id, secondFrame.id)],
      anchor: address(firstLayer.id, secondFrame.id),
    });
  });

  it("cleans removed layer/frame keys and anchors without forcing active cels outside cels scope", () => {
    const {document, firstLayer, secondLayer, firstFrame, secondFrame} = setupDocument();
    const removedLayerKey = celKey(secondLayer.id, firstFrame.id);
    const remainingKey = celKey(firstLayer.id, secondFrame.id);
    deleteLayer(document, secondLayer.id);
    deleteFrame(document, firstFrame.id);

    expect(normalizeCelSelection(
      document,
      [removedLayerKey, celKey(firstLayer.id, firstFrame.id), remainingKey],
      address(secondLayer.id, firstFrame.id),
      "frames",
    )).toEqual({
      keys: [remainingKey],
      anchor: address(firstLayer.id, secondFrame.id),
    });
  });
});

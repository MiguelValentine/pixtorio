import {describe, expect, it} from "vitest";

import {
  createTerrainMapData,
  createTerrainRuleTemplate,
  normalizeBlobMask,
  terrainRuleMasks,
  getTerrainCell,
  recalculateTerrainCells,
  resolveTerrainTile,
  setTerrainCell,
  terrainAffectedCells,
  terrainEmpty,
  terrainMaskAt,
  terrainRuleDiagnostic,
  tileFlipDiagonal,
  tileFlipX,
  tileIndexMask,
  validateTerrainDefinitions,
  type TerrainDefinition,
  type TerrainMapData,
} from "./terrain";
import type {TileCell, TileGridLayout} from "./tileGrid";

const orthogonal: TileGridLayout = {kind: "orthogonal", tileWidth: 16, tileHeight: 16};
const isometric: TileGridLayout = {kind: "isometric", tileWidth: 32, tileHeight: 16};
const pointyHexagonal: TileGridLayout = {
  kind: "hexagonal",
  tileWidth: 18,
  tileHeight: 16,
  orientation: "pointy",
  offset: "odd-r",
};

function candidate(tileId: number, weight = 1, flags = 0) {
  return {tileId, flags, weight};
}

function definition(
  overrides: Partial<TerrainDefinition> = {},
): TerrainDefinition {
  return {
    id: 1,
    name: "Grass",
    color: "#5cb85c",
    neighborMode: "edge4",
    boundary: "empty",
    rules: [{mask: 0, candidates: [candidate(10)]}],
    ...overrides,
  };
}

function fillTerrain(map: TerrainMapData, terrainId: number) {
  map.terrains.fill(terrainId);
  return map;
}

function cellKey(cell: TileCell) {
  return `${cell.column},${cell.row}`;
}

function actualAffectedCells(
  before: TerrainMapData,
  after: TerrainMapData,
  definitions: readonly TerrainDefinition[],
  grid: TileGridLayout,
  changedCells: readonly TileCell[],
): TileCell[] {
  const changed = new Set(changedCells.map(cellKey));
  const affected: TileCell[] = [];
  for (let row = 0; row < before.rows; row += 1) {
    for (let column = 0; column < before.columns; column += 1) {
      const cell = {column, row};
      if (changed.has(cellKey(cell)) || definitions.some((definition) => (
        terrainMaskAt(before, [definition], grid, column, row)
        !== terrainMaskAt(after, [definition], grid, column, row)
      ))) {
        affected.push(cell);
      }
    }
  }
  return affected;
}

describe("terrain rule engine", () => {
  it("reports missing masks and generates deterministic rule templates", () => {
    const terrain = definition({
      rules: [
        {mask: 0, candidates: [candidate(1)]},
        {mask: 3, candidates: [candidate(2)]},
      ],
    });
    const diagnostic = terrainRuleDiagnostic(terrain);
    expect(diagnostic.maximumMask).toBe(15);
    expect(diagnostic.coveredMasks).toEqual([0, 3]);
    expect(diagnostic.missingMasks).toHaveLength(14);
    expect(diagnostic.duplicateMasks).toEqual([]);
    expect(diagnostic.invalidMasks).toEqual([]);
    expect(diagnostic.invalidCandidates).toEqual([]);
    expect(createTerrainRuleTemplate("edge6", candidate(7, 2, tileFlipX), [5, 0])).toEqual([
      {mask: 0, candidates: [{tileId: 7, flags: tileFlipX >>> 0, weight: 2}]},
      {mask: 5, candidates: [{tileId: 7, flags: tileFlipX >>> 0, weight: 2}]},
    ]);
  });

  it("diagnoses duplicate masks, unknown tiles, invalid flags, weights, and mask ranges", () => {
    const terrain = definition({
      rules: [
        {mask: 0, candidates: [candidate(1), {tileId: 9, flags: tileFlipDiagonal, weight: 0}]},
        {mask: 0, candidates: [candidate(1)]},
        {mask: 16, candidates: [candidate(1)]},
      ],
    });
    const diagnostic = terrainRuleDiagnostic(terrain, {tileIds: [1], tileWidth: 2, tileHeight: 1});
    expect(diagnostic.duplicateMasks).toEqual([0]);
    expect(diagnostic.invalidMasks).toEqual([16]);
    expect(diagnostic.invalidCandidates).toEqual([
      {mask: 0, candidateIndex: 1, reason: "tile"},
      {mask: 0, candidateIndex: 1, reason: "flags"},
      {mask: 0, candidateIndex: 1, reason: "weight"},
    ]);
  });

  it("creates, gets, and sets logical Terrain cells without changing the document model", () => {
    const map = createTerrainMapData(3, 2, 37);

    expect(map).toMatchObject({columns: 3, rows: 2, seed: 37});
    expect(map.terrains).toBeInstanceOf(Uint16Array);
    expect(getTerrainCell(map, 2, 1)).toBe(0);
    const updated = setTerrainCell(map, 2, 1, 65535);
    expect(updated).not.toBe(map);
    expect(getTerrainCell(map, 2, 1)).toBe(0);
    expect(getTerrainCell(updated, 2, 1)).toBe(65535);
  });

  it("distinguishes unspecified, explicit empty, and concrete Terrain cells", () => {
    const map = createTerrainMapData(3, 1, 7);
    map.terrains.set([0, terrainEmpty, 1]);
    const terrain = definition({rules: [{mask: 0, candidates: [candidate(3)]}]});
    const grid: TileGridLayout = {kind: "orthogonal", tileWidth: 1, tileHeight: 1};
    expect([...map.terrains]).toEqual([0, 65535, 1]);
    expect(resolveTerrainTile(map, [terrain], grid, 0, 0)).toBe(0);
    expect(resolveTerrainTile(map, [terrain], grid, 1, 0)).toBe(0);
    expect(terrainMaskAt(map, [terrain], grid, 1, 0)).toBe(0);
    expect(resolveTerrainTile(map, [terrain], grid, 2, 0)).toBe(3);
    expect(() => validateTerrainDefinitions([{...terrain, id: terrainEmpty}], grid)).toThrow(/65534/);
  });

  it("validates ids, masks, candidates, duplicate rules, and grid combinations", () => {
    expect(validateTerrainDefinitions([definition()], orthogonal)).toBe(true);
    expect(validateTerrainDefinitions([definition({neighborMode: "blob8"})], orthogonal)).toBe(true);
    expect(validateTerrainDefinitions([definition({neighborMode: "edge4"})], isometric)).toBe(true);
    expect(validateTerrainDefinitions([definition({neighborMode: "edge6"})], pointyHexagonal)).toBe(true);

    expect(() => validateTerrainDefinitions([definition({id: 0})], orthogonal)).toThrow("Terrain id");
    expect(() => validateTerrainDefinitions([definition({id: 65536})], orthogonal)).toThrow("Terrain id");
    expect(() => validateTerrainDefinitions([definition({rules: [{mask: 16, candidates: [candidate(1)]}]})], orthogonal)).toThrow("mask");
    expect(() => validateTerrainDefinitions([definition({rules: [
      {mask: 0, candidates: [candidate(1)]},
      {mask: 0, candidates: [candidate(2)]},
    ]})], orthogonal)).toThrow("unique");
    expect(() => validateTerrainDefinitions([definition({rules: [{mask: 0, candidates: [candidate(0)]}]})], orthogonal)).toThrow("tile id");
    expect(() => validateTerrainDefinitions([definition({rules: [{mask: 0, candidates: [candidate(1, 0)]}]})], orthogonal)).toThrow("weight");
    expect(() => validateTerrainDefinitions([definition({rules: [{mask: 0, candidates: [candidate(1, 1, tileIndexMask)]}]})], orthogonal)).toThrow("flags");
    expect(() => validateTerrainDefinitions([definition({neighborMode: "blob8"})], isometric)).toThrow("edge4");
    expect(() => validateTerrainDefinitions([definition({neighborMode: "edge6"})], orthogonal)).toThrow("edge6");
    expect(() => validateTerrainDefinitions([definition({neighborMode: "edge4"})], pointyHexagonal)).toThrow("edge6");
  });

  it("computes orthogonal edge4 masks in north/east/south/west order", () => {
    const map = fillTerrain(createTerrainMapData(3, 3), 1);
    let changedMap = setTerrainCell(map, 1, 0, 0);
    changedMap = setTerrainCell(changedMap, 2, 1, 0);
    changedMap = setTerrainCell(changedMap, 1, 2, 0);
    changedMap = setTerrainCell(changedMap, 0, 1, 0);
    const terrain = definition({rules: [{mask: 0, candidates: [candidate(1)]}]});

    expect(terrainMaskAt(changedMap, [terrain], orthogonal, 1, 1)).toBe(0);
    expect(resolveTerrainTile(changedMap, [terrain], orthogonal, 1, 1)).toBe(1);
  });

  it("computes orthogonal blob8 masks and supports isometric edge4", () => {
    const map = fillTerrain(createTerrainMapData(3, 3), 1);
    const changedMap = setTerrainCell(map, 0, 0, 0);
    const blob = definition({
      neighborMode: "blob8",
      rules: [{mask: 0, candidates: [candidate(11)]}, {mask: 0b01111111, candidates: [candidate(12)]}],
    });
    expect(terrainMaskAt(changedMap, [blob], orthogonal, 1, 1)).toBe(0b01111111);
    expect(resolveTerrainTile(changedMap, [blob], orthogonal, 1, 1)).toBe(12);

    const isoMap = fillTerrain(createTerrainMapData(2, 2), 1);
    const changedIsoMap = setTerrainCell(isoMap, 0, 1, 0);
    const iso = definition({rules: [{mask: 0b0010, candidates: [candidate(13)]}]});
    expect(terrainMaskAt(changedIsoMap, [iso], isometric, 0, 0)).toBe(0b0010);
    expect(resolveTerrainTile(changedIsoMap, [iso], isometric, 0, 0)).toBe(13);
  });

  it("reduces every raw eight-neighbor configuration to one of exactly 47 Blob rules", () => {
    const offsets = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const masks = terrainRuleMasks("blob8");
    expect(masks).toHaveLength(47);
    expect(terrainRuleMasks("edge4")).toHaveLength(16);
    expect(terrainRuleMasks("edge6")).toHaveLength(64);
    const terrain = definition({neighborMode: "blob8",
      rules: masks.map((mask) => ({mask, candidates: [candidate(mask + 1)]})),
    });
    const observed = new Set<number>();
    for (let raw = 0; raw < 256; raw += 1) {
      const map = createTerrainMapData(3, 3);
      map.terrains[4] = 1;
      offsets.forEach(([x, y], bit) => {
        map.terrains[(1 + y) * 3 + 1 + x] = (raw & (1 << bit)) ? 1 : 0;
      });
      let expected = raw & 0x55;
      if ((raw & 0x07) === 0x07) expected |= 0x02;
      if ((raw & 0x1c) === 0x1c) expected |= 0x08;
      if ((raw & 0x70) === 0x70) expected |= 0x20;
      if ((raw & 0xc1) === 0xc1) expected |= 0x80;
      expect(normalizeBlobMask(raw)).toBe(expected);
      expect(normalizeBlobMask(expected)).toBe(expected);
      expect(terrainMaskAt(map, [terrain], orthogonal, 1, 1)).toBe(expected);
      expect(resolveTerrainTile(map, [terrain], orthogonal, 1, 1)).toBe(expected + 1);
      observed.add(expected);
    }
    expect([...observed].sort((a, b) => a - b)).toEqual(masks);
  });

  it("generates and diagnoses the standard Blob template and rejects unsupported corner rules", () => {
    const rules = createTerrainRuleTemplate("blob8", candidate(1));
    expect(rules).toHaveLength(47);
    const blob = definition({neighborMode: "blob8", rules});
    expect(validateTerrainDefinitions([blob], orthogonal)).toBe(true);
    expect(terrainRuleDiagnostic(blob).missingMasks).toEqual([]);
    expect(terrainRuleDiagnostic(blob).coveredMasks).toHaveLength(47);
    expect(terrainRuleDiagnostic({...blob, rules: [...rules, {mask: 2, candidates: [candidate(1)]}]}).invalidMasks).toEqual([2]);
    expect(() => validateTerrainDefinitions([{...blob, rules: [{mask: 2, candidates: [candidate(1)]}]}], orthogonal)).toThrow(/mask/);
    expect(() => createTerrainRuleTemplate("blob8", candidate(1), [2])).toThrow(/mask/);
    expect(() => normalizeBlobMask(256)).toThrow(/mask/);
  });

  it("computes six logical hex neighbors for pointy and flat grids", () => {
    const hexGrids: TileGridLayout[] = [
      pointyHexagonal,
      {...pointyHexagonal, offset: "even-r"},
      {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "flat", offset: "odd-q"},
      {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "flat", offset: "even-q"},
    ];

    for (const grid of hexGrids) {
      const map = fillTerrain(createTerrainMapData(3, 3), 1);
      const terrain = definition({neighborMode: "edge6", rules: [{mask: 0x3f, candidates: [candidate(14)]}]});
      expect(terrainMaskAt(map, [terrain], grid, 1, 1)).toBe(0x3f);
      expect(resolveTerrainTile(map, [terrain], grid, 1, 1)).toBe(14);
    }
  });

  it("implements empty, same, and wrap boundaries", () => {
    const emptyMap = fillTerrain(createTerrainMapData(2, 2), 1);
    const empty = definition({boundary: "empty", rules: [{mask: 0, candidates: [candidate(20)]}]});
    expect(terrainMaskAt(emptyMap, [empty], orthogonal, 0, 0)).toBe(0b0110);

    const same = definition({boundary: "same", rules: [{mask: 0b1001, candidates: [candidate(21)]}]});
    expect(terrainMaskAt(emptyMap, [same], orthogonal, 0, 0)).toBe(0b1111);

    const wrapMap = fillTerrain(createTerrainMapData(2, 1), 1);
    const changedWrapMap = setTerrainCell(wrapMap, 1, 0, 0);
    const wrap = definition({boundary: "wrap", rules: [{mask: 0b0101, candidates: [candidate(22)]}]});
    expect(terrainMaskAt(changedWrapMap, [wrap], orthogonal, 0, 0)).toBe(0b0101);
    expect(resolveTerrainTile(changedWrapMap, [wrap], orthogonal, 0, 0)).toBe(22);
  });

  it("exposes exact edge4 and blob8 affected cells, including diagonal wrap", () => {
    const map = fillTerrain(createTerrainMapData(4, 4), 1);
    const changedCells = [{column: 1, row: 1}];
    const edge4 = definition({boundary: "empty"});
    const blob8 = definition({neighborMode: "blob8", boundary: "empty"});

    expect(terrainAffectedCells(map, [edge4], orthogonal, changedCells)).toEqual([
      {column: 1, row: 0},
      {column: 0, row: 1},
      {column: 1, row: 1},
      {column: 2, row: 1},
      {column: 1, row: 2},
    ]);
    expect(terrainAffectedCells(map, [blob8], orthogonal, changedCells)).toEqual([
      {column: 0, row: 0},
      {column: 1, row: 0},
      {column: 2, row: 0},
      {column: 0, row: 1},
      {column: 1, row: 1},
      {column: 2, row: 1},
      {column: 0, row: 2},
      {column: 1, row: 2},
      {column: 2, row: 2},
    ]);

    const wrapMap = fillTerrain(createTerrainMapData(4, 4), 1);
    const wrapChangedCells = [{column: 0, row: 0}];
    const wrapChangedMap = setTerrainCell(wrapMap, 0, 0, 0);
    const wrapBlob8 = definition({neighborMode: "blob8", boundary: "wrap"});
    const expected = actualAffectedCells(wrapMap, wrapChangedMap, [wrapBlob8], orthogonal, wrapChangedCells);

    expect(terrainAffectedCells({columns: 4, rows: 4}, [wrapBlob8], orthogonal, wrapChangedCells)).toEqual(expected);
    expect(expected).toEqual([
      {column: 0, row: 0},
      {column: 1, row: 0},
      {column: 3, row: 0},
      {column: 0, row: 1},
      {column: 1, row: 1},
      {column: 3, row: 1},
      {column: 0, row: 3},
      {column: 1, row: 3},
      {column: 3, row: 3},
    ]);
  });

  it("matches actual edge6 dependencies at odd/even hex wrap boundaries", () => {
    const cases: Array<{grid: TileGridLayout; columns: number; rows: number}> = [
      {grid: pointyHexagonal, columns: 4, rows: 3},
      {grid: {...pointyHexagonal, offset: "even-r"}, columns: 4, rows: 3},
      {grid: {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "flat", offset: "odd-q"}, columns: 3, rows: 4},
      {grid: {kind: "hexagonal", tileWidth: 18, tileHeight: 16, orientation: "flat", offset: "even-q"}, columns: 3, rows: 4},
    ];
    const terrain = definition({neighborMode: "edge6", boundary: "wrap"});

    for (const {grid, columns, rows} of cases) {
      const before = fillTerrain(createTerrainMapData(columns, rows), 1);
      const changedCells = [{column: 0, row: 0}];
      const after = setTerrainCell(before, 0, 0, 0);
      const expected = actualAffectedCells(before, after, [terrain], grid, changedCells);

      expect(terrainAffectedCells({columns, rows}, [terrain], grid, changedCells)).toEqual(expected);
      expect(expected).toHaveLength(7);
    }
  });

  it("validates dimensions and changed cells like terrain recalculation", () => {
    const terrain = definition();
    expect(() => terrainAffectedCells({columns: 0, rows: 2}, [terrain], orthogonal, [])).toThrow("dimensions");
    expect(() => terrainAffectedCells({columns: 2, rows: 2}, [terrain], orthogonal, [{column: 2, row: 0}])).toThrow("outside");
    expect(() => terrainAffectedCells({columns: 2, rows: 2}, [terrain], orthogonal, null as unknown as TileCell[])).toThrow("changed cells");
  });

  it("uses fixed seed and coordinate hashes for repeatable weighted variants", () => {
    const terrain = definition({
      rules: [{mask: 0, candidates: [candidate(30, 1), candidate(31, 3, tileFlipX)]}],
    });
    const first = fillTerrain(createTerrainMapData(8, 4, 12345), 1);
    const second = fillTerrain(createTerrainMapData(8, 4, 12345), 1);
    const differentSeed = fillTerrain(createTerrainMapData(8, 4, 54321), 1);
    const firstValues: number[] = [];
    const secondValues: number[] = [];
    const differentValues: number[] = [];
    for (let row = 0; row < first.rows; row += 1) {
      for (let column = 0; column < first.columns; column += 1) {
        firstValues.push(resolveTerrainTile(first, [terrain], orthogonal, column, row));
        secondValues.push(resolveTerrainTile(second, [terrain], orthogonal, column, row));
        differentValues.push(resolveTerrainTile(differentSeed, [terrain], orthogonal, column, row));
      }
    }
    expect(firstValues).toEqual(secondValues);
    expect(new Set(firstValues)).toEqual(new Set([30, (31 | tileFlipX) >>> 0]));
    expect(differentValues).not.toEqual(firstValues);
  });

  it("falls back deterministically when a mask rule is missing", () => {
    const map = fillTerrain(createTerrainMapData(3, 3, 7), 1);
    const terrain = definition({
      rules: [
        {mask: 0, candidates: [candidate(40)]},
        {mask: 0b0100, candidates: [candidate(41)]},
      ],
    });
    const changedMap = setTerrainCell(map, 0, 0, 0);
    expect(terrainMaskAt(changedMap, [terrain], orthogonal, 1, 1)).toBe(0b1111);
    expect(resolveTerrainTile(changedMap, [terrain], orthogonal, 1, 1)).toBe(40);

    const noRules = definition({rules: []});
    expect(resolveTerrainTile(changedMap, [noRules], orthogonal, 1, 1)).toBe(0);
  });

  it("recalculates only the changed cells and one ring, matching a full rebuild", () => {
    const terrain = definition({
      neighborMode: "blob8",
      rules: [
        {mask: 0, candidates: [candidate(50)]},
        {mask: 0xff, candidates: [candidate(51)]},
      ],
    });
    const map = fillTerrain(createTerrainMapData(6, 5, 91), 1);
    const before = fillTerrain(createTerrainMapData(6, 5, 91), 1);
    const localCells = new Uint32Array(map.columns * map.rows);
    recalculateTerrainCells(before, [terrain], orthogonal, localCells, Array.from({length: map.columns * map.rows}, (_, index) => ({
      column: index % map.columns,
      row: Math.floor(index / map.columns),
    })));
    const fullCells = localCells.slice();
    const changed = [{column: 2, row: 2}];
    const changedMap = setTerrainCell(map, 2, 2, 0);

    const localChanged = recalculateTerrainCells(changedMap, [terrain], orthogonal, localCells, changed);
    recalculateTerrainCells(changedMap, [terrain], orthogonal, fullCells, Array.from({length: map.columns * map.rows}, (_, index) => ({
      column: index % map.columns,
      row: Math.floor(index / map.columns),
    })));

    expect([...localCells]).toEqual([...fullCells]);
    expect(localChanged).toContainEqual({column: 2, row: 2});
    expect(localChanged.every(({column, row}) => Math.abs(column - 2) <= 1 && Math.abs(row - 2) <= 1)).toBe(true);
    expect(localChanged).not.toContainEqual({column: 0, row: 0});
  });

  it("wraps the recalculation ring across map edges", () => {
    const terrain = definition({
      boundary: "wrap",
      rules: [
        {mask: 0, candidates: [candidate(60)]},
        {mask: 0b1101, candidates: [candidate(61)]},
      ],
    });
    const map = fillTerrain(createTerrainMapData(3, 1), 1);
    const cells = new Uint32Array(3);
    const changedMap = setTerrainCell(map, 0, 0, 0);
    const changed = recalculateTerrainCells(changedMap, [terrain], orthogonal, cells, [{column: 0, row: 0}]);

    expect(changed).toContainEqual({column: 2, row: 0});
    expect(cells[2]).toBe(61);
  });
});

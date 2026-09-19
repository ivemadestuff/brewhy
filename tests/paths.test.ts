import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formulaID } from "../src/brew/ids.js";
import { buildGraph } from "../src/graph/graph.js";
import { buildReachability, reconstructPath, shortestPathsFrom } from "../src/graph/paths.js";
import { inventoryOf } from "./helpers.js";

describe("shortestPathsFrom", () => {
  it("reconstructs the shortest path to a transitive dependency", () => {
    const graph = buildGraph(inventoryOf("installed-basic"));
    const predecessor = shortestPathsFrom(graph, formulaID("node"));
    assert.deepEqual(reconstructPath(predecessor, formulaID("ca-certificates")), [
      formulaID("node"),
      formulaID("openssl@3"),
      formulaID("ca-certificates"),
    ]);
  });

  it("returns null for unreachable nodes", () => {
    const graph = buildGraph(inventoryOf("installed-basic"));
    const predecessor = shortestPathsFrom(graph, formulaID("bat"));
    assert.equal(reconstructPath(predecessor, formulaID("openssl@3")), null);
  });

  it("terminates on a cyclic graph", () => {
    const graph = buildGraph(inventoryOf("installed-cyclic"));
    const predecessor = shortestPathsFrom(graph, formulaID("root"));
    assert.deepEqual(reconstructPath(predecessor, formulaID("loop-b")), [
      formulaID("root"),
      formulaID("loop-a"),
      formulaID("loop-b"),
    ]);
  });

  it("prefers the lexicographically smallest shortest path on ties", () => {
    const graph = buildGraph(inventoryOf("installed-shared"));
    const predecessor = shortestPathsFrom(graph, formulaID("a-tool"));
    assert.deepEqual(reconstructPath(predecessor, formulaID("ncurses")), [
      formulaID("a-tool"),
      formulaID("common-lib"),
      formulaID("ncurses"),
    ]);
  });
});

describe("buildReachability", () => {
  it("lists every reason source that reaches a node, excluding itself", () => {
    const inventory = inventoryOf("installed-shared");
    const graph = buildGraph(inventory);
    const reachability = buildReachability(graph, [
      ...graph.requestedRootIDs,
      ...graph.topLevelCaskIDs,
    ]);
    assert.deepEqual(reachability.sourcesByNode.get(formulaID("common-lib")), [
      formulaID("a-tool"),
      formulaID("b-tool"),
      formulaID("c-tool"),
      formulaID("d-tool"),
    ]);
    assert.equal(
      reachability.sourcesByNode.get(formulaID("a-tool")),
      undefined,
      "a root is not its own reason source",
    );
  });
});

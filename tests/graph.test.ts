import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { caskID, formulaID } from "../src/brew/ids.js";
import { buildGraph } from "../src/graph/graph.js";
import { inventoryOf } from "./helpers.js";

describe("buildGraph", () => {
  it("indexes forward and reverse edges", () => {
    const graph = buildGraph(inventoryOf("installed-basic"));
    assert.deepEqual(graph.edges.get(formulaID("wget")), [formulaID("openssl@3")]);
    assert.deepEqual(graph.reverse.get(formulaID("openssl@3")), [
      formulaID("node"),
      formulaID("wget"),
    ]);
    assert.deepEqual(graph.reverse.get(formulaID("bat")), []);
  });

  it("collects requested formulae as roots", () => {
    const graph = buildGraph(inventoryOf("installed-basic"));
    assert.deepEqual(graph.requestedRootIDs, [
      formulaID("bat"),
      formulaID("node"),
      formulaID("wget"),
    ]);
  });

  it("treats only casks without a cask dependent as top-level sources", () => {
    const graph = buildGraph(inventoryOf("installed-cask-context"));
    assert.deepEqual(graph.topLevelCaskIDs, [
      caskID("parent-app"),
      caskID("podman-desktop"),
      caskID("standalone-app"),
    ]);
  });

  it("does not treat mutually requiring casks as top-level", () => {
    const graph = buildGraph(inventoryOf("installed-cask-cyclic"));
    assert.deepEqual(graph.topLevelCaskIDs, []);
  });

  it("includes cask nodes alongside formula nodes", () => {
    const graph = buildGraph(inventoryOf("installed-cask-context"));
    assert.equal(graph.edges.size, 5 + 4);
  });

  it("copies forward adjacency so graph mutation cannot change inventory nodes", () => {
    const inventory = inventoryOf("installed-basic");
    const wget = inventory.formulae.get(formulaID("wget"));
    assert.ok(wget);
    const original = [...wget.dependencies];
    const graph = buildGraph(inventory);
    const edges = graph.edges.get(formulaID("wget"));
    assert.ok(edges);
    edges.push(formulaID("bat"));
    assert.deepEqual(wget.dependencies, original);
    assert.deepEqual([...edges].sort(), [...original, formulaID("bat")].sort());
  });
});

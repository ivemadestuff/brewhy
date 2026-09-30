import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../src/app.js";
import { formulaID } from "../src/brew/ids.js";
import { parseInventory } from "../src/brew/parser.js";
import { analyze } from "../src/graph/classify.js";
import { buildGraph } from "../src/graph/graph.js";
import { StaticBrewClient, analysisOf, loadFixture, runFixture } from "./helpers.js";

const fixtureName = "installed-runtime-chain";

describe("direct dependency explanations", () => {
  it("keeps ripgrep between opencode and pcre2 in analysis and JSON", async () => {
    const analysis = analysisOf(fixtureName);
    const pcre = analysis.byID.get(formulaID("pcre2"));
    assert.ok(pcre);
    assert.deepEqual(
      pcre.immediateDependents.map((source) => source.ID),
      [formulaID("ripgrep")],
    );
    assert.deepEqual(
      pcre.reasonPaths.map((reason) => reason.path),
      [["opencode", "ripgrep", "pcre2"]],
    );
    const result = await runFixture(fixtureName, ["pcre2", "--json"]);
    const data = JSON.parse(result.stdout);
    assert.deepEqual(data.package.immediateDependents, [formulaID("ripgrep")]);
    assert.deepEqual(data.package.reasonPaths, [
      {
        source: formulaID("opencode"),
        path: [formulaID("opencode"), formulaID("ripgrep"), formulaID("pcre2")],
      },
    ]);
    assert.equal(result.stderr, "");
  });

  it("shows the actual chain in text without changing the overview counts", async () => {
    const result = await runFixture(fixtureName, ["pcre2"]);
    assert.match(result.stdout, /^Directly required by\s+ripgrep$/m);
    assert.match(result.stdout, /opencode → ripgrep → pcre2/);
    const analysis = analysisOf(fixtureName);
    assert.deepEqual(analysis.summary, {
      total: 3,
      requested: 1,
      automatic: 2,
      unknown: 0,
      shared: 0,
      unexplained: 0,
    });
    assert.deepEqual(analysis.roots[0]?.dependencies, [formulaID("pcre2"), formulaID("ripgrep")]);
    assert.deepEqual(analysis.roots[0]?.exclusive, analysis.roots[0]?.dependencies);
  });

  for (const missing of ["runtime_dependencies", "declared_directly"] as const) {
    it(`preserves the reason without inventing a path when ${missing} is missing`, async () => {
      const fixture = loadFixture(fixtureName);
      const keg = fixture.info.formulae?.find((entry) => entry.name === "ripgrep")?.installed?.[0];
      assert.ok(keg?.runtime_dependencies?.[0]);
      if (missing === "runtime_dependencies") delete keg.runtime_dependencies;
      else delete keg.runtime_dependencies[0].declared_directly;
      const inventory = parseInventory(fixture.info, fixture.installed_on_request);
      const analysis = analyze(inventory, buildGraph(inventory));
      const pcre = analysis.byID.get(formulaID("pcre2"));
      assert.ok(pcre);
      assert.equal(pcre.isUnexplained, false);
      assert.deepEqual(
        pcre.requestedFormulaRoots.map((source) => source.ID),
        [formulaID("opencode")],
      );
      assert.deepEqual(pcre.immediateDependents, []);
      assert.deepEqual(pcre.reasonPaths, []);
      assert.ok(analysis.roots[0]?.dependencies.includes(formulaID("pcre2")));
      const result = await run(["pcre2", "--json"], {
        client: new StaticBrewClient(fixture.info, fixture.installed_on_request),
        isTTY: false,
        width: 80,
        version: "test",
      });
      assert.equal(result.exitCode, 0);
      assert.deepEqual(JSON.parse(result.stdout).package.reasonPaths, []);
      assert.match(result.stderr, /dependency paths are unknown/);
    });
  }

  it("keeps a declared direct edge even when a longer path also exists", () => {
    const fixture = loadFixture(fixtureName);
    const dependency = fixture.info.formulae?.[0]?.installed?.[0]?.runtime_dependencies?.find(
      (entry) => entry.full_name === "pcre2",
    );
    assert.ok(dependency);
    dependency.declared_directly = true;
    const inventory = parseInventory(fixture.info, fixture.installed_on_request);
    const analysis = analyze(inventory, buildGraph(inventory));
    const pcre = analysis.byID.get(formulaID("pcre2"));
    assert.deepEqual(
      pcre?.immediateDependents.map((source) => source.name),
      ["opencode", "ripgrep"],
    );
    assert.deepEqual(pcre?.reasonPaths[0]?.path, ["opencode", "pcre2"]);
  });
});

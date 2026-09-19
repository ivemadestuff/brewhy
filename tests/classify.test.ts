import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { caskID, formulaID } from "../src/brew/ids.js";
import { analysisOf } from "./helpers.js";

describe("analyze", () => {
  it("falls back to the fully qualified name when two formulae share a short one", () => {
    const analysis = analysisOf("installed-tap-names");
    const labels = [...analysis.labels.values()];
    assert.ok(labels.includes("acme/tap/helper"), "the ambiguous one is qualified");
    assert.ok(labels.includes("helper"), "its homebrew/core twin keeps the short name");
    assert.ok(labels.includes("widget"), "an unambiguous tap formula stays short");
  });

  it("keeps intent and graph role independent", () => {
    const analysis = analysisOf("installed-shared");
    const readline = analysis.byID.get(formulaID("readline"));
    assert.ok(readline);
    assert.equal(readline.intent, "requested");
    assert.deepEqual(
      readline.immediateDependents.map((source) => source.name),
      ["a-tool"],
    );
  });

  it("reports every distinct reason source for a shared dependency", () => {
    const analysis = analysisOf("installed-shared");
    const common = analysis.byID.get(formulaID("common-lib"));
    assert.ok(common);
    assert.equal(common.isShared, true);
    assert.deepEqual(
      common.requestedFormulaRoots.map((source) => source.name),
      ["a-tool", "b-tool", "c-tool", "d-tool"],
    );
    assert.equal(common.reasonPaths.length, 4);
    assert.deepEqual(common.reasonPaths[0], {
      source: "a-tool",
      sourceType: "formula",
      path: ["a-tool", "common-lib"],
      pathTypes: ["formula", "formula"],
    });
  });

  it("computes one shortest path per reason source", () => {
    const analysis = analysisOf("installed-basic");
    const certificates = analysis.byID.get(formulaID("ca-certificates"));
    assert.ok(certificates);
    assert.deepEqual(
      certificates.reasonPaths.map((reasonPath) => reasonPath.path.join(" -> ")),
      ["node -> openssl@3 -> ca-certificates", "wget -> openssl@3 -> ca-certificates"],
    );
  });

  it("explains a formula required only by an installed cask", () => {
    const analysis = analysisOf("installed-cask-context");
    const podman = analysis.byID.get(formulaID("podman"));
    assert.ok(podman);
    assert.equal(podman.intent, "automatic");
    assert.equal(podman.isUnexplained, false);
    assert.deepEqual(podman.requestedFormulaRoots, []);
    assert.deepEqual(
      podman.caskReasonSources.map((source) => source.name),
      ["podman-desktop"],
    );
    assert.deepEqual(podman.reasonPaths[0]?.pathTypes, ["cask", "formula"]);
    assert.deepEqual(
      podman.immediateDependents.map((source) => `${source.name}:${source.type}`),
      ["podman-desktop:cask"],
    );
  });

  it("explains a formula reached through a nested cask", () => {
    const analysis = analysisOf("installed-cask-context");
    const helper = analysis.byID.get(formulaID("helper-lib"));
    assert.ok(helper);
    assert.deepEqual(
      helper.caskReasonSources.map((source) => source.name),
      ["parent-app"],
    );
    assert.deepEqual(helper.reasonPaths[0]?.path, ["parent-app", "child-app", "helper-lib"]);
  });

  it("marks a formula with no reason source as unexplained, never removable", () => {
    const analysis = analysisOf("installed-incomplete");
    const gamma = analysis.byID.get(formulaID("gamma"));
    assert.ok(gamma);
    assert.equal(gamma.isUnexplained, true);
    assert.equal(gamma.isShared, false);
  });

  it("never marks a requested formula unexplained", () => {
    const analysis = analysisOf("installed-incomplete");
    for (const facts of analysis.packages) {
      if (facts.intent === "requested") assert.equal(facts.isUnexplained, false);
    }
  });

  it("summarises the inventory as a partition of requested, automatic and unknown", () => {
    const analysis = analysisOf("installed-basic");
    assert.deepEqual(analysis.summary, {
      total: 9,
      requested: 3,
      automatic: 6,
      unknown: 0,
      shared: 2,
      unexplained: 0,
    });
    const { requested, automatic, unknown, total } = analysis.summary;
    assert.equal(requested + automatic + unknown, total);
  });

  it("counts an intent Homebrew never exposed as unknown, not automatic", () => {
    const analysis = analysisOf("installed-incomplete", null);
    assert.equal(analysis.byID.get(formulaID("epsilon"))?.intent, "unknown");
    assert.equal(analysis.summary.unknown, 1);
    const { requested, automatic, unknown, total } = analysis.summary;
    assert.equal(requested + automatic + unknown, total);
  });

  it("orders packages deterministically", () => {
    const analysis = analysisOf("installed-basic");
    assert.deepEqual(
      analysis.packages.map((facts) => facts.label),
      [
        "bat",
        "ca-certificates",
        "icu4c",
        "libuv",
        "libyaml",
        "node",
        "oniguruma",
        "openssl@3",
        "wget",
      ],
    );
  });

  it("stores explained formulae as node IDs, not display labels", () => {
    const analysis = analysisOf("installed-basic");
    const bat = analysis.roots.find((root) => root.ID === formulaID("bat"));
    assert.ok(bat);
    assert.deepEqual(bat.dependencies, [formulaID("libyaml"), formulaID("oniguruma")]);
    assert.deepEqual(bat.exclusive, [formulaID("libyaml"), formulaID("oniguruma")]);
  });

  it("handles cycles without infinite recursion", () => {
    const analysis = analysisOf("installed-cyclic");
    const loopB = analysis.byID.get(formulaID("loop-b"));
    assert.ok(loopB);
    assert.deepEqual(loopB.reasonPaths[0]?.path, ["root", "loop-a", "loop-b"]);
    assert.equal(loopB.isUnexplained, false);
  });

  it("lists a top-level cask with no formula dependencies as a display root", () => {
    const analysis = analysisOf("installed-cask-context");
    const standalone = analysis.roots.find((root) => root.label === "standalone-app");
    assert.ok(standalone);
    assert.equal(standalone.type, "cask");
    assert.deepEqual(standalone.dependencies, []);
  });

  it("lists a nested cask among the packages its parent accounts for", () => {
    const analysis = analysisOf("installed-cask-context");
    const parent = analysis.roots.find((root) => root.label === "parent-app");
    assert.ok(parent);
    assert.deepEqual(parent.dependencies, [caskID("child-app"), formulaID("helper-lib")]);
    assert.deepEqual(parent.exclusive, [caskID("child-app"), formulaID("helper-lib")]);
  });

  it("keeps mutually requiring casks as roots so their formulae stay explained", () => {
    const analysis = analysisOf("installed-cask-cyclic");
    assert.deepEqual(
      analysis.roots.map((root) => root.label),
      ["loop-a", "loop-b"],
    );
    const helper = analysis.byID.get(formulaID("helper-lib"));
    assert.ok(helper);
    assert.equal(helper.isUnexplained, false);
    assert.deepEqual(
      helper.caskReasonSources.map((source) => source.name),
      ["loop-a", "loop-b"],
    );
  });

  it("classifies a nested cask so the detail view can explain it", () => {
    const analysis = analysisOf("installed-cask-context");
    const child = analysis.caskByID.get(caskID("child-app"));
    assert.ok(child);
    assert.equal(child.label, "child-app");
    assert.deepEqual(
      child.caskReasonSources.map((source) => source.name),
      ["parent-app"],
    );
    assert.deepEqual(
      child.immediateDependents.map((source) => `${source.name}:${source.type}`),
      ["parent-app:cask"],
    );
  });

  it("collects every reason source when a cask cycle sits beside a top-level cask", () => {
    const analysis = analysisOf("installed-cask-cycle-beside-root");
    assert.deepEqual(
      analysis.roots.map((root) => root.label),
      ["app-tool", "ring-a", "ring-b", "top-app"],
    );

    const shared = analysis.byID.get(formulaID("shared-lib"));
    assert.ok(shared);
    assert.deepEqual(
      shared.requestedFormulaRoots.map((source) => source.name),
      ["app-tool"],
    );
    assert.deepEqual(
      shared.caskReasonSources.map((source) => source.name),
      ["ring-a", "ring-b", "top-app"],
    );
  });
});

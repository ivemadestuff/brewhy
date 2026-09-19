import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { caskID, formulaID } from "../src/brew/ids.js";
import { parseInventory } from "../src/brew/parser.js";
import { analyze } from "../src/graph/classify.js";
import { buildGraph } from "../src/graph/graph.js";
import { labelOf } from "../src/graph/labels.js";
import { renderDetail } from "../src/render/detail.js";
import { analysisOf, assertSnapshot } from "./helpers.js";
import { FIXTURES, MIN_TERMINAL_WIDTH, overview, plainOptions } from "./render-helpers.js";

describe("text detail", () => {
  it("explains a shared automatic formula", () => {
    const analysis = analysisOf("installed-basic");
    const facts = analysis.byID.get(formulaID("openssl@3"));
    assert.ok(facts);
    assertSnapshot("detail-shared", `${renderDetail(analysis, facts, plainOptions).join("\n")}\n`);
  });

  it("explains a formula required only by an installed cask", () => {
    const analysis = analysisOf("installed-cask-context");
    const facts = analysis.byID.get(formulaID("podman"));
    assert.ok(facts);
    assertSnapshot("detail-cask", `${renderDetail(analysis, facts, plainOptions).join("\n")}\n`);
  });

  it("explains an installed cask that is a displayed root", () => {
    const analysis = analysisOf("installed-cask-context");
    const facts = analysis.caskByID.get(caskID("podman-desktop"));
    assert.ok(facts);
    assertSnapshot(
      "detail-cask-root",
      `${renderDetail(analysis, facts, plainOptions).join("\n")}\n`,
    );
  });

  it("explains a nested cask required by another cask", () => {
    const analysis = analysisOf("installed-cask-context");
    const facts = analysis.caskByID.get(caskID("child-app"));
    assert.ok(facts);
    assertSnapshot(
      "detail-cask-nested",
      `${renderDetail(analysis, facts, plainOptions).join("\n")}\n`,
    );
  });

  it("explains a requested formula that is also a dependency", () => {
    const analysis = analysisOf("installed-shared");
    const facts = analysis.byID.get(formulaID("readline"));
    assert.ok(facts);
    assertSnapshot(
      "detail-requested",
      `${renderDetail(analysis, facts, plainOptions).join("\n")}\n`,
    );
  });

  it("names under a root everything the overview names under it", () => {
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      for (const root of analysis.roots) {
        const facts = analysis.byID.get(root.ID) ?? analysis.caskByID.get(root.ID);
        if (facts === undefined) continue;
        const rendered = renderDetail(analysis, facts, plainOptions).join(" ");
        for (const ID of root.dependencies) {
          const name = labelOf(analysis, ID);
          assert.ok(
            new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(rendered),
            `${fixture}: ${root.label} accounts for ${name}, which its detail view never names`,
          );
        }
      }
    }
  });

  it("keeps every detail line inside the terminal", () => {
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      for (const facts of [...analysis.packages, ...analysis.casks]) {
        const lines = renderDetail(analysis, facts, {
          width: MIN_TERMINAL_WIDTH,
        });
        for (const line of lines) {
          assert.ok(
            [...line].length <= MIN_TERMINAL_WIDTH,
            `${facts.label}: "${line}" overflows ${MIN_TERMINAL_WIDTH} columns`,
          );
        }
      }
    }
  });

  it("stacks a detail row rather than clipping a name that will not fit inline", () => {
    const analysis = analysisOf("installed-tap-names");
    const widget = analysis.packages.find((facts) => facts.label === "widget");
    assert.ok(widget);

    const narrow = renderDetail(analysis, widget, {
      width: MIN_TERMINAL_WIDTH,
    });
    assert.ok(narrow.includes("Requires directly"));
    assert.ok(narrow.some((line) => line.includes("acme/tap/helper")));

    const wide = renderDetail(analysis, widget, plainOptions);
    assert.ok(
      wide.some((line) => /^Requires directly\s+acme\/tap\/helper/.test(line)),
      wide.join("\n"),
    );
    assert.ok(!wide.includes("Requires directly"));
  });

  it("keeps characters of terminal-decided width out of the framed heading", () => {
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      for (const facts of [...analysis.packages, ...analysis.casks]) {
        const heading = renderDetail(analysis, facts, plainOptions).slice(
          0,
          renderDetail(analysis, facts, plainOptions).indexOf(""),
        );
        for (const line of heading) {
          assert.ok(!line.includes("✓"), `${facts.label}: ambiguous-width mark in the frame`);
        }
        const widths = new Set(heading.map((line) => [...line].length));
        assert.equal(widths.size, 1, `${facts.label}: frame rows disagree on width`);
      }
    }
  });

  it("explains an unexplained formula without implying it is removable", () => {
    const analysis = analysisOf("installed-incomplete");
    const facts = analysis.byID.get(formulaID("gamma"));
    assert.ok(facts);
    const rendered = `${renderDetail(analysis, facts, plainOptions).join("\n")}\n`;
    assertSnapshot("detail-unexplained", rendered);
    assert.match(
      rendered.replace(/\s+/g, " "),
      /This does not mean the formula is safe to remove\./,
    );
  });

  it("uses the singular disclaimer when the inventory has one unexplained formula", () => {
    const rendered = overview("installed-one-unexplained").replace(/\s+/g, " ");
    assert.match(rendered, /reaches this formula in the available metadata/);
    assert.match(rendered, /This does not mean the formula is safe to remove/);
    assert.ok(!rendered.includes("these formulae"));
  });

  it("renders an unknown intent as unknown, not as a dependency", () => {
    const analysis = analysisOf("installed-incomplete", null);
    const facts = analysis.byID.get(formulaID("epsilon"));
    assert.ok(facts);
    const rendered = renderDetail(analysis, facts, plainOptions).join("\n");
    assert.match(rendered, /intent unknown/);
    assert.ok(!rendered.includes("as a dependency"));
  });

  it("keeps the heading frame aligned when the title is wider than the terminal", () => {
    const cases = [
      {
        name: "python@3.12",
        versions: ["3.12.0", "3.12.1", "3.12.2", "3.12.3"],
      },
      {
        name: "this-is-an-unusually-long-formula-name",
        versions: ["1.0.0"],
      },
    ];
    for (const { name, versions } of cases) {
      const inventory = parseInventory(
        {
          formulae: [
            {
              name,
              full_name: name,
              desc: "Interpreted, interactive, object-oriented programming language",
              homepage: "https://www.python.org/",
              linked_keg: versions[versions.length - 1],
              installed: versions.map((version) => ({
                version,
                installed_on_request: true,
                runtime_dependencies: [],
              })),
            },
          ],
          casks: [],
        },
        [name],
      );
      const analysis = analyze(inventory, buildGraph(inventory));
      const facts = analysis.packages[0];
      assert.ok(facts, name);
      const lines = renderDetail(analysis, facts, { width: MIN_TERMINAL_WIDTH });
      const frame = lines.filter((line) => /[╔║╚]/.test(line));
      const top = frame[0];
      assert.ok(top, `${name}: heading draws a frame`);
      for (const line of frame) {
        assert.equal(line.length, top.length, `${name}: misaligned: ${line}`);
        assert.ok(
          line.length <= MIN_TERMINAL_WIDTH,
          `${name}: frame wider than the terminal: ${line}`,
        );
      }
    }
  });
});

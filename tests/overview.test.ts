import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { labelOf } from "../src/graph/labels.js";
import { renderBanner } from "../src/render/banner.js";
import { renderDetail } from "../src/render/detail.js";
import { renderOverview } from "../src/render/overview.js";
import { analysisOf, assertSnapshot } from "./helpers.js";
import {
  FIXTURES,
  MIN_TERMINAL_WIDTH,
  overview,
  plainOptions,
  stripSgr,
} from "./render-helpers.js";

describe("text overview", () => {
  for (const fixture of FIXTURES) {
    it(`renders one row per reason source for ${fixture}`, () => {
      assertSnapshot(`overview-${fixture.replace("installed-", "")}`, overview(fixture));
    });
  }

  it("names every reason source", () => {
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      const rendered = overview(fixture);
      for (const facts of analysis.packages) {
        if (facts.intent !== "requested") continue;
        assert.ok(
          rendered.includes(facts.label),
          `${fixture}: requested formula ${facts.label} is missing from the overview`,
        );
      }
    }
  });

  it("counts installed casks in the summary separately from requested formulae", () => {
    assert.match(overview("installed-cask-context"), /^4 Casks$/m);
    assert.match(overview("installed-cask-aliases"), /^2 Casks$/m);
    assert.doesNotMatch(overview("installed-basic"), /Cask/);
  });

  it("lists requested formulae and installed casks in separate sections", () => {
    const mixed = overview("installed-cask-context");
    const formulaeAt = mixed.indexOf("\nInstalled Formulae:\n");
    const casksAt = mixed.indexOf("\nInstalled Casks:\n");
    assert.ok(formulaeAt >= 0, "the formula list is headed Installed Formulae:");
    assert.ok(casksAt > formulaeAt, "the cask list follows the formula list");
    assert.match(mixed, /^✓ jq /m);
    assert.match(mixed, /^✓ parent-app /m);
    assert.doesNotMatch(mixed, /^✓ parent-app \(cask\)/m);
    assert.doesNotMatch(overview("installed-basic"), /^Installed Casks:$/m);
    assert.doesNotMatch(overview("installed-cask-aliases"), /^Installed Formulae:$/m);
    assert.match(overview("installed-cask-aliases"), /^Installed Casks:$/m);
  });

  it("shows every installed cask somewhere in the overview", () => {
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      const rendered = overview(fixture);
      for (const node of analysis.inventory.casks.values()) {
        const label = labelOf(analysis, node.ID);
        assert.ok(
          rendered.includes(label),
          `${fixture}: cask ${label} is missing from the overview`,
        );
      }
    }
  });

  it("reports dependency counts without implying anything is removable", () => {
    const rendered = overview("installed-shared");
    assert.match(rendered, /\(\d+ Dependencies/);
    assert.ok(!/\bsafe to remove\b/.test(rendered.replace(/does not mean.*/gs, "")));
  });

  it("trims the annotation, never the root name, on a narrow terminal", () => {
    const lines = renderOverview(analysisOf("installed-cask-context"), {
      width: MIN_TERMINAL_WIDTH,
    });
    for (const line of lines) {
      assert.ok(line.length <= MIN_TERMINAL_WIDTH, `line longer than the terminal: ${line}`);
    }
    assert.ok(
      lines.some((line) => line.includes("podman-desktop")),
      "root names survive trimming",
    );
    assert.ok(
      lines.some((line) => line.includes("…")),
      "the annotation is trimmed",
    );
  });

  it("hangs a root's dependencies under the formula at one indent", () => {
    const rendered = overview("installed-basic");
    assert.match(rendered, /^  libyaml, oniguruma$/m);
    assert.match(rendered, /oniguruma\n✓ node/);
  });

  it("bolds each reason source on a terminal, leaving the names under it plain", () => {
    const analysis = analysisOf("installed-basic");
    const tty = renderOverview(analysis, { width: 80, isTTY: true });
    const plain = renderOverview(analysis, { width: 80 });
    assert.deepEqual(tty.map(stripSgr), plain);
    for (const line of tty) {
      if (line.includes("✓")) {
        assert.match(line, /^\x1b\[1m✓ .+\x1b\[0m/);
      } else {
        assert.doesNotMatch(line, /\x1b/);
      }
    }
  });

  it("does not let SGR sequences consume the width budget", () => {
    const analysis = analysisOf("installed-cask-context");
    const tty = renderOverview(analysis, { width: MIN_TERMINAL_WIDTH, isTTY: true });
    const plain = renderOverview(analysis, { width: MIN_TERMINAL_WIDTH });
    assert.deepEqual(tty.map(stripSgr), plain);
    assert.ok(
      tty.some((line) => line.includes("podman-desktop") && line.includes("\x1b[1m")),
      "the cask source name is bold before its annotation",
    );
  });

  it("wraps a long dependency list instead of dropping names from it", () => {
    const analysis = analysisOf("installed-wide-root");
    const lines = renderOverview(analysis, {
      width: MIN_TERMINAL_WIDTH,
    });
    for (const line of lines) {
      assert.ok(line.length <= MIN_TERMINAL_WIDTH, `line longer than the terminal: ${line}`);
    }
    const listed = lines
      .filter((line) => line.startsWith("  ") && !line.startsWith("✓"))
      .join(" ")
      .split(/[,\s]+/)
      .filter((name) => name.length > 0);
    for (const facts of analysis.packages) {
      if (facts.intent === "requested") continue;
      assert.ok(listed.includes(facts.label), `${facts.label} is named under its root`);
    }
  });

  it("leaves no trailing whitespace on any row", () => {
    for (const line of renderBanner(plainOptions)) {
      assert.equal(line, line.replace(/\s+$/, ""), `banner: trailing space in "${line}"`);
    }
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      for (const facts of [...analysis.packages, ...analysis.casks]) {
        for (const line of renderDetail(analysis, facts, plainOptions)) {
          assert.equal(line, line.replace(/\s+$/, ""), `${facts.label}: trailing space`);
        }
      }
      for (const line of overview(fixture).split("\n")) {
        assert.equal(line, line.replace(/\s+$/, ""), `${fixture}: trailing space in "${line}"`);
      }
    }
  });

  it("shows every installed formula somewhere in the overview", () => {
    for (const fixture of FIXTURES) {
      const analysis = analysisOf(fixture);
      const rendered = overview(fixture);
      for (const facts of analysis.packages) {
        assert.ok(
          rendered.includes(facts.label),
          `${fixture}: ${facts.label} is missing from the overview`,
        );
      }
    }
  });

  it("keeps the whole inventory view inside a narrow terminal", () => {
    for (const fixture of FIXTURES) {
      const lines = renderOverview(analysisOf(fixture), {
        width: MIN_TERMINAL_WIDTH,
      });
      for (const line of lines) {
        assert.ok(
          [...line].length <= MIN_TERMINAL_WIDTH,
          `${fixture}: "${line}" overflows ${MIN_TERMINAL_WIDTH} columns`,
        );
      }
    }
  });
});

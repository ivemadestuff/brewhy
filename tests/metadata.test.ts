import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../src/app.js";
import { parseInfoJSON } from "../src/brew/client.js";
import { caskID, formulaID } from "../src/brew/ids.js";
import { parseInventory } from "../src/brew/parser.js";
import { StaticBrewClient } from "./helpers.js";

describe("malformed Homebrew metadata", () => {
  it("does not coerce malformed version values while reporting multiple kegs", () => {
    for (const version of [null, false, 42, "", [], {}, { toString: null }]) {
      const info = parseInfoJSON(
        JSON.stringify({
          formulae: [
            {
              name: "tool",
              linked_keg: "2",
              installed: [
                { version, runtime_dependencies: [] },
                { version: "2", installed_on_request: true, runtime_dependencies: [] },
              ],
            },
          ],
        }),
      );
      const inventory = parseInventory(info, null);
      const tool = inventory.formulae.get(formulaID("tool"));
      assert.deepEqual(tool?.installedVersions, ["2"]);
      assert.equal(tool?.intent, "requested");
      assert.match(inventory.warnings[0] ?? "", /multiple installed versions \(unknown, 2\)/);
      assert.match(inventory.warnings[0] ?? "", /using the linked keg 2/);
    }
  });

  it("skips invalid formula and cask records while reporting the usable inventory", async () => {
    const info = parseInfoJSON(
      JSON.stringify({
        formulae: [null, 42, [], { name: "tool", installed: [{ runtime_dependencies: [] }] }],
        casks: [null, false, "invalid", { token: "app", installed: "1" }],
      }),
    );
    const result = await run([], {
      client: new StaticBrewClient(info, ["tool"]),
      width: 80,
      isTTY: false,
      version: "test",
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^✓ tool$/m);
    assert.match(result.stdout, /^✓ app$/m);
    assert.equal(result.stderr.split("\n").filter((line) => line.startsWith("warning:")).length, 6);
    assert.doesNotMatch(result.stderr, /Unexpected failure/);
  });

  it("ignores malformed kegs and preserves the linked version's dependencies", () => {
    const info = parseInfoJSON(
      JSON.stringify({
        formulae: [
          {
            name: "tool",
            linked_keg: "1",
            installed: [
              null,
              { version: "1", runtime_dependencies: [{ full_name: "library" }] },
              false,
              { version: "2", runtime_dependencies: [] },
            ],
          },
          { name: "library", installed: [{ version: "1", runtime_dependencies: [] }] },
        ],
      }),
    );
    const inventory = parseInventory(info, ["tool"]);
    const tool = inventory.formulae.get(formulaID("tool"));
    assert.deepEqual(tool?.installedVersions, ["1", "2"]);
    assert.deepEqual(tool?.dependencies, [formulaID("library")]);
    assert.match(inventory.warnings.join("\n"), /skipped malformed entries/);
    assert.match(inventory.warnings.join("\n"), /using the linked keg 1/);
  });

  it("keeps unknown intent when no usable keg metadata remains", () => {
    const info = parseInfoJSON('{"formulae":[{"name":"tool","installed":[null,42]}]}');
    const inventory = parseInventory(info, null);
    const tool = inventory.formulae.get(formulaID("tool"));
    assert.equal(tool?.intent, "unknown");
    assert.deepEqual(tool?.installedVersions, []);
    assert.deepEqual(tool?.dependencies, []);
    assert.match(inventory.warnings.join("\n"), /no installed keg metadata/);
  });

  it("uses valid fallback names and discards invalid optional fields", () => {
    const info = parseInfoJSON(
      JSON.stringify({
        formulae: [
          {
            name: "tool",
            full_name: 42,
            aliases: 42,
            oldnames: [null, "old-tool"],
            installed: [{ version: "1", runtime_dependencies: [] }],
          },
        ],
        casks: [{ token: "app", full_token: false, installed: 42, version: false, name: [null] }],
      }),
    );
    const inventory = parseInventory(info, ["old-tool"]);
    assert.equal(inventory.formulae.get(formulaID("tool"))?.intent, "requested");
    const app = inventory.casks.get(caskID("app"));
    assert.ok(app);
    assert.equal(app.version, undefined);
    assert.deepEqual(app.names, []);
  });
});

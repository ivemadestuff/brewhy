/**
 * Verifies the JSON contract consumed by other programs.
 * Checks inventory completeness, unambiguous relationships and separate diagnostics.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../src/app.js";
import { operationalError } from "../src/errors.js";
import { StaticBrewClient, runFixture } from "./helpers.js";
import { FIXTURES } from "./render-helpers.js";

interface PackageJSON {
  ID: string;
  type: string;
  dependencies: string[];
  directDependencies: string[];
  immediateDependents: string[];
  requestedFormulaRoots: string[];
  caskReasonSources: string[];
  reasonPaths: { source: string; path: string[] }[];
  intent: string | null;
  isUnexplained: boolean | null;
}

interface OverviewJSON {
  schemaVersion: number;
  summary: { total: number; casks: number };
  packages: PackageJSON[];
  roots: { ID: string; dependencies: string[]; exclusive: string[] }[];
}

describe("JSON output", () => {
  for (const fixture of FIXTURES) {
    it(`exports complete relationships for ${fixture}`, async () => {
      const result = await runFixture(fixture, ["--json"]);
      assert.equal(result.exitCode, 0);
      const data = JSON.parse(result.stdout) as OverviewJSON;
      assert.equal(data.schemaVersion, 1);
      assert.equal(data.packages.length, data.summary.total + data.summary.casks);
      const IDs = new Set(data.packages.map((entry) => entry.ID));
      assert.equal(IDs.size, data.packages.length);
      for (const entry of data.packages) {
        for (const ID of [
          ...entry.dependencies,
          ...entry.directDependencies,
          ...entry.immediateDependents,
          ...entry.requestedFormulaRoots,
          ...entry.caskReasonSources,
        ]) {
          assert.ok(IDs.has(ID), `Missing relationship target ${ID}`);
        }
        for (const reason of entry.reasonPaths) {
          assert.equal(reason.path[0], reason.source);
          assert.equal(reason.path.at(-1), entry.ID);
          for (let index = 1; index < reason.path.length; index++) {
            const previous = data.packages.find(
              (candidate) => candidate.ID === reason.path[index - 1],
            );
            assert.ok(previous?.dependencies.includes(reason.path[index]!));
          }
        }
      }
      for (const root of data.roots) {
        assert.ok(IDs.has(root.ID));
        assert.ok(root.dependencies.every((ID) => IDs.has(ID)));
        assert.ok(root.exclusive.every((ID) => root.dependencies.includes(ID)));
      }
      const visible = await runFixture(fixture, ["--json", "--show-casks"], {
        isTTY: true,
        width: 40,
      });
      assert.equal(result.stdout, visible.stdout);
      assert.doesNotMatch(result.stdout, /\x1b/);
    });
  }

  it("returns the same package facts in detail and inventory views", async () => {
    const overview = await runFixture("installed-cask-context", ["--json"]);
    const data = JSON.parse(overview.stdout) as OverviewJSON;
    for (const entry of data.packages) {
      const detail = await runFixture("installed-cask-context", [
        "--json",
        `--${entry.type}`,
        entry.ID.slice(entry.ID.indexOf(":") + 1),
      ]);
      assert.equal(detail.exitCode, 0);
      assert.deepEqual(JSON.parse(detail.stdout), { schemaVersion: 1, package: entry });
    }
  });

  it("keeps incomplete-data warnings separate from valid JSON", async () => {
    const result = await runFixture("installed-incomplete", ["--json"], { requested: null });
    assert.equal(result.exitCode, 0);
    const data = JSON.parse(result.stdout) as OverviewJSON;
    assert.ok(data.packages.some((entry) => entry.intent === "unknown"));
    assert.match(result.stderr, /^warning:/);
  });

  it("exports an empty inventory", async () => {
    const result = await run(["--json"], {
      client: new StaticBrewClient({ formulae: [], casks: [] }, []),
      isTTY: false,
      width: 80,
      version: "test",
    });
    const data = JSON.parse(result.stdout) as OverviewJSON;
    assert.deepEqual(data.packages, []);
    assert.deepEqual(data.roots, []);
    assert.equal(data.summary.total, 0);
  });

  it("leaves stdout empty on lookup and operational errors", async () => {
    const missing = await runFixture("installed-basic", ["--json", "missing-package"]);
    assert.equal(missing.exitCode, 2);
    assert.equal(missing.stdout, "");
    assert.match(missing.stderr, /^error:/);
    const failed = await run(["--json"], {
      client: {
        info: async () => {
          throw operationalError("Homebrew failed.");
        },
        installedOnRequest: async () => [],
      },
      isTTY: false,
      width: 80,
      version: "test",
    });
    assert.equal(failed.exitCode, 1);
    assert.equal(failed.stdout, "");
    assert.match(failed.stderr, /^error:/);
  });

  it("gives help and version precedence over JSON without querying Homebrew", async () => {
    const deps = {
      client: {
        info: async () => {
          throw new Error("Unexpected query");
        },
        installedOnRequest: async () => [],
      },
      isTTY: false,
      width: 80,
      version: "test",
    };
    const help = await run(["--json", "--help"], deps);
    assert.equal(help.exitCode, 0);
    assert.match(help.stdout, /--json\s+Output JSON/);
    assert.equal((await run(["--json", "--version"], deps)).stdout, "test\n");
  });
});

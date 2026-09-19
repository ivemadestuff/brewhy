import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { caskID, formulaID } from "../src/brew/ids.js";
import { parseInventory } from "../src/brew/parser.js";
import { inventoryOf } from "./helpers.js";

describe("parseInventory", () => {
  it("reads formulae, versions, intent and runtime dependencies", () => {
    const inventory = inventoryOf("installed-basic");
    assert.equal(inventory.formulae.size, 9);
    const node = inventory.formulae.get(formulaID("node"));
    assert.ok(node);
    assert.equal(node.intent, "requested");
    assert.deepEqual(node.installedVersions, ["1.0.0"]);
    assert.deepEqual(node.dependencies, [
      formulaID("icu4c"),
      formulaID("libuv"),
      formulaID("openssl@3"),
    ]);
    assert.equal(inventory.warnings.length, 0);
  });

  it("keeps dependency lists sorted so path tie-breaking is deterministic", () => {
    const inventory = inventoryOf("installed-basic");
    for (const node of inventory.formulae.values()) {
      assert.deepEqual(node.dependencies, [...node.dependencies].sort());
    }
  });

  it("resolves the installed-on-request list through short names and aliases", () => {
    const inventory = inventoryOf("installed-basic", ["openssl"]);
    assert.equal(inventory.formulae.get(formulaID("openssl@3"))?.intent, "requested");
    assert.equal(inventory.formulae.get(formulaID("node"))?.intent, "automatic");
  });

  it("falls back to the info payload intent with a warning when the list is missing", () => {
    const inventory = inventoryOf("installed-basic", null);
    assert.equal(inventory.formulae.get(formulaID("node"))?.intent, "requested");
    assert.ok(inventory.warnings.some((warning) => warning.includes("installed-on-request")));
  });

  it("warns when Homebrew reports a requested formula that is not installed", () => {
    const inventory = inventoryOf("installed-basic", ["node", "ghost-tool"]);
    assert.ok(inventory.warnings.some((warning) => warning.includes("ghost-tool")));
  });

  it("prefers the linked keg when several versions are installed", () => {
    const inventory = inventoryOf("installed-multiple-versions");
    const python = inventory.formulae.get(formulaID("python@3.12"));
    assert.ok(python);
    assert.deepEqual(python.installedVersions, ["3.12.1", "3.12.2"]);
    assert.deepEqual(python.dependencies, [formulaID("mpdecimal")]);
    assert.ok(
      inventory.warnings.some(
        (warning) => warning.includes("python@3.12") && warning.includes("linked keg 3.12.2"),
      ),
    );
  });

  it("falls back to the most recent keg when nothing is linked", () => {
    const inventory = inventoryOf("installed-multiple-versions");
    assert.ok(
      inventory.warnings.some(
        (warning) => warning.includes("unlinked-tool") && warning.includes("most recent entry"),
      ),
    );
  });

  it("keeps the inventory usable when metadata is incomplete", () => {
    const inventory = inventoryOf("installed-incomplete");
    assert.equal(inventory.formulae.size, 5);
    assert.deepEqual(inventory.formulae.get(formulaID("beta"))?.dependencies, []);
    assert.deepEqual(inventory.formulae.get(formulaID("gamma"))?.dependencies, []);
    const warnings = inventory.warnings.join("\n");
    assert.match(warnings, /beta has no recorded runtime dependency metadata/);
    assert.match(warnings, /gamma depends on not-installed-thing/);
    assert.match(warnings, /delta records a runtime dependency with no name/);
    assert.match(warnings, /epsilon has no installed keg metadata/);
  });

  it("reports formula problems before cask problems, because the cap truncates", () => {
    const inventory = parseInventory(
      {
        formulae: [{ name: "alpha", full_name: "alpha", installed: [{ version: "1" }] }],
        casks: [{ version: "1" }],
      },
      [],
    );
    const formulaIndex = inventory.warnings.findIndex((warning) =>
      warning.includes("alpha has no recorded runtime dependency metadata"),
    );
    const caskIndex = inventory.warnings.findIndex((warning) =>
      warning.includes("Skipped an installed cask with no token"),
    );
    assert.ok(formulaIndex >= 0 && caskIndex >= 0);
    assert.ok(formulaIndex < caskIndex);
  });

  it("reads a cask's human-readable names, description and homepage", () => {
    const inventory = parseInventory(
      {
        formulae: [],
        casks: [
          {
            token: "firefox",
            full_token: "firefox",
            name: ["Mozilla Firefox"],
            desc: "web browser",
            homepage: "https://example.invalid/firefox",
            version: "1",
            installed: "1",
          },
        ],
      },
      [],
    );
    const node = inventory.casks.get(caskID("firefox"));
    assert.deepEqual(node?.names, ["Mozilla Firefox"]);
    assert.equal(node?.description, "web browser");
    assert.equal(node?.homepage, "https://example.invalid/firefox");
  });

  it("reads cask dependency context from string and array forms", () => {
    const inventory = inventoryOf("installed-cask-context");
    assert.equal(inventory.casks.size, 4);
    assert.deepEqual(inventory.casks.get("cask:podman-desktop")?.dependencies, [
      formulaID("podman"),
    ]);
    assert.deepEqual(inventory.casks.get("cask:parent-app")?.dependencies, ["cask:child-app"]);
    assert.deepEqual(inventory.casks.get("cask:standalone-app")?.dependencies, []);
  });

  it("records a directly declared dependency once even when it is reached by an alias", () => {
    const inventory = parseInventory(
      {
        formulae: [
          {
            name: "openssl@3",
            full_name: "openssl@3",
            aliases: ["openssl"],
            installed: [{ version: "3", runtime_dependencies: [] }],
          },
          {
            name: "wget",
            full_name: "wget",
            installed: [
              {
                version: "1",
                runtime_dependencies: [
                  { full_name: "openssl@3", declared_directly: true },
                  { full_name: "openssl", declared_directly: true },
                ],
              },
            ],
          },
        ],
        casks: [],
      },
      ["wget"],
    );
    assert.deepEqual(inventory.formulae.get(formulaID("wget"))?.directDependencies, [
      formulaID("openssl@3"),
    ]);
  });

  it("resolves a duplicated formula entry once instead of warning twice", () => {
    const entry = {
      name: "solo",
      full_name: "solo",
      installed: [{ version: "1" }],
    };
    const inventory = parseInventory({ formulae: [entry, entry], casks: [] }, ["solo"]);
    assert.equal(inventory.formulae.size, 1);
    assert.equal(
      inventory.warnings.filter((warning) => warning.includes("runtime dependency metadata"))
        .length,
      1,
    );
  });

  it("resolves a duplicated cask token from its first entry only", () => {
    const inventory = parseInventory(
      {
        formulae: [
          {
            name: "podman",
            full_name: "podman",
            installed: [{ version: "1", runtime_dependencies: [] }],
          },
        ],
        casks: [
          { token: "podman-desktop", full_token: "podman-desktop", version: "1" },
          {
            token: "podman-desktop",
            full_token: "podman-desktop",
            version: "2",
            depends_on: { formula: "podman" },
          },
        ],
      },
      [],
    );
    assert.equal(inventory.casks.size, 1);
    const cask = inventory.casks.get(caskID("podman-desktop"));
    assert.equal(cask?.version, "1");
    assert.deepEqual(cask?.dependencies, []);
  });

  it("resolves a cask dependency declared by its short token", () => {
    const inventory = inventoryOf("installed-cask-aliases");
    assert.deepEqual(inventory.casks.get(caskID("parent-suite"))?.dependencies, [
      caskID("acme/tap/widget-app"),
    ]);
  });

  it("indexes a cask under its short, tap-qualified and former tokens", () => {
    const inventory = inventoryOf("installed-cask-aliases");
    const ID = caskID("acme/tap/widget-app");
    for (const token of ["widget-app", "acme/tap/widget-app", "widget"]) {
      assert.equal(inventory.caskAliases.get(token), ID, `alias ${token}`);
    }
  });

  it("ignores unknown Homebrew fields", () => {
    const inventory = parseInventory(
      {
        formulae: [
          {
            name: "solo",
            full_name: "solo",
            installed: [{ version: "1", runtime_dependencies: [] }],
            /* @ts-expect-error deliberately unknown field */
            future_field: { anything: true },
          },
        ],
        casks: [],
      },
      ["solo"],
    );
    assert.equal(inventory.formulae.size, 1);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../src/app.js";
import type { RawBrewInfo } from "../src/brew/types.js";
import { StaticBrewClient, runFixture } from "./helpers.js";

describe("package lookup", () => {
  it("exits 2 when the requested package is not installed", async () => {
    const result = await runFixture("installed-basic", ["ghost"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /ghost is not installed/);
    assert.equal(result.stdout, "");
  });

  it("explains an installed cask by its token", async () => {
    const result = await runFixture("installed-cask-context", ["podman-desktop"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /podman-desktop/);
    assert.match(result.stdout, /as a cask/);
    assert.match(result.stdout, /podman/);
  });

  it("explains a cask found by a former token instead of calling it uninstalled", async () => {
    const result = await runFixture("installed-cask-aliases", ["widget"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /widget-app/);
    assert.match(result.stdout, /as a cask/);
  });

  it("explains a tap cask by its short token", async () => {
    const result = await runFixture("installed-cask-aliases", ["widget-app"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /widget-app/);
    assert.match(result.stdout, /as a cask/);
  });

  it("explains a nested cask required by another cask", async () => {
    const result = await runFixture("installed-cask-context", ["child-app"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /child-app/);
    assert.match(result.stdout, /as a cask/);
    assert.match(result.stdout, /parent-app \(cask\)/);
  });

  it("explains a cask when --cask disambiguates the lookup", async () => {
    const result = await runFixture("installed-cask-context", ["--cask", "podman-desktop"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /as a cask/);
  });

  it("rejects --cask when the name is not an installed cask", async () => {
    const result = await runFixture("installed-basic", ["--cask", "ghost"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /ghost is not an installed cask/);
    assert.equal(result.stdout, "");
  });

  it("rejects --cask when the name is an installed formula", async () => {
    const result = await runFixture("installed-basic", ["--cask", "wget"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /wget is an installed formula, not a cask/);
    assert.equal(result.stdout, "");
  });

  it("rejects --formula when the name is an installed cask", async () => {
    const result = await runFixture("installed-cask-context", ["--formula", "podman-desktop"]);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /is an installed cask, not a formula/);
    assert.equal(result.stdout, "");
  });

  it("asks for --formula or --cask when a name is both", async () => {
    const payload: RawBrewInfo = {
      formulae: [
        {
          name: "docker",
          full_name: "docker",
          desc: "docker description",
          installed: [
            {
              version: "1.0.0",
              installed_on_request: true,
              runtime_dependencies: [],
            },
          ],
        },
      ],
      casks: [
        {
          token: "docker",
          full_token: "docker",
          name: ["Docker"],
          version: "1.0.0",
          installed: "1.0.0",
        },
      ],
    };
    const deps = {
      client: new StaticBrewClient(payload, ["docker"]),
      isTTY: false,
      width: 80,
      version: "0.1.0-test",
    };
    const ambiguous = await run(["docker"], deps);
    assert.equal(ambiguous.exitCode, 2);
    assert.match(ambiguous.stderr, /both an installed formula and an installed cask/);
    assert.equal(ambiguous.stdout, "");

    const asFormula = await run(["--formula", "docker"], deps);
    assert.equal(asFormula.exitCode, 0);
    assert.match(asFormula.stdout, /on request/);

    const asCask = await run(["--cask", "docker"], deps);
    assert.equal(asCask.exitCode, 0);
    assert.match(asCask.stdout, /as a cask/);
  });

  it("resolves a formula through its alias", async () => {
    const result = await runFixture("installed-basic", ["openssl"]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /^║ openssl@3\s/m);
  });
});

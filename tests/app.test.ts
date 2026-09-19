import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../src/app.js";
import { BrewhyError } from "../src/errors.js";
import { StaticBrewClient, loadFixture, runFixture } from "./helpers.js";

describe("run", () => {
  it("prints usage for --help and exits 0", async () => {
    const result = await runFixture("installed-basic", ["--help"]);
    assert.equal(result.exitCode, 0);
    assert.match(
      result.stdout,
      /^brewhy — explain why each formula and cask on your machine is installed\./,
    );
    assert.match(result.stdout, /^  brewhy\s+List each requested formula and installed cask$/m);
    assert.match(result.stdout, /brewhy <name>/);
    assert.match(result.stdout, /brewhy --cask <name>/);
    assert.match(result.stdout, /brewhy --formula <name>/);
    assert.match(result.stdout, /--hide-casks/);
    assert.doesNotMatch(result.stdout, /\x1b/);
    assert.doesNotMatch(result.stdout, /formulae/);
    assert.doesNotMatch(result.stdout, /--tree/);
    assert.doesNotMatch(result.stdout, /read-only/);
    assert.doesNotMatch(result.stdout, /NO_COLOR/);
    assert.doesNotMatch(result.stdout, /Exit codes/);
  });

  it("bolds the command name in help on a terminal", async () => {
    const result = await runFixture("installed-basic", ["--help"], { isTTY: true });
    assert.match(
      result.stdout,
      /^\x1b\[1mbrewhy\x1b\[0m — explain why each formula and cask on your machine is installed\./,
    );
    assert.equal(
      result.stdout.match(/\x1b\[1mbrewhy\x1b\[0m/g)?.length,
      1,
      "only the leading command name is bold",
    );
  });

  it("prints the version for --version", async () => {
    const result = await runFixture("installed-basic", ["--version"]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "0.1.0-test\n");
  });

  it("reports formulae with unknown intent in the overview summary", async () => {
    const result = await runFixture("installed-incomplete", [], { requested: null });
    assert.match(result.stdout, /^1 With Unknown Intent$/m);
    assert.match(result.stdout, /^3 Dependencies$/m);
  });

  it("draws the banner on a terminal and never in a pipeline", async () => {
    const onTerminal = await runFixture("installed-basic", [], { isTTY: true });
    const piped = await runFixture("installed-basic", []);
    assert.ok(onTerminal.stdout.startsWith("\n█"), "a blank line opens the output");
    assert.match(onTerminal.stdout, /█/, "the banner is drawn");
    assert.ok(!piped.stdout.includes("█"), "a pipeline gets no banner");
    assert.ok(!piped.stdout.startsWith("\n"), "a pipeline gets no leading blank line");
    assert.ok(onTerminal.stdout.endsWith("\n\n"), "the list ends on a blank line");
    assert.ok(!piped.stdout.endsWith("\n\n"), "a pipeline gets no trailing blank line");
  });

  it("bolds each reason source on a terminal and never in a pipeline", async () => {
    const onTerminal = await runFixture("installed-basic", [], { isTTY: true });
    const piped = await runFixture("installed-basic", []);
    assert.match(onTerminal.stdout, /\x1b\[1m✓ bat\x1b\[0m \(2 Dependencies, 2 Exclusive\)/);
    assert.match(onTerminal.stdout, /\x1b\[1m✓ node\x1b\[0m \(4 Dependencies, 2 Exclusive\)/);
    assert.match(onTerminal.stdout, /^  libyaml, oniguruma$/m);
    assert.doesNotMatch(onTerminal.stdout, /\x1b\[1m  /);
    assert.doesNotMatch(piped.stdout, /\x1b/);
  });

  it("defaults to the per-root overview", async () => {
    const overview = await runFixture("installed-shared", []);
    assert.match(overview.stdout, /^Installed Formulae:$/m);
    assert.doesNotMatch(overview.stdout, /^Installed Casks:$/m);
    assert.ok(!overview.stdout.includes("├─"), "the inventory list must not draw a tree");
  });

  it("puts installed casks in a Casks list separate from requested formulae", async () => {
    const result = await runFixture("installed-cask-context", []);
    assert.match(result.stdout, /^Installed Formulae:$/m);
    assert.match(result.stdout, /^Installed Casks:$/m);
    assert.match(result.stdout, /^✓ jq /m);
    assert.match(result.stdout, /^✓ standalone-app$/m);
    assert.doesNotMatch(result.stdout, /^✓ standalone-app \(cask\)$/m);
  });

  it("hides the cask section while preserving counts and formula classification", async () => {
    const visible = await runFixture("installed-cask-context", []);
    const hidden = await runFixture("installed-cask-context", ["--hide-casks"]);
    assert.equal(hidden.exitCode, 0);
    assert.equal(hidden.stderr, visible.stderr);
    assert.equal(
      hidden.stdout,
      visible.stdout.split("\nInstalled Casks:\n")[0]?.replace("4 Casks", "4 Casks (Hidden)"),
    );
    assert.doesNotMatch(hidden.stdout, /\x1b|Unexplained/);
  });

  it("dims the hidden annotation only on a terminal", async () => {
    const hidden = await runFixture("installed-cask-context", ["--hide-casks"], { isTTY: true });
    assert.equal(hidden.exitCode, 0);
    assert.match(hidden.stdout, /4 Casks \x1b\[2m\(Hidden\)\x1b\[0m/);
    assert.doesNotMatch(hidden.stdout, /Installed Casks:/);
  });

  it("leaves an inventory without casks unchanged when hiding casks", async () => {
    const visible = await runFixture("installed-shared", []);
    const hidden = await runFixture("installed-shared", ["--hide-casks"]);
    assert.deepEqual(hidden, visible);
  });

  it("preserves formula reasons and explicit cask details when hiding the cask list", async () => {
    for (const argv of [["podman"], ["--cask", "podman-desktop"], ["child-app"]]) {
      const visible = await runFixture("installed-cask-context", argv);
      const hidden = await runFixture("installed-cask-context", ["--hide-casks", ...argv]);
      assert.equal(hidden.exitCode, 0);
      assert.deepEqual(hidden, visible);
      assert.match(hidden.stdout, /(?:podman-desktop|parent-app) \(cask\)|as a cask/);
    }
  });

  it("writes warnings to stderr so piped stdout stays clean", async () => {
    const result = await runFixture("installed-incomplete", []);
    assert.match(result.stderr, /^warning: /m);
    assert.ok(!result.stdout.includes("warning:"));
  });

  it("exits 1 when Homebrew cannot be executed", async () => {
    const failing = {
      info: async () => {
        throw new BrewhyError("Homebrew was not found (tried to run `brew`).", 1);
      },
      installedOnRequest: async () => null,
    };
    const result = await run([], {
      client: failing,
      isTTY: false,
      width: 80,
      version: "0.1.0-test",
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Homebrew was not found/);
  });

  it("keeps the inventory usable when the requested-list query fails", async () => {
    const fixture = loadFixture("installed-basic");
    const result = await run([], {
      client: new StaticBrewClient(fixture.info, null),
      isTTY: false,
      width: 80,
      version: "0.1.0-test",
    });
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /3 Directly Installed/);
    assert.match(result.stderr, /installed-on-request/);
  });

  it("turns an unexpected failure into an operational exit code", async () => {
    const broken = {
      info: async () => {
        throw new TypeError("boom");
      },
      installedOnRequest: async () => null,
    };
    const result = await run([], {
      client: broken,
      isTTY: false,
      width: 80,
      version: "0.1.0-test",
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Unexpected failure: boom/);
  });

  it("caps stderr warnings and reports how many were suppressed", async () => {
    const formulae = Array.from({ length: 25 }, (_, index) => ({
      name: `tool-${index}`,
      full_name: `tool-${index}`,
      installed: [
        {
          version: "1.0.0",
          installed_on_request: true,
          runtime_dependencies: [{ full_name: "missing-dep", declared_directly: true }],
        },
      ],
    }));
    const result = await run([], {
      client: new StaticBrewClient(
        { formulae, casks: [] },
        formulae.map((formula) => formula.name),
      ),
      isTTY: false,
      width: 80,
      version: "0.1.0-test",
    });
    assert.equal(result.exitCode, 0);
    const warningLines = result.stderr.split("\n").filter((line) => line.startsWith("warning: "));
    assert.equal(warningLines.length, 21);
    assert.match(result.stderr, /5 more warnings not shown/);
    assert.match(result.stderr, /tool-0 depends on missing-dep/);
    assert.ok(!result.stderr.includes("tool-24 depends on missing-dep"));
  });
});

describe("subprocess budget", () => {
  it("runs exactly two Homebrew queries regardless of inventory size", async () => {
    const fixture = loadFixture("installed-shared");
    let infoCalls = 0;
    let requestedCalls = 0;
    const counting = {
      info: async () => {
        infoCalls += 1;
        return fixture.info;
      },
      installedOnRequest: async () => {
        requestedCalls += 1;
        return fixture.installed_on_request;
      },
    };
    const result = await run([], {
      client: counting,
      isTTY: false,
      width: 80,
      version: "0.1.0-test",
    });
    assert.equal(result.exitCode, 0);
    assert.equal(infoCalls, 1);
    assert.equal(requestedCalls, 1);
  });
});

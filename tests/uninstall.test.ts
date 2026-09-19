import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { canBuildRelease, installerEnvironment } from "./installer-helpers.js";

describe("uninstaller", () => {
  it(
    "removes installed versions through a pipe and can be run again",
    { skip: !canBuildRelease },
    (context) => {
      const env = installerEnvironment(context);
      assert.equal(env.run().status, 0);
      env.release("2.0.0");
      assert.equal(env.run({ TEST_TAG: "v2.0.0" }).status, 0);
      const config = readFileSync(join(env.home, ".zshrc"), "utf8");
      const unrelated = join(env.home, ".local/bin/another-tool");
      writeFileSync(unrelated, "keep");
      const result = env.run({}, true, ["--uninstall"]);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(env.root), false);
      assert.throws(() => lstatSync(env.bin), { code: "ENOENT" });
      assert.equal(readFileSync(unrelated, "utf8"), "keep");
      assert.equal(readFileSync(join(env.home, ".zshrc"), "utf8"), config);
      assert.equal(env.run({}, false, ["--uninstall"]).status, 0);
      const reinstall = env.run({ TEST_TAG: "v2.0.0" });
      assert.equal(reinstall.status, 0, reinstall.stderr);
    },
  );

  it("needs no build dependencies or network and does not follow nested links", (context) => {
    const env = installerEnvironment(context);
    mkdirSync(env.root, { recursive: true });
    writeFileSync(join(env.root, ".installer-managed"), "");
    const outside = join(env.home, "keep");
    writeFileSync(outside, "untouched");
    symlinkSync(outside, join(env.root, "current"));
    for (const tool of ["node", "npm", "brew", "curl"]) rmSync(join(env.tools, tool));
    const result = env.run({ TEST_DOWNLOAD_FAILURE: "release" }, false, ["--uninstall"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(env.root), false);
    assert.equal(readFileSync(outside, "utf8"), "untouched");
    assert.equal(existsSync(env.npmLog), false);
  });

  for (const kind of ["unmarked", "root symlink", "marker symlink"] as const) {
    it(`refuses an unsafe installation: ${kind}`, (context) => {
      const env = installerEnvironment(context);
      const outside = join(env.home, "outside");
      mkdirSync(outside);
      writeFileSync(join(outside, ".installer-managed"), "keep");
      mkdirSync(join(env.home, ".local/share"), { recursive: true });
      if (kind === "root symlink") symlinkSync(outside, env.root);
      else {
        mkdirSync(env.root);
        if (kind === "marker symlink")
          symlinkSync(join(outside, ".installer-managed"), join(env.root, ".installer-managed"));
      }
      mkdirSync(join(env.home, ".local/bin"));
      symlinkSync(`${env.root}/current/dist/cli.js`, env.bin);
      const result = env.run({}, false, ["--uninstall"]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /unmanaged directory/);
      assert.equal(existsSync(env.root), true);
      assert.equal(lstatSync(env.bin).isSymbolicLink(), true);
      assert.equal(readFileSync(join(outside, ".installer-managed"), "utf8"), "keep");
    });
  }

  it("preserves an existing installation lock and all installed files", (context) => {
    const env = installerEnvironment(context);
    mkdirSync(join(env.root, ".install-lock"), { recursive: true });
    writeFileSync(join(env.root, ".installer-managed"), "");
    const result = env.run({}, false, ["--uninstall"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Another installation/);
    assert.equal(existsSync(join(env.root, ".install-lock")), true);
    assert.equal(existsSync(join(env.root, ".installer-managed")), true);
  });

  for (const link of [false, true]) {
    it(`preserves an unrelated command ${link ? "symlink" : "file"}`, (context) => {
      const env = installerEnvironment(context);
      mkdirSync(env.root, { recursive: true });
      writeFileSync(join(env.root, ".installer-managed"), "");
      mkdirSync(join(env.home, ".local/bin"));
      const outside = join(env.home, "other-cli");
      writeFileSync(outside, "keep");
      if (link) symlinkSync(outside, env.bin);
      else writeFileSync(env.bin, "keep");
      const result = env.run({}, false, ["--uninstall"]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Preserved unrelated command/);
      assert.equal(readFileSync(env.bin, "utf8"), "keep");
      assert.equal(existsSync(env.root), false);
    });
  }

  it("removes an owned dangling command link when installation is already absent", (context) => {
    const env = installerEnvironment(context);
    mkdirSync(join(env.home, ".local/bin"), { recursive: true });
    symlinkSync(`${env.root}/current/dist/cli.js`, env.bin);
    assert.equal(env.run({}, false, ["--uninstall"]).status, 0);
    assert.throws(() => lstatSync(env.bin), { code: "ENOENT" });
    assert.equal(existsSync(env.root), false);
  });

  it("shows help and rejects unexpected arguments without installing", (context) => {
    const env = installerEnvironment(context);
    const help = env.run({}, true, ["--help"]);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--uninstall/);
    for (const args of [["--uninstal"], ["--uninstall", "extra"]]) {
      assert.notEqual(env.run({}, false, args).status, 0);
    }
    assert.equal(existsSync(env.root), false);
    assert.equal(existsSync(env.npmLog), false);
  });
});

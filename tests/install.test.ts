import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { canBuildRelease, installerEnvironment } from "./installer-helpers.js";

describe(
  "source installer",
  { skip: canBuildRelease ? false : "Installer requires Node.js 22.14+ or 24.10+" },
  () => {
    it("installs a release from piped input into a home directory containing spaces", (context) => {
      const setup = installerEnvironment(context);
      const result = setup.run({}, true);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readlinkSync(setup.bin), join(setup.root, "current/dist/cli.js"));
      assert.equal(readlinkSync(join(setup.root, "current")), join(setup.root, "v1.2.3"));
      const cli = spawnSync(setup.bin, ["--version"], { env: setup.env, encoding: "utf8" });
      assert.equal(cli.status, 0, cli.stderr);
      assert.equal(cli.stdout.trim(), "1.2.3");
      assert.ok(!existsSync(join(setup.root, "v1.2.3/node_modules")));
      assert.match(readFileSync(setup.npmLog, "utf8"), /ci --include=dev --ignore-scripts/);
      assert.match(readFileSync(join(setup.home, ".zshrc"), "utf8"), /export PATH=/);
      assert.ok(
        !readdirSync(setup.root).some(
          (name) => name.startsWith(".staging") || name === ".install-lock",
        ),
      );
    });

    it("reuses an installed version and adds PATH only once", (context) => {
      const setup = installerEnvironment(context);
      writeFileSync(join(setup.home, ".zshrc"), "# Existing shell configuration\n");
      assert.equal(setup.run().status, 0);
      const commands = readFileSync(setup.npmLog, "utf8");
      assert.equal(setup.run().status, 0);
      assert.equal(readFileSync(setup.npmLog, "utf8"), commands);
      const config = readFileSync(join(setup.home, ".zshrc"), "utf8");
      assert.ok(config.startsWith("# Existing shell configuration\n"));
      assert.equal(config.match(/export PATH=/g)?.length, 1);
    });

    it("keeps a working version when a release archive has the wrong version", (context) => {
      const setup = installerEnvironment(context);
      assert.equal(setup.run().status, 0);
      const before = readlinkSync(join(setup.root, "current"));
      const result = setup.run({ TEST_TAG: "v2.0.0" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /does not match its version tag/);
      assert.equal(readlinkSync(join(setup.root, "current")), before);
      assert.ok(!existsSync(join(setup.root, ".install-lock")));
    });

    it("leaves no active installation when the build fails", (context) => {
      const setup = installerEnvironment(context);
      assert.notEqual(setup.run({ TEST_BUILD_FAILURE: "1" }).status, 0);
      assert.ok(!existsSync(setup.bin));
      assert.ok(!existsSync(join(setup.home, ".zshrc")));
      assert.ok(!existsSync(join(setup.root, ".install-lock")));
    });

    it("switches to a newer release only after a successful build", (context) => {
      const setup = installerEnvironment(context);
      assert.equal(setup.run().status, 0);
      setup.release("2.0.0");
      const failed = setup.run({ TEST_TAG: "v2.0.0", TEST_BUILD_FAILURE: "1" });
      assert.notEqual(failed.status, 0);
      assert.equal(readlinkSync(join(setup.root, "current")), join(setup.root, "v1.2.3"));
      const updated = setup.run({ TEST_TAG: "v2.0.0" });
      assert.equal(updated.status, 0, updated.stderr);
      assert.equal(readlinkSync(join(setup.root, "current")), join(setup.root, "v2.0.0"));
      assert.ok(existsSync(join(setup.root, "v1.2.3/dist/cli.js")));
    });

    it("does not replace an unmanaged installation directory", (context) => {
      const setup = installerEnvironment(context);
      mkdirSync(setup.root, { recursive: true });
      writeFileSync(join(setup.root, "user-file"), "keep");
      const result = setup.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /unmanaged directory/);
      assert.equal(readFileSync(join(setup.root, "user-file"), "utf8"), "keep");
    });

    it("does not change the home directory when no release is available", (context) => {
      const setup = installerEnvironment(context);
      const result = setup.run({ TEST_DOWNLOAD_FAILURE: "release" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /published GitHub Release/);
      assert.deepEqual(readdirSync(setup.home), []);
    });

    it("refuses to replace an unrelated command", (context) => {
      const setup = installerEnvironment(context);
      mkdirSync(join(setup.home, ".local/bin"), { recursive: true });
      writeFileSync(setup.bin, "user command");
      assert.notEqual(setup.run().status, 0);
      assert.equal(readFileSync(setup.bin, "utf8"), "user command");
    });

    it("refuses unsupported platforms", (context) => {
      const setup = installerEnvironment(context);
      const result = setup.run({ TEST_PLATFORM: "Linux" });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /macOS only/);
      assert.deepEqual(readdirSync(setup.home), []);
    });

    it("uses the bash login profile for bash users", (context) => {
      const setup = installerEnvironment(context);
      const result = setup.run({ SHELL: "/bin/bash" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(readFileSync(join(setup.home, ".bash_profile"), "utf8"), /export PATH=/);
      assert.ok(!existsSync(join(setup.home, ".zshrc")));
    });

    it("prints manual PATH instructions for an unknown shell", (context) => {
      const setup = installerEnvironment(context);
      const result = setup.run({ SHELL: "/bin/fish" });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Add ~\/.local\/bin to your shell configuration/);
      assert.ok(!existsSync(join(setup.home, ".zshrc")));
    });
  },
);

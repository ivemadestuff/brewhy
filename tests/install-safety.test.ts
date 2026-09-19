import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { canBuildRelease, installerEnvironment } from "./installer-helpers.js";

describe(
  "installer failure and shell handling",
  {
    skip: canBuildRelease ? false : "Installer requires Node.js 22.14+ or 24.10+",
  },
  () => {
    it("preserves the active bash login profile and exposes the installed command", (context) => {
      for (const profile of [".bash_login", ".profile"]) {
        const setup = installerEnvironment(context);
        writeFileSync(join(setup.home, profile), "export BREWHY_PROFILE_MARKER=preserved\n");
        const result = setup.run({ SHELL: "/bin/bash" });
        assert.equal(result.status, 0, result.stderr);
        assert.ok(!existsSync(join(setup.home, ".bash_profile")));
        const shell = spawnSync(
          "/bin/bash",
          ["--login", "-c", 'printf "%s\\n" "$BREWHY_PROFILE_MARKER"; command -v brewhy'],
          {
            env: setup.env,
            encoding: "utf8",
          },
        );
        assert.equal(shell.status, 0, shell.stderr);
        assert.equal(shell.stdout, `preserved\n${setup.bin}\n`);
      }
    });

    it("uses a custom zsh configuration directory and exposes the command in a new shell", (context) => {
      const setup = installerEnvironment(context);
      const config = join(setup.home, "zsh settings");
      mkdirSync(config);
      const result = setup.run({ ZDOTDIR: config });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!existsSync(join(setup.home, ".zshrc")));
      const shell = spawnSync("/bin/zsh", ["-d", "-i", "-c", "command -v brewhy"], {
        env: { ...setup.env, ZDOTDIR: config },
        encoding: "utf8",
      });
      assert.equal(shell.status, 0, shell.stderr);
      assert.equal(shell.stdout.trim(), setup.bin);
    });

    it("does not edit shell settings when the install directory is already on PATH", (context) => {
      const setup = installerEnvironment(context);
      const result = setup.run({ PATH: `${setup.home}/.local/bin:${setup.env.PATH}` });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(!existsSync(join(setup.home, ".zshrc")));
    });

    it("rejects invalid release tags without creating an installation", (context) => {
      const setup = installerEnvironment(context);
      for (const tag of ["../../elsewhere", "v1.0.0-beta.1", "master"]) {
        assert.notEqual(setup.run({ TEST_TAG: tag }).status, 0);
        assert.deepEqual(readdirSync(setup.home), []);
      }
    });

    it("stops before modifying the home directory when a prerequisite is missing", (context) => {
      const setup = installerEnvironment(context);
      rmSync(join(setup.tools, "brew"));
      const result = setup.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Required command not found: brew/);
      assert.deepEqual(readdirSync(setup.home), []);
    });

    it("does not remove another installer's lock", (context) => {
      const setup = installerEnvironment(context);
      mkdirSync(join(setup.root, ".install-lock"), { recursive: true });
      writeFileSync(join(setup.root, ".installer-managed"), "");
      const result = setup.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Another installation may be running/);
      assert.ok(existsSync(join(setup.root, ".install-lock")));
      assert.ok(!existsSync(setup.npmLog));
    });

    it("preserves the active version and profile when the archive download fails", (context) => {
      const setup = installerEnvironment(context);
      assert.equal(setup.run().status, 0);
      const before = readlinkSync(join(setup.root, "current"));
      const profile = readFileSync(join(setup.home, ".zshrc"), "utf8");
      assert.notEqual(
        setup.run({ TEST_TAG: "v2.0.0", TEST_DOWNLOAD_FAILURE: "archive" }).status,
        0,
      );
      assert.equal(readlinkSync(join(setup.root, "current")), before);
      assert.equal(readFileSync(join(setup.home, ".zshrc"), "utf8"), profile);
      assert.ok(!existsSync(join(setup.root, ".install-lock")));
    });

    it("cleans up after an invalid archive without activating a partial install", (context) => {
      const setup = installerEnvironment(context);
      writeFileSync(setup.env.TEST_ARCHIVE, "not an archive");
      assert.notEqual(setup.run().status, 0);
      assert.ok(!existsSync(setup.bin));
      assert.ok(
        !readdirSync(setup.root).some(
          (name) => name.startsWith(".staging") || name === ".install-lock",
        ),
      );
    });
  },
);

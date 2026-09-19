import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { run } from "../src/app.js";
import { SpawnBrewClient } from "../src/brew/client.js";
import { createExecutable } from "./executables.js";

const sourceRoot = fileURLToPath(new URL("../../src", import.meta.url));

const FORBIDDEN = [
  "install",
  "uninstall",
  "remove",
  "rm",
  "upgrade",
  "update",
  "cleanup",
  "autoremove",
  "pin",
  "unpin",
  "tap",
  "reinstall",
  "link",
  "unlink",
];

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = `${directory}/${entry}`;
    if (statSync(full).isDirectory()) {
      files.push(...sourceFiles(full));
    } else if (full.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("read-only guarantee", () => {
  it("executes only inventory queries with updates and analytics disabled", async (context) => {
    const { directory, file } = createExecutable(
      context,
      `
cd -- "$(dirname -- "$0")"
printf '%s\\n' "$*" >> queries.txt
printf '%s\\n' "$HOMEBREW_NO_AUTO_UPDATE" "$HOMEBREW_NO_ANALYTICS" > "$1.env"
case "$1" in
  info) printf '%s\\n' '{"formulae":[],"casks":[]}' ;;
  list) exit 0 ;;
  *) exit 1 ;;
esac
`,
    );
    const result = await run([], {
      client: new SpawnBrewClient({
        brewPath: file,
        env: { HOMEBREW_NO_AUTO_UPDATE: "0", HOMEBREW_NO_ANALYTICS: "0" },
      }),
      isTTY: false,
      width: 80,
      version: "test",
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(
      readFileSync(join(directory, "queries.txt"), "utf8").trim().split("\n").sort(),
      ["info --json=v2 --installed", "list --formula --installed-on-request"],
    );
    for (const query of ["info", "list"]) {
      assert.equal(readFileSync(join(directory, `${query}.env`), "utf8"), "1\n1\n");
    }
  });

  it("contains no mutating Homebrew subcommand anywhere in src", () => {
    const pattern = new RegExp(`["'\`](${FORBIDDEN.join("|")})["'\`]`);
    for (const file of sourceFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      const match = source.match(pattern);
      assert.equal(match, null, `${file} mentions the mutating Homebrew subcommand ${match?.[1]}`);
    }
  });

  it("runs only the two documented read-only queries", () => {
    const client = readFileSync(`${sourceRoot}/brew/client.ts`, "utf8");
    assert.match(client, /const INFO_ARGS = \["info", "--json=v2", "--installed"\]/);
    assert.match(
      client,
      /const REQUESTED_ARGS = \["list", "--formula", "--installed-on-request"\]/,
    );
    const declared = [...client.matchAll(/const ([A-Z0-9_]+_ARGS) = /g)].map((match) => match[1]);
    assert.deepEqual(declared, ["INFO_ARGS", "REQUESTED_ARGS"]);
  });

  it("spawns processes only from the brew client", () => {
    const pattern = /from ["']node:child_process["']|\bexecFile\(|\bspawn\(|\bexec\(|\bfork\(/;
    for (const file of sourceFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      if (!pattern.test(source)) continue;
      assert.ok(
        file.endsWith("brew/client.ts"),
        `${file} must not import or spawn a child process`,
      );
    }
  });

  it("never spawns Homebrew through a shell", () => {
    const client = readFileSync(`${sourceRoot}/brew/client.ts`, "utf8");
    assert.match(client, /shell: false/);
    assert.ok(!/\bexec\(/.test(client), "brew must not be invoked through exec()");
  });

  it("sets HOMEBREW_NO_AUTO_UPDATE in the child environment", () => {
    const client = readFileSync(`${sourceRoot}/brew/client.ts`, "utf8");
    assert.match(client, /HOMEBREW_NO_AUTO_UPDATE: "1"/);
  });
});

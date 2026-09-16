/**
 * Verifies the compiled CLI through a real Node.js process.
 * Uses a Homebrew stub to check stdout, stderr and process exit codes.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type TestContext, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createExecutable } from "./executables.js";
import { loadFixture } from "./helpers.js";

const execFileAsync = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "..", "src", "cli.js");
const PACKAGE_JSON = join(here, "..", "..", "package.json");

function stubBrew(context: TestContext, name: string): string {
  const fixture = loadFixture(name);
  const { directory, file } = createExecutable(
    context,
    `
cd -- "$(dirname -- "$0")"
case "$1" in
  info) cat info.json ;;
  list) cat requested.txt ;;
  *) exit 1 ;;
esac
`,
  );
  writeFileSync(join(directory, "info.json"), JSON.stringify(fixture.info));
  writeFileSync(join(directory, "requested.txt"), `${fixture.installed_on_request.join("\n")}\n`);
  return file;
}

async function runCli(
  args: string[],
  brewPath: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      env: { ...process.env, BREWHY_BREW_PATH: brewPath },
    });
    return { stdout, stderr, code: 0 };
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", code: failure.code ?? -1 };
  }
}

describe("cli entry point", () => {
  it("reports the version from the package.json beside the built file", async () => {
    const expected = (JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as { version: string })
      .version;
    const { stdout, code } = await runCli(["--version"], "brewhy-unused");
    assert.equal(code, 0);
    assert.equal(stdout.trim(), expected);
  });

  it("explains the inventory through the real process, not the injected pipeline", async (context) => {
    const brew = stubBrew(context, "installed-basic");
    const { stdout, stderr, code } = await runCli([], brew);
    assert.equal(code, 0);
    assert.equal(stderr, "");
    assert.match(stdout, /Summary:/);
    assert.match(stdout, /node/);
    assert.ok(!stdout.startsWith("\n"));
  });

  it("hides casks by default and shows them with --show-casks", async (context) => {
    const brew = stubBrew(context, "installed-cask-context");
    const hidden = await runCli([], brew);
    const visible = await runCli(["--show-casks"], brew);
    assert.equal(hidden.code, 0);
    assert.equal(visible.code, 0);
    assert.equal(hidden.stderr, "");
    assert.equal(visible.stderr, "");
    assert.match(hidden.stdout, /^4 Casks \(Hidden\)$/m);
    assert.doesNotMatch(hidden.stdout, /^Installed Casks:$/m);
    assert.match(visible.stdout, /^4 Casks$/m);
    assert.match(visible.stdout, /^Installed Casks:$/m);
    assert.match(visible.stdout, /^standalone-app$/m);
  });

  it("sends warnings to stderr and keeps stdout free of them", async (context) => {
    const brew = stubBrew(context, "installed-incomplete");
    const { stdout, stderr, code } = await runCli([], brew);
    assert.equal(code, 0);
    assert.match(stderr, /^warning: /m);
    assert.ok(!stdout.includes("warning:"));
  });

  it("keeps redirected details free of frames and ANSI without changing external text", async (context) => {
    const brew = stubBrew(context, "installed-basic");
    const fixture = loadFixture("installed-basic");
    const formula = fixture.info.formulae?.find((entry) => entry.name === "node");
    assert.ok(formula);
    const description = "External description ".repeat(10).trim();
    const homepage = `https://example.com/${"long-path/".repeat(12)}`;
    formula.desc = `\x1b[31m${description}\x1b[0m`;
    formula.homepage = homepage;
    writeFileSync(join(dirname(brew), "info.json"), JSON.stringify(fixture.info));
    const { stdout, stderr, code } = await runCli(["--formula", "node"], brew);
    assert.equal(code, 0);
    assert.equal(stderr, "");
    assert.match(stdout, /^node$/m);
    assert.ok(stdout.split("\n").includes(description));
    assert.ok(stdout.split("\n").includes(homepage));
    assert.doesNotMatch(stdout, /\x1b|[╔═╗║╚╝✓]/);
  });

  it("strips ANSI from redirected Homebrew errors while preserving their text", async (context) => {
    const brew = createExecutable(
      context,
      "printf '\\033[31mExternal failure\\033[0m\\nLine 2\\nLine 3\\nLine 4\\nLine 5\\nLine 6\\nFinal detail\\n' >&2\nexit 1",
    ).file;
    const { stdout, stderr, code } = await runCli([], brew);
    assert.equal(code, 1);
    assert.equal(stdout, "");
    assert.match(stderr, /External failure/);
    assert.ok(
      stderr.includes("External failure\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nFinal detail"),
    );
    assert.doesNotMatch(stderr, /\x1b/);
  });

  it("exits 2 for a formula that is not installed", async (context) => {
    const brew = stubBrew(context, "installed-basic");
    const { stderr, code } = await runCli(["not-a-formula"], brew);
    assert.equal(code, 2);
    assert.match(stderr, /not-a-formula is not installed/);
  });
});

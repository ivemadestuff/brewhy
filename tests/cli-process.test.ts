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

  it("sends warnings to stderr and keeps stdout free of them", async (context) => {
    const brew = stubBrew(context, "installed-incomplete");
    const { stdout, stderr, code } = await runCli([], brew);
    assert.equal(code, 0);
    assert.match(stderr, /^warning: /m);
    assert.ok(!stdout.includes("warning:"));
  });

  it("exits 2 for a formula that is not installed", async (context) => {
    const brew = stubBrew(context, "installed-basic");
    const { stderr, code } = await runCli(["not-a-formula"], brew);
    assert.equal(code, 2);
    assert.match(stderr, /not-a-formula is not installed/);
  });
});

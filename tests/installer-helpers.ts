import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const installer = fileURLToPath(new URL("../../scripts/install.sh", import.meta.url));

const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
export const canBuildRelease =
  (major === 22 && minor >= 14) || (major === 24 && minor >= 10) || major > 24;

export function installerEnvironment(context: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "brewhy-installer-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, "home with spaces");
  const tools = join(directory, "tools");
  mkdirSync(home);
  mkdirSync(tools);
  symlinkSync(process.execPath, join(tools, "node"));
  const executable = (name: string, body: string) => {
    const file = join(tools, name);
    writeFileSync(file, `#!${process.execPath}\n${body}\n`);
    chmodSync(file, 0o755);
  };
  executable("uname", 'console.log(process.env.TEST_PLATFORM ?? "Darwin");');
  executable("brew", 'throw new Error("Installer must not execute Homebrew");');
  executable(
    "curl",
    `
const fs = require("node:fs");
const args = process.argv.slice(2);
const output = args[args.indexOf("--output") + 1];
const latest = args.at(-1).endsWith("/releases/latest");
if (process.env.TEST_DOWNLOAD_FAILURE === (latest ? "release" : "archive")) process.exit(22);
if (latest) fs.writeFileSync(output, JSON.stringify({tag_name: process.env.TEST_TAG ?? "v1.2.3"}));
else fs.copyFileSync(process.env.TEST_ARCHIVE, output);
`,
  );
  executable(
    "npm",
    `
const fs = require("node:fs");
fs.appendFileSync(process.env.TEST_NPM_LOG, process.argv.slice(2).join(" ") + "\\n");
if (process.env.TEST_BUILD_FAILURE === "1" && process.argv[2] === "run") process.exit(1);
if (process.argv[2] === "run") {
  fs.mkdirSync("dist");
  fs.writeFileSync("dist/cli.js", '#!/usr/bin/env node\\nimport { readFileSync } from "node:fs";\\nconsole.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).version);\\n');
}
`,
  );
  const source = join(directory, "source");
  mkdirSync(source);
  writeFileSync(join(source, "LICENSE"), "MIT");
  const archive = join(directory, "release.tar.gz");
  const release = (version: string) => {
    writeFileSync(
      join(source, "package.json"),
      JSON.stringify({ name: "brewhy", version, type: "module" }),
    );
    const pack = spawnSync("tar", ["-czf", archive, "-C", directory, "source"]);
    if (pack.status !== 0) throw new Error(pack.stderr.toString());
  };
  release("1.2.3");
  const npmLog = join(directory, "npm.log");
  const env = {
    ...process.env,
    HOME: home,
    SHELL: "/bin/zsh",
    ZDOTDIR: home,
    PATH: `${tools}:/usr/bin:/bin`,
    TEST_ARCHIVE: archive,
    TEST_NPM_LOG: npmLog,
  };
  return {
    release,
    tools,
    home,
    root: join(home, ".local/share/brewhy"),
    bin: join(home, ".local/bin/brewhy"),
    npmLog,
    env,
    run(overrides: NodeJS.ProcessEnv = {}, piped = false, args: string[] = []) {
      return spawnSync("/bin/bash", piped ? ["-s", "--", ...args] : [installer, ...args], {
        env: { ...env, ...overrides },
        encoding: "utf8",
        input: piped ? readFileSync(installer, "utf8") : "",
        timeout: 30_000,
      });
    },
  };
}

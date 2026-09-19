#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "./app.js";
import { SpawnBrewClient } from "./brew/client.js";

function readVersion(): string {
  const require = createRequire(import.meta.url);
  let directory = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(directory, "package.json");
    if (existsSync(candidate)) {
      return (require(candidate) as { version: string }).version;
    }
    const parent = dirname(directory);
    if (parent === directory) return "unknown";
    directory = parent;
  }
}

const DEFAULT_WIDTH = 80;

const version = readVersion();

const controller = new AbortController();
const onInterrupt = (): void => {
  controller.abort();
};
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onInterrupt);

const isBrokenPipe = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException | null)?.code === "EPIPE";

const ignoreBrokenPipe = (error: NodeJS.ErrnoException): void => {
  if (!isBrokenPipe(error)) throw error;
};
process.stdout.on("error", ignoreBrokenPipe);
process.stderr.on("error", ignoreBrokenPipe);

function write(stream: NodeJS.WriteStream, text: string): void {
  try {
    stream.write(text);
  } catch (error) {
    if (!isBrokenPipe(error)) throw error;
  }
}

const result = await run(process.argv.slice(2), {
  client: new SpawnBrewClient({ signal: controller.signal }),
  isTTY: Boolean(process.stdout.isTTY),
  width: process.stdout.columns || DEFAULT_WIDTH,
  version,
});

if (result.stderr) write(process.stderr, result.stderr);
if (result.stdout) write(process.stdout, result.stdout);
process.exitCode = result.exitCode;

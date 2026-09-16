import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { type RunResult, run } from "../src/app.js";
import type { BrewClient } from "../src/brew/client.js";
import { parseInventory } from "../src/brew/parser.js";
import type { Inventory, RawBrewInfo } from "../src/brew/types.js";
import { analyze } from "../src/graph/classify.js";
import { buildGraph } from "../src/graph/graph.js";
import type { Analysis } from "../src/graph/types.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export class StaticBrewClient implements BrewClient {
  constructor(
    private readonly payload: RawBrewInfo,
    private readonly requested: string[] | null,
  ) {}

  async info(): Promise<RawBrewInfo> {
    return this.payload;
  }

  async installedOnRequest(): Promise<string[] | null> {
    return this.requested;
  }
}

export interface Fixture {
  info: RawBrewInfo;
  installed_on_request: string[];
}

export function loadFixture(name: string): Fixture {
  const raw = readFileSync(`${repoRoot}tests/fixtures/${name}.json`, "utf8");
  return JSON.parse(raw) as Fixture;
}

export function inventoryOf(name: string, requested?: string[] | null): Inventory {
  const fixture = loadFixture(name);
  return parseInventory(
    fixture.info,
    requested === undefined ? fixture.installed_on_request : requested,
  );
}

export function analysisOf(name: string, requested?: string[] | null): Analysis {
  const inventory = inventoryOf(name, requested);
  return analyze(inventory, buildGraph(inventory));
}

export async function runFixture(
  name: string,
  argv: string[],
  options: { requested?: string[] | null; width?: number; isTTY?: boolean } = {},
): Promise<RunResult> {
  const fixture = loadFixture(name);
  const requested =
    options.requested === undefined ? fixture.installed_on_request : options.requested;
  return run(argv, {
    client: new StaticBrewClient(fixture.info, requested),
    isTTY: options.isTTY ?? false,
    width: options.width ?? 80,
    version: "0.1.0-test",
  });
}

export function assertSnapshot(name: string, actual: string): void {
  const directory = `${repoRoot}tests/__snapshots__`;
  const file = `${directory}/${name}.txt`;
  if (process.env["UPDATE_SNAPSHOTS"] === "1") {
    mkdirSync(directory, { recursive: true });
    writeFileSync(file, actual, "utf8");
    return;
  }
  assert.ok(
    existsSync(file),
    `Missing snapshot ${name}. Run \`npm run test:update\` to create it.`,
  );
  assert.equal(actual, readFileSync(file, "utf8"), `Snapshot mismatch for ${name}`);
}

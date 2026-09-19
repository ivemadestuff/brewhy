import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SpawnBrewClient, parseInfoJSON } from "../src/brew/client.js";
import { BrewhyError } from "../src/errors.js";
import { createExecutable } from "./executables.js";
import { loadFixture } from "./helpers.js";

describe("SpawnBrewClient", () => {
  it("reports a missing Homebrew installation instead of a raw ENOENT", async () => {
    const client = new SpawnBrewClient({ brewPath: "brewhy-definitely-not-installed" });
    await assert.rejects(client.info(), (error: unknown) => {
      assert.ok(error instanceof BrewhyError);
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /Homebrew was not found/);
      return true;
    });
  });

  it("reads BREWHY_BREW_PATH from the injected environment, not the process", async () => {
    const client = new SpawnBrewClient({
      env: { BREWHY_BREW_PATH: "brewhy-definitely-not-installed" },
    });
    await assert.rejects(client.info(), /brewhy-definitely-not-installed/);
  });

  it("hands the child the injected environment", async (context) => {
    const client = new SpawnBrewClient({
      brewPath: createExecutable(
        context,
        'printf "BREWHY_MARKER=%s\\n" "$BREWHY_MARKER" >&2\nexit 3',
      ).file,
      env: { BREWHY_MARKER: "injected" },
    });
    await assert.rejects(client.info(), /BREWHY_MARKER=injected/);
  });

  it("reports a timeout when Homebrew does not finish", async (context) => {
    const client = new SpawnBrewClient({
      brewPath: createExecutable(context, "exec sleep 30").file,
      timeoutMs: 100,
    });
    await assert.rejects(client.info(), /timed out/);
  });

  it("reports an interruption rather than a timeout when aborted", async (context) => {
    const controller = new AbortController();
    const client = new SpawnBrewClient({
      brewPath: createExecutable(context, "exec sleep 30").file,
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    const pending = client.info();
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, /was interrupted/);
  });

  it("rethrows an interruption from the requested-list query instead of recovering", async (context) => {
    const controller = new AbortController();
    const client = new SpawnBrewClient({
      brewPath: createExecutable(context, "exec sleep 30").file,
      timeoutMs: 30_000,
      signal: controller.signal,
    });
    const pending = client.installedOnRequest();
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, /was interrupted/);
  });

  it("treats a failing requested-list query as recoverable", async () => {
    const client = new SpawnBrewClient({ brewPath: "brewhy-definitely-not-installed" });
    assert.equal(await client.installedOnRequest(), null);
  });
});

describe("parseInfoJSON", () => {
  it("accepts the fixture payloads", () => {
    const fixture = loadFixture("installed-basic");
    assert.doesNotThrow(() => parseInfoJSON(JSON.stringify(fixture.info)));
  });

  it("rejects malformed JSON with an operational error", () => {
    assert.throws(() => parseInfoJSON("{ not json"), /Could not parse/);
  });

  it("rejects payloads without the v2 installed shape", () => {
    assert.throws(() => parseInfoJSON('{"something":1}'), /formulae/);
    assert.throws(() => parseInfoJSON("[]"), /not an object/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseArgs } from "../src/args.js";

describe("parseArgs", () => {
  it("defaults to the whole inventory", () => {
    const parsed = parseArgs([]);
    assert.equal(parsed.name, null);
    assert.equal(parsed.kind, null);
    assert.equal(parsed.help, false);
    assert.equal(parsed.isCaskListHidden, false);
    assert.equal(parsed.version, false);
  });

  it("accepts a single package name", () => {
    const parsed = parseArgs(["openssl@3"]);
    assert.equal(parsed.name, "openssl@3");
    assert.equal(parsed.kind, null);
  });

  it("accepts --cask with a name as a lookup qualifier", () => {
    const parsed = parseArgs(["--cask", "firefox"]);
    assert.equal(parsed.name, "firefox");
    assert.equal(parsed.kind, "cask");
  });

  it("accepts --formula with a name as a lookup qualifier", () => {
    const parsed = parseArgs(["wget", "--formula"]);
    assert.equal(parsed.name, "wget");
    assert.equal(parsed.kind, "formula");
  });

  it("rejects --cask without a name rather than treating it as an inventory filter", () => {
    assert.throws(() => parseArgs(["--cask"]), /--cask explains one installed cask/);
  });

  it("rejects --formula without a name rather than treating it as an inventory filter", () => {
    assert.throws(() => parseArgs(["--formula"]), /--formula explains one installed formula/);
  });

  it("rejects combining --cask and --formula", () => {
    assert.throws(() => parseArgs(["--cask", "--formula", "docker"]), /Cannot combine/);
  });

  it("rejects more than one package name", () => {
    assert.throws(() => parseArgs(["node", "wget"]), /at most one package name/);
  });

  it("rejects unknown options", () => {
    assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
    assert.throws(() => parseArgs(["--tree"]), /Unknown option: --tree/);
    assert.throws(() => parseArgs(["-h"]), /Unknown option: -h/);
    assert.throws(() => parseArgs(["-v"]), /Unknown option: -v/);
  });

  it("treats everything after -- as a name", () => {
    assert.equal(parseArgs(["--", "-weird-name"]).name, "-weird-name");
  });
});

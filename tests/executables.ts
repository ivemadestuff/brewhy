import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";

export function createExecutable(
  context: TestContext,
  script: string,
): { directory: string; file: string } {
  const directory = mkdtempSync(join(tmpdir(), "brewhy-test-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, "brew");
  writeFileSync(file, `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  return { directory, file };
}

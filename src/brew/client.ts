import { execFile } from "node:child_process";

import { operationalError } from "../errors.js";
import type { RawBrewInfo } from "./types.js";

const INFO_ARGS = ["info", "--json=v2", "--installed"];
const REQUESTED_ARGS = ["list", "--formula", "--installed-on-request"];

const MAX_BUFFER = 128 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface BrewClient {
  info(): Promise<RawBrewInfo>;
  installedOnRequest(): Promise<string[] | null>;
}

export interface BrewClientOptions {
  brewPath?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

interface Query {
  brewPath: string;
  args: string[];
  timeoutMs: number;
  signal: AbortSignal | undefined;
  env: NodeJS.ProcessEnv;
}

function run(query: Query): Promise<string> {
  const { brewPath, args, timeoutMs, signal } = query;
  return new Promise((resolve, reject) => {
    execFile(
      brewPath,
      args,
      {
        shell: false,
        encoding: "utf8",
        maxBuffer: MAX_BUFFER,
        timeout: timeoutMs,
        signal,
        env: {
          ...query.env,
          HOMEBREW_NO_AUTO_UPDATE: "1",
          HOMEBREW_NO_ANALYTICS: "1",
          HOMEBREW_NO_ENV_HINTS: "1",
          HOMEBREW_COLOR: "",
          HOMEBREW_NO_COLOR: "1",
        },
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            describeFailure(error, brewPath, args, String(stderr ?? ""), signal?.aborted === true),
          );
          return;
        }
        resolve(String(stdout));
      },
    );
  });
}

interface ExecFailure {
  code?: string | number | null;
  killed?: boolean;
  signal?: string | null;
  name?: string;
}

function describeFailure(
  error: ExecFailure,
  brewPath: string,
  args: string[],
  stderr: string,
  aborted: boolean,
): Error {
  const command = `${brewPath} ${args.join(" ")}`;
  if (error.code === "ENOENT") {
    return operationalError(
      `Homebrew was not found (tried to run \`${brewPath}\`).`,
      "Install Homebrew from https://brew.sh, or set BREWHY_BREW_PATH to your brew executable.",
    );
  }
  if (aborted || error.name === "AbortError" || error.code === "ABORT_ERR") {
    return operationalError(`\`${command}\` was interrupted.`);
  }
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return operationalError(
      `\`${command}\` produced more output than Brewhy is willing to buffer.`,
      "This is unexpected for an installed-package query; run the command yourself to see how large its output is.",
    );
  }
  if (error.killed || error.signal === "SIGTERM" || error.code === "ETIMEDOUT") {
    return operationalError(
      `\`${command}\` timed out.`,
      "Homebrew may be waiting on a lock or a slow disk. Try again once other brew commands have finished.",
    );
  }
  const detail = stderr.trim().split("\n").slice(0, 5).join("\n");
  return operationalError(
    `\`${command}\` failed.${detail ? `\n${detail}` : ""}`,
    "Run the command yourself to see Homebrew's full output.",
  );
}

export class SpawnBrewClient implements BrewClient {
  private readonly brewPath: string;
  private readonly timeoutMs: number;
  private readonly signal: AbortSignal | undefined;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: BrewClientOptions = {}) {
    this.env = options.env ?? process.env;
    this.brewPath = options.brewPath?.trim() || this.env["BREWHY_BREW_PATH"]?.trim() || "brew";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.signal = options.signal;
  }

  private query(args: string[]): Query {
    return {
      brewPath: this.brewPath,
      args,
      timeoutMs: this.timeoutMs,
      signal: this.signal,
      env: this.env,
    };
  }

  async info(): Promise<RawBrewInfo> {
    return parseInfoJSON(await run(this.query(INFO_ARGS)));
  }

  async installedOnRequest(): Promise<string[] | null> {
    try {
      const stdout = await run(this.query(REQUESTED_ARGS));
      return stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch (error) {
      if (this.signal?.aborted === true) throw error;
      return null;
    }
  }
}

export function parseInfoJSON(stdout: string): RawBrewInfo {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw operationalError(
      `Could not parse Homebrew's JSON output: ${(error as Error).message}`,
      "Run `brew info --json=v2 --installed` to check whether Homebrew produces valid JSON.",
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw operationalError(
      "Homebrew's JSON output was not an object.",
      "Brewhy requires a Homebrew version that supports `brew info --json=v2 --installed`.",
    );
  }
  const payload = parsed as RawBrewInfo;
  if (!Array.isArray(payload.formulae) && !Array.isArray(payload.casks)) {
    throw operationalError(
      "Homebrew's JSON output did not contain `formulae` or `casks` arrays.",
      "Brewhy requires a Homebrew version that supports the v2 installed JSON schema.",
    );
  }
  return payload;
}

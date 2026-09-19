import { parseArgs } from "./args.js";
import type { BrewClient } from "./brew/client.js";
import { parseInventory } from "./brew/parser.js";
import { BrewhyError, EXIT_OK, EXIT_OPERATIONAL } from "./errors.js";
import { analyze } from "./graph/classify.js";
import { buildGraph } from "./graph/graph.js";
import { resolvePackage } from "./lookup.js";
import { renderBanner } from "./render/banner.js";
import { renderDetail } from "./render/detail.js";
import { helpText } from "./render/help.js";
import { renderOverview } from "./render/overview.js";

const MAX_PRINTED_WARNINGS = 20;

export interface RunDependencies {
  client: BrewClient;
  isTTY: boolean;
  width: number;
  version: string;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function run(argv: string[], deps: RunDependencies): Promise<RunResult> {
  try {
    return await execute(argv, deps);
  } catch (error) {
    if (error instanceof BrewhyError) {
      return {
        stdout: "",
        stderr: formatError(error.message, error.hint),
        exitCode: error.exitCode,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      stdout: "",
      stderr: formatError(`Unexpected failure: ${message}`),
      exitCode: EXIT_OPERATIONAL,
    };
  }
}

async function execute(argv: string[], deps: RunDependencies): Promise<RunResult> {
  const parsed = parseArgs(argv);

  if (parsed.help) {
    return { stdout: helpText(deps.isTTY), stderr: "", exitCode: EXIT_OK };
  }
  if (parsed.version) {
    return { stdout: `${deps.version}\n`, stderr: "", exitCode: EXIT_OK };
  }

  const [info, requested] = await Promise.all([
    deps.client.info(),
    deps.client.installedOnRequest(),
  ]);

  const inventory = parseInventory(info, requested);
  const graph = buildGraph(inventory);
  const analysis = analyze(inventory, graph);

  const detail = parsed.name === null ? null : resolvePackage(analysis, parsed.name, parsed.kind);
  const textOptions = { width: deps.width, isTTY: deps.isTTY };

  const lines =
    detail !== null
      ? renderDetail(analysis, detail, textOptions)
      : renderOverview(analysis, {
          ...textOptions,
          isCaskListHidden: parsed.isCaskListHidden,
        });

  const opening = deps.isTTY ? ["", ...(detail === null ? renderBanner(textOptions) : [])] : [];
  const trailer = deps.isTTY ? [""] : [];
  return {
    stdout: `${[...opening, ...lines, ...trailer].join("\n")}\n`,
    stderr: formatWarnings(analysis.warnings),
    exitCode: EXIT_OK,
  };
}

function formatWarnings(warnings: string[]): string {
  if (warnings.length === 0) return "";
  const shown = warnings.slice(0, MAX_PRINTED_WARNINGS);
  const lines = shown.map((warning) => `warning: ${warning}`);
  if (warnings.length > shown.length) {
    lines.push(`warning: ${warnings.length - shown.length} more warnings not shown.`);
  }
  return `${lines.join("\n")}\n`;
}

function formatError(message: string, hint?: string): string {
  const lines = [`error: ${message}`];
  if (hint) lines.push(hint);
  return `${lines.join("\n")}\n`;
}

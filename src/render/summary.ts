import type { Analysis } from "../graph/types.js";
import { plural } from "./layout.js";

export function renderSummaryBlock(
  analysis: Analysis,
  isCaskListHidden = false,
  isTTY = false,
): string[] {
  return ["Summary:", ...renderCounts(analysis, isCaskListHidden, isTTY)];
}

function renderCounts(analysis: Analysis, isCaskListHidden: boolean, isTTY: boolean): string[] {
  const { summary } = analysis;
  const lines = [`${summary.requested} Directly installed`];
  const caskCount = analysis.inventory.casks.size;
  if (caskCount > 0) {
    const hidden = isCaskListHidden ? (isTTY ? " \x1b[2m(Hidden)\x1b[0m" : " (Hidden)") : "";
    lines.push(`${caskCount} ${plural(caskCount, "Cask", "Casks")}${hidden}`);
  }
  lines.push(
    `${summary.automatic} ${plural(summary.automatic, "Dependency", "Dependencies")}`,
    `${summary.shared} Shared ${plural(summary.shared, "dependency", "dependencies")}`,
  );
  if (summary.unknown > 0) {
    lines.push(`${summary.unknown} With unknown intent`);
  }
  if (summary.unexplained > 0) {
    lines.push(`${summary.unexplained} Unexplained`);
  }
  return lines;
}

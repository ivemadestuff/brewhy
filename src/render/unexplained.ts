import type { Analysis } from "../graph/types.js";
import { type TextOptions, budgetOf, packLines } from "./layout.js";

const NOTE = {
  one:
    "No requested formula root or installed cask source reaches this formula " +
    "in the available metadata. This does not mean the formula is safe to remove.",
  many:
    "No requested formula root or installed cask source reaches these formulae " +
    "in the available metadata. This does not mean they are safe to remove.",
};

export function renderUnexplainedNote(subject: keyof typeof NOTE, options: TextOptions): string[] {
  return packLines(NOTE[subject].split(" "), budgetOf(options));
}

const NAME_INDENT = "  ";

export function renderUnexplainedBlock(analysis: Analysis, options: TextOptions): string[] {
  const unexplained = analysis.packages.filter((facts) => facts.isUnexplained);
  if (unexplained.length === 0) return [];
  return [
    "",
    "Unexplained",
    ...unexplained.map((facts) => NAME_INDENT + facts.label),
    "",
    ...renderUnexplainedNote(unexplained.length === 1 ? "one" : "many", options),
  ];
}

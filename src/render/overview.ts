import { labelOf, typeOf } from "../graph/labels.js";
import type { Analysis, RootFacts } from "../graph/types.js";
import { labelled } from "./labels.js";
import { type TextOptions, composeLine, plural, wrapNames } from "./layout.js";
import { renderSummaryBlock } from "./summary.js";
import { renderUnexplainedBlock } from "./unexplained.js";

export function renderOverview(
  analysis: Analysis,
  options: TextOptions & { isCaskListHidden?: boolean },
): string[] {
  const formulae = analysis.roots.filter((root) => root.type === "formula");
  const casks = analysis.roots.filter((root) => root.type === "cask");
  return [
    ...renderSummaryBlock(analysis, options.isCaskListHidden, options.isTTY),
    ...renderSection("Installed Formulae:", formulae, analysis, options),
    ...(options.isCaskListHidden
      ? []
      : renderSection("Installed Casks:", casks, analysis, options)),
    ...renderUnexplainedBlock(analysis, options),
  ];
}

function renderSection(
  title: string,
  roots: RootFacts[],
  analysis: Analysis,
  options: TextOptions,
): string[] {
  if (roots.length === 0) return [];
  return ["", title, ...renderRoots(roots, analysis, options)];
}

function renderRoots(roots: RootFacts[], analysis: Analysis, options: TextOptions): string[] {
  return roots.flatMap((root) => [
    rootRow(root, options),
    ...wrapNames(
      root.dependencies.map((ID) => labelled(labelOf(analysis, ID), typeOf(ID))),
      options,
    ),
  ]);
}

function rootRow(root: RootFacts, options: TextOptions): string {
  const head = `✓ ${root.label}`;
  const annotation = rootAnnotation(root);
  const line = annotation === null ? head : composeLine(head, annotation, options, " ");
  if (!options.isTTY) return line;
  return `\x1b[1m${head}\x1b[0m${line.slice(head.length)}`;
}

function rootAnnotation(root: RootFacts): string | null {
  if (root.dependencies.length === 0) return null;
  const hasCask = root.dependencies.some((ID) => typeOf(ID) === "cask");
  const dependencies = `${root.dependencies.length} ${plural(
    root.dependencies.length,
    hasCask ? "Package" : "Dependency",
    hasCask ? "Packages" : "Dependencies",
  )}`;
  return root.exclusive.length > 0
    ? `(${dependencies}, ${root.exclusive.length} Exclusive)`
    : `(${dependencies})`;
}

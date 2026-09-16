import type { Intent } from "../brew/types.js";
import { compareLabels, labelOf, typeOf } from "../graph/labels.js";
import type { Analysis, ExplainedPackage, RootFacts } from "../graph/types.js";
import { renderHeading } from "./heading.js";
import { labelled, sourceLabel } from "./labels.js";
import { type DefinitionRow, type TextOptions, definitionList, plural } from "./layout.js";
import { renderUnexplainedNote } from "./unexplained.js";

export function renderDetail(
  analysis: Analysis,
  facts: ExplainedPackage,
  options: TextOptions,
): string[] {
  const root = rootFor(analysis, facts);
  const lines = renderHeading(facts, options);
  lines.push("", ...definitionList(detailRows(analysis, facts, root), options));
  if (facts.type === "formula" && facts.isUnexplained) {
    lines.push("", ...renderUnexplainedNote("one", options));
  }
  return lines;
}

function detailRows(
  analysis: Analysis,
  facts: ExplainedPackage,
  root: RootFacts | undefined,
): DefinitionRow[] {
  const rows: DefinitionRow[] = factRows(facts, root);

  rows.push({
    label: "Requires directly",
    names: labelledNames(analysis, directIDs(facts)),
  });
  if (root !== undefined) {
    rows.push({
      label: "Everything it brings in",
      names: labelledNames(analysis, root.dependencies),
    });
    rows.push({
      label: `Only through ${facts.label}`,
      names: labelledNames(analysis, root.exclusive),
    });
  }
  rows.push(...explanationRows(facts, root));
  return rows;
}

function directIDs(facts: ExplainedPackage): string[] {
  return facts.type === "formula" ? facts.node.directDependencies : facts.node.dependencies;
}

function labelledNames(analysis: Analysis, IDs: string[]): string[] {
  return [...IDs]
    .sort((left, right) => compareLabels(labelOf(analysis, left), labelOf(analysis, right)))
    .map((ID) => labelled(labelOf(analysis, ID), typeOf(ID)));
}

function explanationRows(facts: ExplainedPackage, root: RootFacts | undefined): DefinitionRow[] {
  const dependents = facts.immediateDependents.map(sourceLabel);
  const asRoot =
    facts.type === "cask"
      ? root !== undefined
      : facts.intent === "requested" || facts.isUnexplained;
  if (asRoot) {
    return root === undefined ? [] : [{ label: "Also required by", names: dependents }];
  }
  const sources = [...facts.requestedFormulaRoots, ...facts.caskReasonSources].map(sourceLabel);
  return [
    { label: "Directly required by", names: dependents },
    { label: "Installed because of", names: sources },
    ...reasonPaths(facts),
  ];
}

const UNEXPLAINED_FACT = "Unexplained";

const INTENT_LABEL: Record<Intent, string> = {
  requested: "on request",
  automatic: "as a dependency",
  unknown: "intent unknown",
};

function factRows(facts: ExplainedPackage, root: RootFacts | undefined): DefinitionRow[] {
  const rows: DefinitionRow[] = [
    {
      label: "Installed",
      value: facts.type === "cask" ? "as a cask" : INTENT_LABEL[facts.intent],
    },
  ];

  if (root !== undefined && root.dependencies.length > 0) {
    const hasCask = root.dependencies.some((ID) => typeOf(ID) === "cask");
    const count = `${root.dependencies.length} ${plural(
      root.dependencies.length,
      hasCask ? "package" : "formula",
      hasCask ? "packages" : "formulae",
    )}`;
    rows.push({
      label: "Brings in",
      value:
        root.exclusive.length > 0
          ? `${count}, ${root.exclusive.length} only through ${facts.label}`
          : count,
    });
  }

  if (facts.isShared) {
    const sources = facts.requestedFormulaRoots.length + facts.caskReasonSources.length;
    rows.push({ label: "Explained by", value: `${sources} reason sources` });
  }

  if (facts.type === "formula" && facts.isUnexplained) {
    rows.push({
      label: "Reason",
      value: UNEXPLAINED_FACT,
    });
  }
  return rows;
}

function reasonPaths(facts: ExplainedPackage): DefinitionRow[] {
  const paths = facts.reasonPaths.filter((reasonPath) => reasonPath.path.length > 2);
  if (paths.length === 0) return [];
  return [
    {
      label: "How it got here",
      entries: paths.map((reasonPath) =>
        reasonPath.path
          .map((name, index) => labelled(name, reasonPath.pathTypes[index] ?? "formula"))
          .join(" → "),
      ),
    },
  ];
}

function rootFor(analysis: Analysis, facts: ExplainedPackage): RootFacts | undefined {
  return analysis.roots.find((root) => root.ID === facts.node.ID);
}

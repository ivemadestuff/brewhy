import type { CaskNode, FormulaNode, Inventory } from "../brew/types.js";
import type { DependencyGraph } from "./graph.js";
import { buildLabels, compareLabels, labelIn, labelOf, typeOf } from "./labels.js";
import {
  type ReachabilityIndex,
  addReachability,
  buildReachability,
  reconstructPath,
} from "./paths.js";
import type {
  Analysis,
  CaskFacts,
  PackageFacts,
  PackageRelations,
  ReasonPath,
  ReasonSource,
  RootFacts,
  Summary,
} from "./types.js";

function summarize(packages: PackageFacts[]): Summary {
  return {
    total: packages.length,
    requested: packages.filter((facts) => facts.intent === "requested").length,
    automatic: packages.filter((facts) => facts.intent === "automatic").length,
    unknown: packages.filter((facts) => facts.intent === "unknown").length,
    shared: packages.filter((facts) => facts.isShared).length,
    unexplained: packages.filter((facts) => facts.isUnexplained).length,
  };
}

export function analyze(inventory: Inventory, graph: DependencyGraph): Analysis {
  const labels = buildLabels(inventory);
  const reachability = buildReachability(graph, [
    ...graph.requestedRootIDs,
    ...graph.topLevelCaskIDs,
  ]);
  const unreachedCasks = unreachedCaskIDs(graph, inventory, reachability);
  addReachability(reachability, graph, unreachedCasks);
  const caskSources = [...graph.topLevelCaskIDs, ...unreachedCasks];

  const context: FactsContext = { graph, labels, reachability };
  const packages = [...inventory.formulae.values()]
    .map((node) => formulaFacts(node, context))
    .sort((a, b) => compareLabels(a.label, b.label));
  const casks = [...inventory.casks.values()]
    .map((node) => caskFacts(node, context))
    .sort((a, b) => compareLabels(a.label, b.label));

  const withoutRoots = {
    inventory,
    graph,
    reachability,
    packages,
    casks,
    byID: new Map(packages.map((facts) => [facts.node.ID, facts])),
    caskByID: new Map(casks.map((facts) => [facts.node.ID, facts])),
    labels,
    summary: summarize(packages),
    warnings: inventory.warnings,
  };
  return { ...withoutRoots, roots: summarizeRoots(withoutRoots, caskSources) };
}

interface FactsContext {
  graph: DependencyGraph;
  labels: Map<string, string>;
  reachability: ReachabilityIndex;
}

function packageRelations(nodeID: string, context: FactsContext): PackageRelations {
  const { graph, labels, reachability } = context;
  const toSource = (ID: string): ReasonSource => ({
    ID,
    name: labelIn(labels, ID),
    type: typeOf(ID),
  });

  const requestedFormulaRoots: ReasonSource[] = [];
  const caskReasonSources: ReasonSource[] = [];
  for (const sourceID of reachability.sourcesByNode.get(nodeID) ?? []) {
    const source = toSource(sourceID);
    if (source.type === "cask") caskReasonSources.push(source);
    else requestedFormulaRoots.push(source);
  }
  sortSources(requestedFormulaRoots);
  sortSources(caskReasonSources);

  const dependents = (graph.reverse.get(nodeID) ?? []).map(toSource);
  sortSources(dependents);
  const sources = [...requestedFormulaRoots, ...caskReasonSources];
  return {
    label: labelIn(labels, nodeID),
    isShared: sources.length >= 2,
    requestedFormulaRoots,
    caskReasonSources,
    immediateDependents: dependents,
    reasonPaths: pathsTo(nodeID, sources, context),
  };
}

function formulaFacts(node: FormulaNode, context: FactsContext): PackageFacts {
  const relations = packageRelations(node.ID, context);
  return {
    ...relations,
    type: "formula",
    node,
    intent: node.intent,
    isUnexplained:
      node.intent !== "requested" &&
      relations.requestedFormulaRoots.length === 0 &&
      relations.caskReasonSources.length === 0,
  };
}

function caskFacts(node: CaskNode, context: FactsContext): CaskFacts {
  return { ...packageRelations(node.ID, context), type: "cask", node };
}

function pathsTo(nodeID: string, sources: ReasonSource[], context: FactsContext): ReasonPath[] {
  const paths: ReasonPath[] = [];
  for (const source of sources) {
    const predecessor = context.reachability.bySource.get(source.ID);
    if (!predecessor) continue;
    const path = reconstructPath(predecessor, nodeID);
    if (!path) continue;
    paths.push({
      source: source.name,
      sourceType: source.type,
      path: path.map((ID) => labelIn(context.labels, ID)),
      pathTypes: path.map(typeOf),
    });
  }
  return paths;
}

type RootlessAnalysis = Omit<Analysis, "roots">;

function unreachedCaskIDs(
  graph: DependencyGraph,
  inventory: Inventory,
  reached: ReachabilityIndex,
): string[] {
  const topLevel = new Set(graph.topLevelCaskIDs);
  return [...inventory.casks.keys()]
    .filter((ID) => !topLevel.has(ID) && !reached.sourcesByNode.has(ID))
    .sort();
}

function summarizeRoots(analysis: RootlessAnalysis, caskSources: string[]): RootFacts[] {
  const byLabel = (left: string, right: string): number =>
    compareLabels(labelOf(analysis, left), labelOf(analysis, right));

  const rootIDs = [
    ...[...analysis.graph.requestedRootIDs].sort(byLabel),
    ...[...caskSources].sort(byLabel),
  ];

  const grouped = new Map(
    rootIDs.map((ID) => [ID, { dependencies: [] as string[], exclusive: [] as string[] }]),
  );
  for (const [nodeID, sources] of analysis.reachability.sourcesByNode) {
    for (const sourceID of sources) {
      const entry = grouped.get(sourceID);
      if (!entry) continue;
      entry.dependencies.push(nodeID);
      if (sources.length === 1) entry.exclusive.push(nodeID);
    }
  }

  return rootIDs.map((ID) => {
    const entry = grouped.get(ID);
    return {
      ID,
      label: labelOf(analysis, ID),
      type: typeOf(ID),
      dependencies: [...(entry?.dependencies ?? [])].sort(byLabel),
      exclusive: [...(entry?.exclusive ?? [])].sort(byLabel),
    };
  });
}

function sortSources(sources: ReasonSource[]): void {
  sources.sort((a, b) => compareLabels(a.name, b.name));
}

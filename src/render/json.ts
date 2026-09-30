import { reconstructPath } from "../graph/paths.js";
import type { Analysis, ExplainedPackage } from "../graph/types.js";

export function renderJSON(analysis: Analysis, detail: ExplainedPackage | null): string {
  const data =
    detail === null
      ? {
          schemaVersion: 1,
          summary: { ...analysis.summary, casks: analysis.casks.length },
          packages: [...analysis.packages, ...analysis.casks].map((facts) =>
            packageJSON(analysis, facts),
          ),
          roots: analysis.roots,
        }
      : { schemaVersion: 1, package: packageJSON(analysis, detail) };
  return `${JSON.stringify(data, null, 2)}\n`;
}

function packageJSON(analysis: Analysis, facts: ExplainedPackage) {
  const { node } = facts;
  const sources = [...facts.requestedFormulaRoots, ...facts.caskReasonSources];
  return {
    ID: node.ID,
    type: facts.type,
    name: facts.type === "formula" ? facts.node.name : facts.node.token,
    fullName: facts.type === "formula" ? facts.node.fullName : facts.node.fullToken,
    description: node.description ?? null,
    homepage: node.homepage ?? null,
    tap: node.tap ?? null,
    installedVersions:
      facts.type === "formula"
        ? facts.node.installedVersions
        : facts.node.version === undefined
          ? []
          : [facts.node.version],
    intent: facts.type === "formula" ? facts.intent : null,
    isUnexplained: facts.type === "formula" ? facts.isUnexplained : null,
    isShared: facts.isShared,
    dependencies: node.dependencies,
    directDependencies:
      facts.type === "formula" ? facts.node.directDependencies : node.dependencies,
    immediateDependents: facts.immediateDependents.map((source) => source.ID),
    requestedFormulaRoots: facts.requestedFormulaRoots.map((source) => source.ID),
    caskReasonSources: facts.caskReasonSources.map((source) => source.ID),
    reasonPaths: sources.flatMap((source) => {
      const predecessor = analysis.directReachability.bySource.get(source.ID);
      const path = predecessor ? reconstructPath(predecessor, node.ID) : null;
      return path === null ? [] : [{ source: source.ID, path }];
    }),
  };
}

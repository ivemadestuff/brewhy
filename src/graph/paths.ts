import type { DependencyGraph } from "./graph.js";

export function shortestPathsFrom(
  graph: DependencyGraph,
  sourceID: string,
): Map<string, string | null> {
  const predecessor = new Map<string, string | null>();
  predecessor.set(sourceID, null);
  const queue: string[] = [sourceID];

  for (const current of queue) {
    for (const next of graph.edges.get(current) ?? []) {
      if (predecessor.has(next)) continue;
      predecessor.set(next, current);
      queue.push(next);
    }
  }

  return predecessor;
}

export function reconstructPath(
  predecessor: Map<string, string | null>,
  targetID: string,
): string[] | null {
  if (!predecessor.has(targetID)) return null;
  const path: string[] = [];
  let cursor: string | null | undefined = targetID;
  const seen = new Set<string>();
  while (cursor !== null && cursor !== undefined) {
    if (seen.has(cursor)) break;
    seen.add(cursor);
    path.push(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }
  return path.reverse();
}

export interface ReachabilityIndex {
  bySource: Map<string, Map<string, string | null>>;
  sourcesByNode: Map<string, string[]>;
}

export function buildReachability(graph: DependencyGraph, sourceIDs: string[]): ReachabilityIndex {
  const index: ReachabilityIndex = {
    bySource: new Map(),
    sourcesByNode: new Map(),
  };
  addReachability(index, graph, sourceIDs);
  return index;
}

export function addReachability(
  index: ReachabilityIndex,
  graph: DependencyGraph,
  sourceIDs: string[],
): void {
  for (const sourceID of sourceIDs) {
    const predecessor = shortestPathsFrom(graph, sourceID);
    index.bySource.set(sourceID, predecessor);
    for (const nodeID of predecessor.keys()) {
      if (nodeID === sourceID) continue;
      const sources = index.sourcesByNode.get(nodeID);
      if (sources) {
        sources.push(sourceID);
      } else {
        index.sourcesByNode.set(nodeID, [sourceID]);
      }
    }
  }

  for (const sources of index.sourcesByNode.values()) {
    sources.sort();
  }
}

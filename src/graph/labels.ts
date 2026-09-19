import { splitID } from "../brew/ids.js";
import type { Inventory, NodeType } from "../brew/types.js";
import type { Analysis } from "./types.js";

export function buildLabels(inventory: Inventory): Map<string, string> {
  const labels = new Map<string, string>();

  const nameCounts = new Map<string, number>();
  for (const node of inventory.formulae.values()) {
    nameCounts.set(node.name, (nameCounts.get(node.name) ?? 0) + 1);
  }
  for (const node of inventory.formulae.values()) {
    const ambiguous = (nameCounts.get(node.name) ?? 0) > 1;
    labels.set(node.ID, ambiguous ? node.fullName : node.name);
  }

  const tokenCounts = new Map<string, number>();
  for (const node of inventory.casks.values()) {
    tokenCounts.set(node.token, (tokenCounts.get(node.token) ?? 0) + 1);
  }
  for (const node of inventory.casks.values()) {
    const ambiguous = (tokenCounts.get(node.token) ?? 0) > 1;
    labels.set(node.ID, ambiguous ? node.fullToken : node.token);
  }
  return labels;
}

export function labelIn(labels: ReadonlyMap<string, string>, ID: string): string {
  return labels.get(ID) ?? splitID(ID).name;
}

export function typeOf(ID: string): NodeType {
  return splitID(ID).type;
}

export function compareLabels(a: string, b: string): number {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA < lowerB) return -1;
  if (lowerA > lowerB) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function labelOf(analysis: Pick<Analysis, "labels">, ID: string): string {
  return labelIn(analysis.labels, ID);
}

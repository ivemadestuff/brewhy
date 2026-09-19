import type { NodeType } from "../brew/types.js";
import type { ReasonSource } from "../graph/types.js";

function typeSuffix(type: NodeType): string {
  return type === "cask" ? " (cask)" : "";
}

export function labelled(name: string, type: NodeType): string {
  return `${name}${typeSuffix(type)}`;
}

export function sourceLabel(source: ReasonSource): string {
  return labelled(source.name, source.type);
}

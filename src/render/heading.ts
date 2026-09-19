import type { ExplainedPackage } from "../graph/types.js";
import { type TextOptions, budgetOf, clipTo } from "./layout.js";

export function renderHeading(facts: ExplainedPackage, options: TextOptions): string[] {
  const label = facts.label;
  const version = headingVersion(facts);
  const body = headingBody(facts);

  const titleWidth = label.length + (version.length > 0 ? version.length + 2 : 0);
  const inner = Math.max(
    1,
    Math.min(budgetOf(options) - 4, Math.max(titleWidth, ...body.map((line) => line.length))),
  );

  const rows: string[] = [];
  if (version.length > 0 && label.length + 2 + version.length <= inner) {
    const gap = " ".repeat(inner - label.length - version.length);
    rows.push(`${label}${gap}${version}`);
  } else {
    const shownLabel = clipTo(label, inner);
    rows.push(`${shownLabel}${" ".repeat(inner - shownLabel.length)}`);
    if (version.length > 0) {
      const shownVersion = clipTo(version, inner);
      rows.push(`${shownVersion}${" ".repeat(inner - shownVersion.length)}`);
    }
  }

  body.forEach((line) => {
    const text = clipTo(line, inner);
    rows.push(text + " ".repeat(inner - text.length));
  });

  const rule = "═".repeat(inner + 2);
  return [`╔${rule}╗`, ...rows.map((row) => `║ ${row} ║`), `╚${rule}╝`];
}

function headingVersion(facts: ExplainedPackage): string {
  if (facts.type === "cask") return facts.node.version ?? "";
  return facts.node.installedVersions.join(", ");
}

function headingBody(facts: ExplainedPackage): string[] {
  if (facts.type === "cask") {
    const human = facts.node.names[0];
    const lines: string[] = [];
    if (human !== undefined && human !== facts.label) lines.push(human);
    if (facts.node.description !== undefined) lines.push(facts.node.description);
    if (facts.node.homepage !== undefined) lines.push(facts.node.homepage);
    return lines;
  }
  return [facts.node.description, facts.node.homepage].filter(
    (line): line is string => line !== undefined,
  );
}

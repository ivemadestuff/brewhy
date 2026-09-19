import { renderOverview } from "../src/render/overview.js";
import { analysisOf } from "./helpers.js";

export const plainOptions = { width: 80 };

export function stripSgr(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export const MIN_TERMINAL_WIDTH = 40;

export const FIXTURES = [
  "installed-basic",
  "installed-wide-root",
  "installed-shared",
  "installed-cask-context",
  "installed-cask-aliases",
  "installed-cask-cyclic",
  "installed-incomplete",
  "installed-one-unexplained",
  "installed-cyclic",
  "installed-multiple-versions",
  "installed-tap-names",
];

export function overview(fixture: string): string {
  return `${renderOverview(analysisOf(fixture), plainOptions).join("\n")}\n`;
}

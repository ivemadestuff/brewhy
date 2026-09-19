import { type TextOptions, budgetOf } from "./layout.js";

const BANNER = [
  "██████╗ ██████╗ ███████╗██╗    ██╗██╗  ██╗██╗   ██╗",
  "██╔══██╗██╔══██╗██╔════╝██║    ██║██║  ██║╚██╗ ██╔╝",
  "██████╔╝██████╔╝█████╗  ██║ █╗ ██║███████║ ╚████╔╝",
  "██╔══██╗██╔══██╗██╔══╝  ██║███╗██║██╔══██║  ╚██╔╝",
  "██████╔╝██║  ██║███████╗╚███╔███╔╝██║  ██║   ██║",
  "╚═════╝ ╚═╝  ╚═╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝   ╚═╝",
];

const BANNER_WIDTH = 51;

export function renderBanner(options: TextOptions): string[] {
  if (budgetOf(options) < BANNER_WIDTH) return [];
  return [...BANNER, ""];
}

export interface TextOptions {
  width: number;
  isTTY?: boolean;
}

const MIN_WIDTH = 40;

export function budgetOf(options: TextOptions): number {
  return Math.max(options.width, MIN_WIDTH);
}

export function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function composeLine(
  head: string,
  annotation: string | null,
  options: TextOptions,
  separator: string,
): string {
  if (annotation === null) return head;
  const budget = budgetOf(options) - head.length - separator.length;
  let text = annotation;
  if (budget < annotation.length) {
    text = budget >= 2 ? `${annotation.slice(0, budget - 1)}…` : "";
  }
  if (text.length === 0) return head;
  return head + separator + text;
}

export function clipTo(text: string, width: number): string {
  if (text.length <= width) return text;
  return width >= 1 ? `${text.slice(0, width - 1)}…` : "";
}

export function packLines(words: string[], budget: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) {
      current = word;
    } else if (current.length + 1 + word.length <= budget) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

const LIST_INDENT = "  ";

function commaWords(names: string[]): string[] {
  return names.map((name, index) => (index < names.length - 1 ? `${name},` : name));
}

function packNames(names: string[], budget: number): string[] {
  return packLines(commaWords(names), budget);
}

export function wrapNames(names: string[], options: TextOptions): string[] {
  if (names.length === 0) return [];
  const words = commaWords(names);
  return packLines(words, budgetOf(options) - LIST_INDENT.length).map((line) => LIST_INDENT + line);
}

const BLOCK_INDENT = "  ";

function block(title: string, values: string[]): string[] {
  if (values.length === 0) return [];
  return ["", title, ...values.map((value) => BLOCK_INDENT + value)];
}

export interface DefinitionValue {
  label: string;
  value: string;
}

export type DefinitionRow =
  DefinitionValue | { label: string; names: string[] } | { label: string; entries: string[] };

const LABEL_GAP = 2;
const FACT_GAP = 3;

export function definitionList(rows: DefinitionRow[], options: TextOptions): string[] {
  const filled = rows.filter(hasContent);
  if (filled.length === 0) return [];

  const column = Math.max(...filled.map((row) => row.label.length)) + LABEL_GAP;
  const widest = Math.max(
    0,
    ...filled.flatMap((row) =>
      "names" in row ? commaWords(row.names).map((word) => word.length) : [],
    ),
  );
  return column + widest <= budgetOf(options)
    ? inlineRows(filled, options, column)
    : stackedRows(filled, options);
}

function hasContent(row: DefinitionRow): boolean {
  if ("value" in row) return row.value.length > 0;
  if ("names" in row) return row.names.length > 0;
  return row.entries.length > 0;
}

function inlineRows(rows: DefinitionRow[], options: TextOptions, column: number): string[] {
  const budget = budgetOf(options) - column;
  const gutter = " ".repeat(column);
  const lines: string[] = [];
  for (const row of rows) {
    const head = row.label.padEnd(column);
    valuesOf(row, budget).forEach((line, index) =>
      lines.push((index === 0 ? head : gutter) + line),
    );
  }
  return lines;
}

function valuesOf(row: DefinitionRow, budget: number): string[] {
  if ("value" in row) return [clipTo(row.value, budget)];
  if ("names" in row) return packNames(row.names, budget);
  return row.entries.map((entry) => clipTo(entry, budget));
}

function stackedRows(rows: DefinitionRow[], options: TextOptions): string[] {
  const budget = budgetOf(options);
  const lines: string[] = [];

  const facts = rows.filter(
    (row): row is Extract<DefinitionRow, { value: string }> => "value" in row,
  );
  if (facts.length > 0) {
    const column = Math.max(...facts.map((row) => row.label.length)) + FACT_GAP;
    for (const row of facts) {
      lines.push(row.label.padEnd(column) + clipTo(row.value, budget - column));
    }
  }

  const indented = budget - BLOCK_INDENT.length;
  for (const row of rows) {
    if ("value" in row) continue;
    const values =
      "names" in row
        ? packNames(row.names, indented)
        : row.entries.map((entry) => clipTo(entry, indented));
    lines.push(...block(row.label, values));
  }
  return lines;
}

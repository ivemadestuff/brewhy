export function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function namesFrom(value: unknown): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** Prawda z RTDB: boolean, 1 albo string "true". */
export function flag(value: unknown): boolean {
  return value === true || value === 1 || value === 'true'
}

export function optStr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function optNum(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'))
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function mapEntries<T>(
  value: unknown,
  map: (id: string, row: Record<string, unknown>) => T,
): T[] {
  const record = asRecord(value)
  if (!record) return []
  return Object.entries(record).map(([id, row]) => map(id, asRecord(row) ?? {}))
}

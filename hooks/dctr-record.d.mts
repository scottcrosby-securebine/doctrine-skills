// Types for dctr-record.mjs, for the band (hooks/band), a TypeScript hooks module. The parser's doc comments are the
// contract; this file only says what each export takes and returns.
export type RecordEntry = { kind: string; line: number; [field: string]: any }
export const STATE_LINE: RegExp
export function unwrapLine(l: string): string
export function wrapperValue(tok: string): string | null
export function parseRecord(text: string): { entries: RecordEntry[]; state: RecordEntry | null; wrapper: string | null }
export function kickoffHandoff(memoryText: string): string | null
export function handoffHeader(text: string): { phase: string | null; record: string | null; wrapper: string | null }
export function restoreState(value: string | null | undefined): string | null

export interface ParsedClass { className: string; sample: number | null; slots: Record<string, { stat: string; share: number }[]> }
export interface ParsedKisk { classes: ParsedClass[]; bands: { letter: string; min: number }[]; snapshotDate: string | null; warnings: string[] }
export function parseKiskScoring(html: string): ParsedKisk;
export function parseBands(text: string): { letter: string; min: number }[];
export function parseLines(cellHtml: string, warnings: string[], where: string): { stat: string; share: number }[];

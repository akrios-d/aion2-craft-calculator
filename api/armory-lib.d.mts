export const REGIONS: string[];
export const SEARCH_HOST: string;
export const CHARACTER_HOST: string;
export function validate(params: URLSearchParams): { ok: true; kind: 'search' | 'character'; urls: string[] } | { ok: false; error: string };
export function makeLimiter(max?: number, windowMs?: number, now?: () => number): (key: string) => boolean;

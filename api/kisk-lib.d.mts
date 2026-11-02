export const KISK_HOST: string;
export const KISK_REGIONS: string[];
export function validateKisk(params: URLSearchParams): { ok: true; url: string } | { ok: false; error: string };
export function slimHtml(html: string): string;

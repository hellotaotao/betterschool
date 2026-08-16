export function safeSchoolWebsiteUrl(raw: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const url = new URL(raw.trim());
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:')
      || !url.hostname
      || url.username !== ''
      || url.password !== ''
    ) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

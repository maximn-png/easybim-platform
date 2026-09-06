// Content-Disposition builder that survives non-ASCII (Hebrew) filenames.
// Bare `filename="…"` mangles anything outside Latin-1 in most browsers; the
// RFC 5987 `filename*=UTF-8''…` form carries the real name, with an ASCII
// fallback for ancient clients.
export function contentDisposition(type: 'inline' | 'attachment', filename: string): string {
  const clean = filename.replace(/["\\\r\n]/g, '')
  const ascii = clean.replace(/[^\x20-\x7e]/g, '_') || 'file'
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`
}

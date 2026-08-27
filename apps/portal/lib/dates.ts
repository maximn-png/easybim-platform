// Deterministic date-time formatting for the admin pages: they render on the
// server (host locale, e.g. he-IL) and hydrate in the browser (user locale) —
// a fixed locale keeps both renders byte-identical, avoiding hydration errors.
export const fmtDateTime = (v: string | number | Date) =>
  new Date(v).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

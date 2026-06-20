// Headline hours progress = actual hours ÷ total budget, as a clamped percent.
// Derived at read time (not stored) so the dashboard and project page always
// agree regardless of which sync/update job last touched the snapshot.
export function deriveHoursProgress(
  actualHours: number | null,
  budgetHours: number | null,
): number | null {
  if (actualHours == null || !budgetHours || budgetHours <= 0) return null
  const pct = Math.round((actualHours / budgetHours) * 100)
  return Math.min(999, Math.max(0, pct))
}

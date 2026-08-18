import SchedulesAdminClient from '@/components/reports/SchedulesAdminClient'

// Cross-project view of every recurring report: what goes out, to whom, when.
// Data is fetched client-side from /api/report-schedules so pause/run/delete
// can refresh in place.
export const dynamic = 'force-dynamic'

export default function SchedulesPage() {
  return <SchedulesAdminClient />
}

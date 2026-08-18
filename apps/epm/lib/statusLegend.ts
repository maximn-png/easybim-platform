// Hebrew status legend embedded in report emails and PDFs — a compact map from
// each ACC issue status to what it means in the EasyBIM workflow (who acts next).
// Rendered as inline-styled HTML (email clients ignore <style>), shared verbatim
// by the email body, the live preview, and the PDF so all three stay identical.
// Draft and In Review are intentionally absent — they're not used in reports.
import { statusColor, statusLabel } from './reportGrouping'

export const STATUS_LEGEND_ROWS: { status: string; meaning: string }[] = [
  { status: 'open',         meaning: 'לטיפול המתכנן - טרם התקבל מענה' },
  { status: 'pending',      meaning: 'ממתין להחלטה / הנחיה (לא בשליטת המתכנן)' },
  { status: 'in_progress',  meaning: 'בתהליך (עבודה שלוקחת זמן)' },
  { status: 'completed',    meaning: 'טופל - נדרשת בדיקת יוצר ה-Issue' },
  { status: 'not_approved', meaning: 'נדחה (נדרשת בדיקה חוזרת של המתכנן)' },
  { status: 'in_dispute',   meaning: 'לדיון בפגישה' },
  { status: 'closed',       meaning: 'הסתיים הטיפול' },
]

export function buildStatusLegendHtml(): string {
  // Both cells share the same fixed line-height and middle alignment — the LTR
  // status name and the RTL Hebrew meaning otherwise sit on slightly different
  // baselines in mail clients.
  const rows = STATUS_LEGEND_ROWS.map(r => `
    <tr>
      <td style="padding:2px 8px 2px 14px;white-space:nowrap;vertical-align:middle;font-size:11px;line-height:16px">
        <span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${statusColor(r.status)};margin-left:6px;vertical-align:middle"></span>
        <span style="font-weight:700;color:#374151;vertical-align:middle">${statusLabel(r.status)}</span>
      </td>
      <td style="padding:2px 0;vertical-align:middle;font-size:11px;line-height:16px;color:#4b5563">${r.meaning}</td>
    </tr>`).join('')

  return `<table dir="rtl" role="presentation" cellpadding="0" cellspacing="0" border="0"
  style="direction:rtl;text-align:right;border-collapse:separate;border:1px solid #e5e7eb;border-radius:8px;background:#fafbff;padding:8px 10px;margin:0">
  <tr><td colspan="2" style="padding:0 8px 4px;font-size:11px;font-weight:700;color:#1e248c">מקרא סטטוסים</td></tr>
  ${rows}
</table>`
}

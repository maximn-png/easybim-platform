interface ProgressBarProps {
  value: number | null
  actual?: number | null
  budget?: number | null
}

export default function ProgressBar({ value, actual, budget }: ProgressBarProps) {
  if (value === null) return <span className="text-gray-400 text-xs">—</span>

  const barColor =
    value >= 100 ? 'bg-red-500' :
    value >= 80  ? 'bg-amber-400' :
                   'bg-[#00c875]'

  const textColor =
    value >= 100 ? 'text-red-600' :
    value >= 80  ? 'text-amber-600' :
                   'text-gray-500'

  const showNumbers = actual != null && budget != null

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="w-16 bg-gray-200 rounded-full h-1.5">
        <div
          className={`${barColor} h-1.5 rounded-full transition-all`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showNumbers ? (
        <span className={`text-[10px] ${textColor} whitespace-nowrap`}>
          {Math.round(actual!)} / {Math.round(budget!)} hrs
        </span>
      ) : (
        <span className={`text-[10px] ${textColor}`}>{value}%</span>
      )}
    </div>
  )
}

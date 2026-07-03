interface ProgressBarProps {
  value: number | null
  actual?: number | null
  budget?: number | null
  // Hours are "lower is better" (100%+ = over budget → red). Milestone completion
  // is the opposite: higher is better, so it should green out as it approaches 100%.
  higherIsBetter?: boolean
  // Neutral = no threshold colouring — a plain gray bar + gray %. Used for
  // Milestone, where the colour would just be noise (colour belongs to Hours).
  neutral?: boolean
}

export default function ProgressBar({ value, actual, budget, higherIsBetter = false, neutral = false }: ProgressBarProps) {
  if (value === null) return <span className="text-gray-400 text-xs">—</span>

  const barColor = neutral
    ? 'bg-gray-400'
    : higherIsBetter
    ? (value >= 100 ? 'bg-[#00c875]' :
       value >= 50  ? 'bg-amber-400' :
                      'bg-red-500')
    : (value >= 100 ? 'bg-red-500' :
       value >= 80  ? 'bg-amber-400' :
                      'bg-[#00c875]')

  const textColor = neutral
    ? 'text-gray-500'
    : higherIsBetter
    ? (value >= 100 ? 'text-green-600' :
       value >= 50  ? 'text-amber-600' :
                      'text-red-600')
    : (value >= 100 ? 'text-red-600' :
       value >= 80  ? 'text-amber-600' :
                      'text-gray-500')

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

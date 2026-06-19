export default function Loading() {
  return (
    <div
      className="min-h-[calc(100vh-4rem)]"
      style={{ background: 'linear-gradient(135deg, #f0f3ff 0%, #e7eefe 100%)' }}
    >
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        {/* Heading skeleton */}
        <div className="mb-6">
          <div className="h-8 w-32 bg-[#1e248c]/10 rounded-lg animate-pulse" />
          <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mt-2" />
        </div>

        {/* Filter tabs skeleton */}
        <div className="flex gap-2 mb-5">
          {[80, 96, 80, 104, 72].map((w, i) => (
            <div key={i} className={`h-8 rounded-full bg-white/70 animate-pulse`} style={{ width: w }} />
          ))}
        </div>

        {/* Table skeleton */}
        <div className="rounded-2xl border border-white/80 shadow-sm overflow-hidden bg-white/65 backdrop-blur-sm">
          {/* Header row */}
          <div className="flex gap-4 px-4 py-3 bg-gray-50/80 border-b border-gray-200">
            {[10, 160, 80, 90, 80, 80, 40, 40, 40, 100, 120, 100].map((w, i) => (
              <div key={i} className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: w }} />
            ))}
          </div>

          {/* Data rows */}
          {Array.from({ length: 7 }).map((_, rowIdx) => (
            <div key={rowIdx} className={`flex gap-4 px-4 py-3 border-b border-gray-100 ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}>
              {[10, 160, 80, 90, 80, 80, 40, 40, 40, 100, 120, 100].map((w, i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: w }} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="safe-top space-y-3 pt-4">
      <div className="skeleton h-10 w-40" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-24 w-36 shrink-0" />
        ))}
      </div>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-24 w-full rounded-3xl" />
      ))}
    </div>
  )
}

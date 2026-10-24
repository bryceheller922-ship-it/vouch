export default function Loading() {
  return (
    <div className="safe-top space-y-4 pt-4">
      <div className="skeleton h-3 w-full" />
      <div className="skeleton h-56 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-3xl" />
        ))}
      </div>
    </div>
  )
}

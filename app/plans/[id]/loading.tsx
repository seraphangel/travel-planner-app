export default function LoadingPlan() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Loading plan">
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="h-9 w-2/3 rounded bg-slate-200" />
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-7 w-28 rounded-full bg-slate-200" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-slate-200" />
          ))}
        </div>
        <div className="h-8 w-56 rounded bg-slate-200" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-slate-200" />
        ))}
      </div>
    </main>
  );
}

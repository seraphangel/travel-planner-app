"use client";

export default function PlanError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-8">
        <h1 className="text-xl font-bold text-red-800">Something went wrong loading this plan</h1>
        <p className="mt-2 text-sm text-red-700">
          The database may be briefly unavailable. Your plan data is safe.
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-red-700 px-5 py-2.5 font-medium text-white hover:bg-red-800"
        >
          Try again
        </button>
      </div>
    </main>
  );
}

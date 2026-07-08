import Link from "next/link";

export default function PlanNotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center">
      <div className="text-4xl" aria-hidden>🧳</div>
      <h1 className="mt-4 text-2xl font-bold">Plan not found</h1>
      <p className="mt-2 text-slate-600">
        This travel plan doesn&apos;t exist or may have been removed.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/" className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-medium hover:bg-slate-100">
          Browse plans
        </Link>
        <Link href="/plans/new" className="rounded-lg bg-teal-600 px-5 py-2.5 font-medium text-white hover:bg-teal-700">
          Create a Plan
        </Link>
      </div>
    </main>
  );
}

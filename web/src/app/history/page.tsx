import { Nav } from '@/components/Nav'
import { TryonGrid } from '@/components/TryonGrid'

export default function HistoryPage() {
  return (
    <div className="min-h-screen">
      <Nav signedIn />
      <main className="mx-auto max-w-5xl px-6">
        <section className="border-x border-line px-6 py-12 sm:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            02 — Your lookbook
          </p>
          <h1 className="mt-4 font-display text-5xl">
            Everything you&apos;ve <span className="italic">worn</span>.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-soft">
            Every try-on lands here. Chained looks are tagged — a chain is one
            look built garment by garment.
          </p>
          <TryonGrid />
        </section>
      </main>
    </div>
  )
}

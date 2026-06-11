import { Nav } from '@/components/Nav'
import { PhotoManager } from '@/components/PhotoManager'

export default function PhotosPage() {
  return (
    <div className="min-h-screen">
      <Nav signedIn />
      <main className="mx-auto max-w-5xl px-6">
        <section className="border-x border-line px-6 py-12 sm:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            01 — Your photos
          </p>
          <h1 className="mt-4 font-display text-5xl">
            The <span className="italic">you</span> we dress.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-soft">
            Upload one or more photos of yourself — a clear, well-lit,
            full-length shot works best. Your photos are stored privately and
            used only to generate your try-ons. You can delete everything, any
            time, below.
          </p>
          <PhotoManager />
        </section>
      </main>
    </div>
  )
}

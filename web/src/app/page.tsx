import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Nav } from '@/components/Nav'
import { SignInButton } from '@/components/SignInButton'

const STEPS = [
  {
    n: '01',
    title: 'Upload a photo of you',
    body: 'One clear, full-length photo. Stored privately, used only to generate your try-ons.',
  },
  {
    n: '02',
    title: 'Shop anywhere',
    body: 'On any product page, open the MirrorMe extension and click the garment you like.',
  },
  {
    n: '03',
    title: 'See it on you',
    body: 'A photoreal composite of you wearing it — then layer a second piece on top.',
  },
]

export default async function Home() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)

  return (
    <div className="min-h-screen">
      <Nav signedIn={signedIn} />

      <main className="mx-auto max-w-5xl px-6">
        <section className="border-x border-line px-6 pt-20 pb-16 sm:px-12 sm:pt-28">
          <p className="rise text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            The fitting room for the whole internet
          </p>
          <h1
            className="rise mt-6 font-display text-6xl leading-[0.95] sm:text-8xl"
            style={{ animationDelay: '90ms' }}
          >
            Wear it
            <br />
            <span className="italic text-accent">before</span> you buy it.
          </h1>
          <p
            className="rise mt-8 max-w-md text-lg text-ink-soft"
            style={{ animationDelay: '180ms' }}
          >
            MirrorMe puts any garment from any store onto a photo of you —
            while you shop, in one click.
          </p>
          <div className="rise mt-10" style={{ animationDelay: '270ms' }}>
            {signedIn ? (
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/photos"
                  className="bg-ink px-7 py-3.5 text-sm font-semibold uppercase tracking-widest text-paper transition-colors hover:bg-accent"
                >
                  Your photos
                </Link>
                <Link
                  href="/history"
                  className="border border-ink px-7 py-3.5 text-sm font-semibold uppercase tracking-widest transition-colors hover:border-accent hover:text-accent"
                >
                  Your try-ons
                </Link>
              </div>
            ) : (
              <SignInButton />
            )}
          </div>
        </section>

        <section className="grid border-x border-t border-line sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              className={`px-6 py-10 sm:px-8 ${i > 0 ? 'border-t border-line sm:border-t-0 sm:border-l' : ''}`}
            >
              <span className="font-display text-5xl italic text-accent">{s.n}</span>
              <h2 className="mt-4 font-display text-2xl">{s.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">{s.body}</p>
            </div>
          ))}
        </section>

        <footer className="flex items-center justify-between border-x border-t border-line px-6 py-6 text-xs uppercase tracking-[0.2em] text-ink-soft sm:px-12">
          <span>MirrorMe</span>
          <span>Your photos stay private. Always.</span>
        </footer>
      </main>
    </div>
  )
}

import Link from 'next/link'
import { SignOutButton } from '@/components/SignOutButton'

export function Nav({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between border-x border-line px-6 py-4 sm:px-12">
        <Link href="/" className="font-display text-2xl italic">
          Mirror<span className="text-accent">Me</span>
        </Link>
        {signedIn && (
          <nav className="flex items-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]">
            <Link href="/photos" className="transition-colors hover:text-accent">
              Photos
            </Link>
            <Link href="/history" className="transition-colors hover:text-accent">
              Try-ons
            </Link>
            <SignOutButton />
          </nav>
        )}
      </div>
    </header>
  )
}

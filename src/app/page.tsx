import Link from 'next/link';
import Image from 'next/image';
import type { ReactNode } from 'react';

const GITHUB_URL = 'https://github.com/feRpicoral/in-draft';

export default function Home() {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 selection:bg-blue-500/20">
      <header className="border-b border-zinc-900 px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Image
              src="/logo.svg"
              alt=""
              width={28}
              height={28}
              className="rounded-md"
              priority
            />
            <span className="font-semibold tracking-tight">InDraft</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm text-zinc-400">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-zinc-100"
            >
              GitHub
            </a>
            <Link href="/access" className="transition-colors hover:text-zinc-100">
              Access
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-20 md:py-28">
        <div className="flex flex-col items-start gap-6">
          <Image
            src="/logo.svg"
            alt="InDraft logo"
            width={72}
            height={72}
            className="rounded-2xl"
            priority
          />
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50 md:text-5xl">
            Personal LinkedIn post assistant.
          </h1>
          <p className="max-w-xl text-lg leading-7 text-zinc-400">
            Drafts on a schedule, in your voice, tied to a real headline. Review on your phone
            and publish with a passkey.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-950 transition-colors hover:bg-white"
            >
              View on GitHub
            </a>
            <Link
              href="/access"
              className="rounded-md border border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
            >
              Lost your review link?
            </Link>
          </div>
        </div>

        <section className="mt-20 grid gap-4 md:grid-cols-3">
          <Step n="1" title="Watch">
            Pulls RSS, your GitHub activity, and your local repos. Deduplicates and scores by
            freshness.
          </Step>
          <Step n="2" title="Draft">
            A frontier model drafts one opinionated post, grounded in a free-text voice block
            and tied to one real, recent item. A small linter catches the most common AI tells.
          </Step>
          <Step n="3" title="Publish">
            Review on your phone, edit conversationally, tap Post. A WebAuthn assertion is
            required and is bound to the exact draft version on screen.
          </Step>
        </section>

        <section className="mt-20 border-t border-zinc-900 pt-12">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Why it exists</h2>
          <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
            LinkedIn post quality comes down to voice and timeliness. Most automation kills
            both. InDraft keeps voice with a free-text profile block (the model&apos;s primary
            grounding) and a thin linter for the most common AI tells. Timeliness comes from
            re-running against fresh sources every time. The publish path is gated by a passkey
            assertion bound to the exact draft version, so a captured assertion can&apos;t be
            replayed against an edited body.
          </p>
        </section>

        <section className="mt-20 border-t border-zinc-900 pt-12">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
            Run your own
          </h2>
          <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
            This site runs my personal instance. The engine is open source — fork it, point
            <code className="mx-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-sm text-zinc-200">
              config.yml
            </code>
            at your own profile and sources, deploy to Vercel. Setup is documented in the README
            and wrapped in
            <code className="mx-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-sm text-zinc-200">
              yarn setup
            </code>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-900 px-6 py-8 text-sm text-zinc-500">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 md:flex-row">
          <span>Open source · MIT</span>
          <span>
            Built by{' '}
            <a
              href="https://picoral.me"
              target="_blank"
              rel="noreferrer"
              className="transition-colors hover:text-zinc-300"
            >
              Fernando Picoral
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-900 bg-zinc-950 p-5">
      <div className="font-mono text-xs uppercase tracking-wider text-zinc-500">
        Step {n}
      </div>
      <h3 className="mt-2 text-lg font-medium text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{children}</p>
    </div>
  );
}

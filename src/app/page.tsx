import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          InDraft
        </h1>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400">
          Personal LinkedIn post assistant. Drafts arrive via email; review and publish from
          your phone with a passkey.
        </p>
        <p className="mt-6 text-sm text-zinc-500">
          <Link href="/access" className="font-medium underline-offset-4 hover:underline">
            Lost your review link?
          </Link>
        </p>
      </div>
    </main>
  );
}

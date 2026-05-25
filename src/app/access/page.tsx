import AccessClient from './AccessClient';

export const metadata = {
  title: 'InDraft — request review links',
};

export default function AccessPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Send me my review links
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          One click emails fresh single-use links for every pending draft to your configured
          inbox. This page is safe: it can't expose anything and can't post.
        </p>
        <AccessClient />
      </div>
    </main>
  );
}

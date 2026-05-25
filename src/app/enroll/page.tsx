import EnrollClient from './EnrollClient';

export const metadata = {
  title: 'InDraft — enroll passkey',
};

export default async function EnrollPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-6 py-16 dark:bg-black">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Enroll a passkey
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          One-time setup. Use the device you&apos;ll publish from (your phone with Face ID / Touch
          ID is ideal). Without an enrolled passkey, nothing can publish.
        </p>
        <EnrollClient bootstrapToken={token ?? null} />
      </div>
    </main>
  );
}

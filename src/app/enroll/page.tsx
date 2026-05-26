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
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
          <strong className="font-medium">Heads up — desktop password managers.</strong>{' '}
          The LastPass <em>browser extension</em> on desktop has a known bug saving passkeys
          (shows &ldquo;Site not supported&rdquo; / &ldquo;Technical limitation&rdquo;). Two
          paths that work:
          <ul className="mt-1.5 list-disc pl-5">
            <li>Enroll from your phone (LastPass mobile is fine; or iCloud Keychain).</li>
            <li>
              On desktop, click <em>&ldquo;Use a different passkey&rdquo;</em> in the manager&apos;s
              dialog to fall back to the OS-native picker (Touch ID / Windows Hello / hardware
              key).
            </li>
          </ul>
        </div>
        <EnrollClient bootstrapToken={token ?? null} />
      </div>
    </main>
  );
}

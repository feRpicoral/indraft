// Global vitest setup. Stub out any env vars that lib/config/env requires
// so tests don't fail at import time. Specific tests can override with
// vi.stubEnv() as needed.
process.env.MAGIC_LINK_SIGNING_SECRET ??= 'test-signing-secret-32-chars-min-aaa';
process.env.CRON_SECRET ??= 'test-cron-secret';
process.env.WEBAUTHN_RP_ID ??= 'localhost';
process.env.NOTIFY_TO_ADDRESS ??= 'test@example.com';
process.env.NOTIFY_FROM_ADDRESS ??= 'noreply@example.com';
process.env.ENROLLMENT_BOOTSTRAP_TOKEN ??= 'test-bootstrap-token';
process.env.APP_URL ??= 'http://localhost:3000';

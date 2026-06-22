// scripts/check-secret.js
// Preflight guard for `npm run package*`. Refuses to build a distributable
// installer unless NOVA_DEV_SECRET is set to a private value. Shipping with the
// public default would let anyone compute valid activation keys AND the rotating
// developer password (which can wipe data) for any installation.
const DEFAULT = 'nova-default-dev-secret-v1-CHANGE-ME'
const secret = process.env.NOVA_DEV_SECRET

if (!secret || secret === DEFAULT || secret.trim().length < 16) {
  console.error('\n  ✖  NOVA_DEV_SECRET is not set to a private value.\n')
  console.error('     Packaging is blocked because the activation keys and the developer')
  console.error('     maintenance password are derived from this secret. With the public')
  console.error('     default, anyone could activate the software for free and gain')
  console.error('     developer access on a customer machine.\n')
  console.error('     Set a long, private, RANDOM secret first (keep it off GitHub), then')
  console.error('     use the SAME value when generating keys/passwords:\n')
  console.error('       PowerShell : $env:NOVA_DEV_SECRET = "<your-long-random-secret>"')
  console.error('       cmd        : set NOVA_DEV_SECRET=<your-long-random-secret>')
  console.error('       bash       : export NOVA_DEV_SECRET="<your-long-random-secret>"\n')
  console.error('     Requirement: at least 16 characters.\n')
  process.exit(1)
}

console.log('  ✓  NOVA_DEV_SECRET is set — packaging with a private signing secret.')

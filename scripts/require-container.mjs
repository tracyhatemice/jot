// Installs must happen inside the dev container so the host environment stays untouched.
if (process.env.IN_JOT_CONTAINER !== '1') {
  console.error('Refusing to install on the host. Run: docker compose run --rm dev pnpm install');
  process.exit(1);
}

// Container entrypoint. Answers the platform's health check on PORT straight away, runs the
// idempotent migrations and seed, then releases the port and starts the real API.
// Without this the API only listens after the seed, which outlasts the deploy platform's health window.
const http = require('node:http');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const root = path.join(__dirname, '..');

const placeholder = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, starting: true }));
});

placeholder.listen(port, host, () => {
  for (const script of ['dist/db/migrate.js', 'dist/db/seed.js']) {
    const r = spawnSync(process.execPath, [path.join(root, script)], { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error(`${script} failed with status ${r.status}`);
      process.exit(r.status || 1);
    }
  }
  placeholder.close(() => require(path.join(root, 'dist/main.js')));
  placeholder.closeAllConnections();
});

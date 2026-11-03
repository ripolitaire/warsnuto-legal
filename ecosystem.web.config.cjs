module.exports = { apps: [{ name: 'warsnuto-web', script: 'server/start.cjs', cwd: __dirname, interpreter: process.env.WEB_NODE_BINARY || process.execPath, instances: 1, exec_mode: 'fork',
  node_args: '--env-file=.env.web', max_memory_restart: '256M', kill_timeout: 15000, watch: false,
  env: { NODE_ENV: 'production' }, time: true }] };

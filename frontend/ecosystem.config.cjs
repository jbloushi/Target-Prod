/* global process */
module.exports = {
  apps: [{
    name: 'target-frontend',
    script: './node_modules/vite/bin/vite.js',
    args: 'preview --host 127.0.0.1 --port 3000 --strictPort',
    cwd: process.cwd(),
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    env: { NODE_ENV: 'production' }
  }]
};

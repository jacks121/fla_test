module.exports = {
  apps: [{
    name: 'fla',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 8787,
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '256M',
  }],
};

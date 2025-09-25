module.exports = {
  apps: [
    {
      name: 'devil-tech-md-session', // PM2 process name
      script: 'pair.js',             // main bot file
      watch: false,                   
      autorestart: true,              
      max_restarts: 10,               
      restart_delay: 5000,            
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};

/**
 * PM2 Ecosystem Configuration
 * Production process manager configuration for Target-Logistics backend
 * 
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 start ecosystem.config.js --env development
 */

module.exports = {
    apps: [
        {
            name: 'target-logistics-api',
            script: './src/server.js',

            // Instances
            instances: process.env.PM2_INSTANCES || 'max', // Use all CPU cores, or set specific number
            exec_mode: 'cluster', // Enable cluster mode for load balancing

            // Auto restart configuration
            autorestart: true,
            watch: false, // Disable in production, enable in dev if needed
            max_memory_restart: '500M', // Restart if memory exceeds 500MB

            // Logging
            error_file: './logs/pm2-error.log',
            out_file: './logs/pm2-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,

            // Environment variables - Production
            env_production: {
                NODE_ENV: 'production',
                PORT: 8899,
            },

            // Environment variables - Development
            env_development: {
                NODE_ENV: 'development',
                PORT: 8899,
            },

            // Advanced options
            kill_timeout: 5000, // Time to wait for graceful shutdown
            wait_ready: true, // Wait for app.listen() before considering app ready
            listen_timeout: 10000, // Max time to wait for ready signal

            // Restart delay
            min_uptime: '10s', // Minimum uptime before considering successful start
            max_restarts: 10, // Max restarts within 1 minute before stopping
            restart_delay: 4000, // Delay between restarts

            // Process management
            shutdown_with_message: false,

            // Source map support
            source_map_support: true,

            // Instance var for load balancing
            instance_var: 'INSTANCE_ID',
        }
    ],

    /**
     * Deployment configuration (optional)
     * Uncomment and configure for PM2 deployment features
     */
    // deploy: {
    //   production: {
    //     user: 'deploy',
    //     host: 'your-server.com',
    //     ref: 'origin/main',
    //     repo: 'git@github.com:username/target-logistics.git',
    //     path: '/var/www/target-logistics',
    //     'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
    //     'pre-setup': ''
    //   }
    // }
};

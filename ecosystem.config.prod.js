const path = require('path');

module.exports = {
    apps: [{
        name: 'EchoSpark',
        script: 'npx',
        args: 'serve -s dist -l tcp://0.0.0.0:3000 --no-clipboard', // Port 3000 as per original config
        cwd: __dirname,
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '1G',
        env: {
            NODE_ENV: 'production'
        },
        // Log configuration
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        // PID file configuration
        pid_file: path.resolve(__dirname, 'EchoSpark.pid')
    }]
};

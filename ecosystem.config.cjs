const path = require('path');

const createApp = (name, port) => {
    const appDir = __dirname;
    let script = '';
    let args = '';

    try {
        // Try to resolve vite's package.json to find the binary location
        // This avoids ERR_PACKAGE_PATH_NOT_EXPORTED for bin/vite.js
        const vitePkgPath = require.resolve('vite/package.json', { paths: [appDir] });
        const viteDir = path.dirname(vitePkgPath);
        const vitePkg = require(vitePkgPath);
        const binPath = typeof vitePkg.bin === 'string' ? vitePkg.bin : vitePkg.bin.vite;
        
        script = path.resolve(viteDir, binPath);
        args = `--port ${port} --host 0.0.0.0`;
    } catch (e) {
        console.error(`[${name}] Failed to resolve vite`, e);
        // Fallback
        script = path.resolve(appDir, 'node_modules/vite/bin/vite.js');
        args = `--port ${port} --host 0.0.0.0`;
    }

    return {
        name,
        cwd: appDir,
        script,
        args,
        interpreter: 'node',
        watch: false, // Vite handles HMR
        ignore_watch: ['node_modules', 'logs', 'dist', '.git'],
        env: {}
    };
};

module.exports = {
    apps: [
        createApp('EchoSpark', 3000)
    ]
};
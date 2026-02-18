import { defineConfig, type PluginOption, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import path from 'path';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';

// Custom plugin to serve uploads from ../api/uploads during development
const serveUploads = (): PluginOption => ({
    name: 'serve-uploads',
    configureServer(server: ViteDevServer) {
        server.middlewares.use('/api/uploads', (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            if (!req.url) return next();
            // URL is relative to the mount point, e.g. /image.jpg
            // We want to serve from ../api/uploads/image.jpg
            const filePath = path.resolve(__dirname, '../api/uploads', req.url.slice(1));

            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes: Record<string, string> = {
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.webp': 'image/webp',
                };
                const contentType = mimeTypes[ext] || 'application/octet-stream';

                res.setHeader('Content-Type', contentType);
                const stream = fs.createReadStream(filePath);
                stream.pipe(res);
            } else {
                next();
            }
        });
    },
});

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), mkcert(), serveUploads()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    base: '/nomad/',
    build: {
        outDir: 'nomad',
    },
    server: {
        port: 3000,
        host: '0.0.0.0',
        // Force polling to ensure file changes are detected
        watch: {
            usePolling: true,
        },
        hmr: {
            // Explicit port for WebSocket to match the server port
            port: 3000,
            // The path must NOT include the base path - Vite handles this internally
            // But we need clientPort to ensure the browser connects to the right port
            clientPort: 3000,
            // Explicit path to avoid conflicts
            path: '/ws',
        },
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:8000',
                changeOrigin: true,
                // Remove /api prefix - PHP dev server runs from /api directory
                // router.php handles adding back the /api context for the Router
                rewrite: (reqPath) => reqPath.replace(/^\/api/, ''),
            },
        },
    },
});


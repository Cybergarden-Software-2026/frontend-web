import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/** HTTPS upstream sessions remain HttpOnly; only loopback development uses a local cookie name. */
export function localApiProxy(target: string): ProxyOptions {
  const remote = new URL(target).protocol === 'https:';
  return {
    target,
    changeOrigin: true,
    ...(remote ? { configure(proxy) {
      proxy.on('proxyReq', (upstream, request) => {
        const origin = request.headers.origin;
        if (origin && !['http://127.0.0.1:5173', 'http://localhost:5173'].includes(origin)) {
          upstream.destroy(new Error('Unexpected development request origin'));
          return;
        }
        if (origin) upstream.setHeader('Origin', new URL(target).origin);
        if (request.headers.cookie) upstream.setHeader('Cookie', request.headers.cookie.replace(/(^|;\s*)underctrl-local-coordinator=/g, '$1__Host-underctrl-coordinator='));
      });
      proxy.on('proxyRes', response => {
        const cookies = response.headers['set-cookie'];
        if (cookies) response.headers['set-cookie'] = cookies.map(cookie => cookie.startsWith('__Host-underctrl-coordinator=')
          ? cookie.replace('__Host-underctrl-coordinator=', 'underctrl-local-coordinator=').replace(/;\s*Secure(?=;|$)/ig, '').replace(/;\s*Domain=[^;]+/ig, '')
          : cookie);
      });
    } } : {}),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: { '/api': localApiProxy(env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8080') },
    },
    preview: { host: '127.0.0.1', port: 4173 },
  };
});

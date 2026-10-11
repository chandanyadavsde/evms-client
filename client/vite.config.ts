import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies /v1 to the API: http://localhost:4100 unless VMS_API_URL says otherwise.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/v1': process.env.VMS_API_URL ?? 'http://localhost:4100' },
  },
});

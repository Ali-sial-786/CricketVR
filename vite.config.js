import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev` serves over HTTPS on your LAN so the Quest browser can open
// it (WebXR needs a secure page). Accept the self-signed certificate once.
export default defineConfig(({ command }) => ({
  base: './',
  plugins: command === 'serve' && !process.env.NO_SSL ? [basicSsl()] : [],
  server: { host: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
}));

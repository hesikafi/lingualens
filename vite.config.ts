import { defineConfig } from 'vite';
export default defineConfig({
  // Relative asset paths so the production build also works from file://
  // (handy for local testing in this VM) and from any hosting sub-path.
  base: './',
  server: { port: 5173, host: '127.0.0.1' },
  preview: { port: 4173, host: '127.0.0.1' },
});

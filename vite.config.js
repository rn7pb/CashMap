import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Os recursos compilados funcionam na raiz e no subdiretório do GitHub Pages.
  base: './',
  plugins: [react()],
});

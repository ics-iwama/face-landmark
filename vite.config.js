import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { importMaps } from 'vite-plugin-import-maps';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    basicSsl(),
    importMaps([
      {
        imports: {
          three: 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js',
        },
      },
    ]),],
  root: 'src',
  publicDir: '../public',
  base: './',
  server: {
    host: true
  },
  build: {
    outDir: '../dist',
    rollupOptions: {
      external: ['three'],
      output: {
        paths: {
          three: 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js'
        }
      }
    }
  }
});

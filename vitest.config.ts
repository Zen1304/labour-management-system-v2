import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Mirrors the "@/*" -> "src/*" path alias from tsconfig.json so these pure
// unit tests can import entity modules the same way the app does, without
// pulling in Next's own build pipeline.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});

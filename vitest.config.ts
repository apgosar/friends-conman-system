import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    // Server code is the default; a component test opts in to the DOM with `// @vitest-environment jsdom`.
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // Integration tests share one Postgres database (TEST_DATABASE_URL), so files run one after another.
    fileParallelism: false,
    globalSetup: ['./tests/helpers/global-setup.ts'],
    testTimeout: 30_000,
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**'],
      exclude: ['node_modules/', '.next/', 'coverage/'],
    },
  },
})

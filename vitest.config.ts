import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['pipeline/**/__tests__/**/*.test.ts'],
  },
});

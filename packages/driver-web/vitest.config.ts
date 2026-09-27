import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'driver-web', include: ['src/**/*.test.ts'] },
});

import { conformanceCases } from '@jot/db/conformance';
import { describe, it } from 'vitest';
import { createMemoryDriver } from './memory';

describe('sqlite-wasm (in-memory) driver conformance', () => {
  for (const c of conformanceCases) {
    it(c.name, async () => c.run(await createMemoryDriver()));
  }
});

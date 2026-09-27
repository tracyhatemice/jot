import { describe, it } from 'vitest';
import { createNodeDriver } from '../testing/node-driver';
import { conformanceCases } from './conformance';

describe('node:sqlite driver conformance', () => {
  for (const c of conformanceCases) {
    it(c.name, () => c.run(createNodeDriver()));
  }
});

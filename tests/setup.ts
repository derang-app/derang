import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { DerangDB, setDatabase } from '../src/db/db';

let counter = 0;
beforeEach(async () => {
  // A fresh, isolated database for every test.
  setDatabase(new DerangDB(`test-${++counter}`));
});

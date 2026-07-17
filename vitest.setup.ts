// fake-indexeddb must patch globals before any test module imports Dexie.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL can only auto-register cleanup when vitest globals are enabled; they
// aren't, so register it explicitly or DOM leaks across tests.
afterEach(cleanup);

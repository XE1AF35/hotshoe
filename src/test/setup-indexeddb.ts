// Installs an in-memory IndexedDB before any test file is imported. Dexie looks for indexedDB
// when it is first imported, so this cannot wait for a test's own imports.
import 'fake-indexeddb/auto';

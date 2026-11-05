import type { OutboxItem, OutboxStorage } from './storage.types';

/** In-memory storage for web preview and tests. */
export function createMemoryStorage(): OutboxStorage {
  const items = new Map<string, OutboxItem>();
  return {
    all: async () => [...items.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    put: async (item) => {
      items.set(item.id, item);
    },
    remove: async (id) => {
      items.delete(id);
    },
  };
}

export const createStorage = createMemoryStorage;

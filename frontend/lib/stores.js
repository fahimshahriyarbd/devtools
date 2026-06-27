'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ----- Hash store -----
export const useHashStore = create()(
  persist(
    (set, get) => ({
      input: '',
      selected: ['md5', 'sha1', 'sha256', 'sha512', 'blake2b', 'crc32'],
      history: [], // { id, time, algo, preview, value, source }
      snapshots: [], // { id, title, time, input, hashes, favorite }
      favorites: [], // ids of snapshots
      setInput: (input) => set({ input }),
      setSelected: (selected) => set({ selected }),
      addHistory: (entries) => set(s => ({
        history: [...entries, ...s.history].slice(0, 500),
      })),
      clearHistory: () => set({ history: [] }),
      removeHistory: (id) => set(s => ({ history: s.history.filter(h => h.id !== id) })),
      addSnapshot: (snap) => set(s => ({ snapshots: [snap, ...s.snapshots].slice(0, 200) })),
      renameSnapshot: (id, title) => set(s => ({
        snapshots: s.snapshots.map(x => x.id === id ? { ...x, title } : x),
      })),
      deleteSnapshot: (id) => set(s => ({
        snapshots: s.snapshots.filter(x => x.id !== id),
        favorites: s.favorites.filter(f => f !== id),
      })),
      toggleFavorite: (id) => set(s => ({
        favorites: s.favorites.includes(id) ? s.favorites.filter(f => f !== id) : [...s.favorites, id],
      })),
    }),
    { name: 'devhub-hash', storage: createJSONStorage(() => localStorage) }
  )
);

// ----- Random store -----
export const useRandomStore = create()(
  persist(
    (set, get) => ({
      type: 'password',
      options: { length: 20, lower: true, upper: true, digits: true, symbols: true, excludeAmbiguous: false, prefix: '', suffix: '', customSet: '' },
      count: 1,
      lastResults: [],
      history: [], // { id, time, type, value, length, favorite }
      collections: [
        { id: 'col-pass', name: 'My Passwords', items: [] },
        { id: 'col-uuid', name: 'My UUIDs', items: [] },
        { id: 'col-keys', name: 'My API Keys', items: [] },
      ],
      setType: (type) => set({ type }),
      setOptions: (opts) => set(s => ({ options: { ...s.options, ...opts } })),
      setCount: (count) => set({ count }),
      setLastResults: (lastResults) => set({ lastResults }),
      addHistory: (entries) => set(s => ({ history: [...entries, ...s.history].slice(0, 500) })),
      clearHistory: () => set({ history: [] }),
      removeHistory: (id) => set(s => ({ history: s.history.filter(h => h.id !== id) })),
      toggleHistoryFav: (id) => set(s => ({
        history: s.history.map(h => h.id === id ? { ...h, favorite: !h.favorite } : h),
      })),
      addCollection: (name) => set(s => ({
        collections: [...s.collections, { id: 'col-' + crypto.randomUUID().slice(0,8), name, items: [] }],
      })),
      renameCollection: (id, name) => set(s => ({
        collections: s.collections.map(c => c.id === id ? { ...c, name } : c),
      })),
      deleteCollection: (id) => set(s => ({
        collections: s.collections.filter(c => c.id !== id),
      })),
      addToCollection: (id, value) => set(s => ({
        collections: s.collections.map(c => c.id === id ? { ...c, items: [{ id: crypto.randomUUID(), value, time: Date.now() }, ...c.items].slice(0, 500) } : c),
      })),
      removeFromCollection: (cid, iid) => set(s => ({
        collections: s.collections.map(c => c.id === cid ? { ...c, items: c.items.filter(i => i.id !== iid) } : c),
      })),
    }),
    { name: 'devhub-random', storage: createJSONStorage(() => localStorage) }
  )
);

// ----- JSON validator / beautifier store -----
export const useJsonStore = create()(
  persist(
    (set) => ({
      input: '',
      indent: 2, // 2 | 4 | 'tab'
      wordWrap: true,
      // Recent entries: { id, time, preview, fullInput, valid, size }
      history: [],
      // Saved snapshots: { id, title, time, input }
      snapshots: [],
      setInput: (input) => set({ input }),
      setIndent: (indent) => set({ indent }),
      setWordWrap: (wordWrap) => set({ wordWrap }),
      addHistory: (entry) => set(s => {
        // Avoid back-to-back duplicates so rapid typing doesn't bloat history.
        const last = s.history[0];
        if (last && last.fullInput === entry.fullInput) return s;
        return { history: [entry, ...s.history].slice(0, 200) };
      }),
      clearHistory: () => set({ history: [] }),
      removeHistory: (id) => set(s => ({ history: s.history.filter(h => h.id !== id) })),
      addSnapshot: (snap) => set(s => ({ snapshots: [snap, ...s.snapshots].slice(0, 200) })),
      deleteSnapshot: (id) => set(s => ({ snapshots: s.snapshots.filter(x => x.id !== id) })),
    }),
    { name: 'devhub-json', storage: createJSONStorage(() => localStorage) }
  )
);

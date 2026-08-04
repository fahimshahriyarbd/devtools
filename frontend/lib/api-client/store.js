'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Fresh request template used for new tabs / duplicated requests.
export function newRequest(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    method: 'GET',
    url: '',
    params: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
    headers: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
    auth: {
      type: 'none',
      bearer: { token: '' },
      basic: { username: '', password: '' },
      apikey: { key: '', value: '', addTo: 'header' },
      oauth2: { accessToken: '', tokenName: 'Bearer' },
    },
    body: {
      type: 'none',
      // Shared free-text buffers per language — kept independent so
      // switching between JSON / XML / HTML etc doesn't wipe your work.
      json: '',
      text: '',
      javascript: '',
      xml: '',
      html: '',
      formdata: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true, type: 'text' }],
      urlencoded: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }],
    },
    tests: '// pm.test("status is 200", () => pm.response.status === 200);',
    settings: { followRedirects: true, useProxy: false, timeout: 60000 },
    ...overrides,
  };
}

function newTab(request) {
  const req = request || newRequest();
  return {
    id: crypto.randomUUID(),
    title: 'Untitled Request',
    request: req,
    response: null,
    // Independent per-tab UI state (which sub-tab is active in the
    // request pane) so switching request tabs doesn't reset your
    // scroll position inside the builder.
    activePane: 'params',
    // Track dirty state relative to whichever saved request this tab
    // was opened from — used by the sidebar to show a subtle dot on
    // the tab title.
    savedRef: null, // { collectionId, folderId, requestId }
  };
}

const LS_KEY = 'devhub_api_client_v1';

export const useApiClientStore = create(
  persist(
    (set, get) => ({
      // ---------------- Tabs ----------------
      tabs: [newTab()],
      activeTabId: null, // resolved lazily below
      addTab: (request) => set((s) => {
        const t = newTab(request ? { ...request, id: crypto.randomUUID() } : undefined);
        return { tabs: [...s.tabs, t], activeTabId: t.id };
      }),
      duplicateTab: (id) => set((s) => {
        const src = s.tabs.find((t) => t.id === id);
        if (!src) return {};
        const t = newTab({ ...src.request, id: crypto.randomUUID() });
        t.title = `${src.title} (copy)`;
        const idx = s.tabs.findIndex((x) => x.id === id);
        const tabs = [...s.tabs.slice(0, idx + 1), t, ...s.tabs.slice(idx + 1)];
        return { tabs, activeTabId: t.id };
      }),
      closeTab: (id) => set((s) => {
        const tabs = s.tabs.filter((t) => t.id !== id);
        if (tabs.length === 0) {
          const fresh = newTab();
          return { tabs: [fresh], activeTabId: fresh.id };
        }
        let activeTabId = s.activeTabId;
        if (activeTabId === id) {
          const idx = s.tabs.findIndex((t) => t.id === id);
          activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
        }
        return { tabs, activeTabId };
      }),
      setActiveTab: (id) => set({ activeTabId: id }),
      renameTab: (id, title) => set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)),
      })),
      updateTabRequest: (id, patch) => set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, request: { ...t.request, ...patch } } : t)),
      })),
      updateTabActivePane: (id, activePane) => set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, activePane } : t)),
      })),
      setTabResponse: (id, response) => set((s) => ({
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, response } : t)),
      })),

      // ---------------- Collections ----------------
      collections: [],
      addCollection: (name) => set((s) => ({
        collections: [
          ...s.collections,
          { id: crypto.randomUUID(), name: name || 'New Collection', folders: [], requests: [] },
        ],
      })),
      renameCollection: (id, name) => set((s) => ({
        collections: s.collections.map((c) => (c.id === id ? { ...c, name } : c)),
      })),
      deleteCollection: (id) => set((s) => ({
        collections: s.collections.filter((c) => c.id !== id),
      })),
      addFolder: (collectionId, name) => set((s) => ({
        collections: s.collections.map((c) =>
          c.id === collectionId
            ? { ...c, folders: [...c.folders, { id: crypto.randomUUID(), name: name || 'New Folder', requests: [] }] }
            : c
        ),
      })),
      renameFolder: (collectionId, folderId, name) => set((s) => ({
        collections: s.collections.map((c) =>
          c.id === collectionId
            ? { ...c, folders: c.folders.map((f) => (f.id === folderId ? { ...f, name } : f)) }
            : c
        ),
      })),
      deleteFolder: (collectionId, folderId) => set((s) => ({
        collections: s.collections.map((c) =>
          c.id === collectionId ? { ...c, folders: c.folders.filter((f) => f.id !== folderId) } : c
        ),
      })),
      saveRequest: ({ collectionId, folderId, name, request }) => set((s) => {
        const entry = { id: crypto.randomUUID(), name: name || 'Untitled', request: { ...request, id: crypto.randomUUID() } };
        return {
          collections: s.collections.map((c) => {
            if (c.id !== collectionId) return c;
            if (folderId) {
              return {
                ...c,
                folders: c.folders.map((f) => (f.id === folderId ? { ...f, requests: [...f.requests, entry] } : f)),
              };
            }
            return { ...c, requests: [...c.requests, entry] };
          }),
        };
      }),
      deleteSavedRequest: ({ collectionId, folderId, requestId }) => set((s) => ({
        collections: s.collections.map((c) => {
          if (c.id !== collectionId) return c;
          if (folderId) {
            return {
              ...c,
              folders: c.folders.map((f) =>
                f.id === folderId ? { ...f, requests: f.requests.filter((r) => r.id !== requestId) } : f
              ),
            };
          }
          return { ...c, requests: c.requests.filter((r) => r.id !== requestId) };
        }),
      })),
      renameSavedRequest: ({ collectionId, folderId, requestId, name }) => set((s) => ({
        collections: s.collections.map((c) => {
          if (c.id !== collectionId) return c;
          const rename = (list) => list.map((r) => (r.id === requestId ? { ...r, name } : r));
          if (folderId) {
            return { ...c, folders: c.folders.map((f) => (f.id === folderId ? { ...f, requests: rename(f.requests) } : f)) };
          }
          return { ...c, requests: rename(c.requests) };
        }),
      })),
      moveSavedRequest: ({ requestId, fromCollectionId, fromFolderId, toCollectionId, toFolderId }) => set((s) => {
        let moved = null;
        const collections = s.collections.map((c) => {
          if (c.id !== fromCollectionId) return c;
          if (fromFolderId) {
            return {
              ...c,
              folders: c.folders.map((f) => {
                if (f.id !== fromFolderId) return f;
                const hit = f.requests.find((r) => r.id === requestId);
                if (hit) moved = hit;
                return { ...f, requests: f.requests.filter((r) => r.id !== requestId) };
              }),
            };
          }
          const hit = c.requests.find((r) => r.id === requestId);
          if (hit) moved = hit;
          return { ...c, requests: c.requests.filter((r) => r.id !== requestId) };
        });
        if (!moved) return {};
        return {
          collections: collections.map((c) => {
            if (c.id !== toCollectionId) return c;
            if (toFolderId) {
              return {
                ...c,
                folders: c.folders.map((f) => (f.id === toFolderId ? { ...f, requests: [...f.requests, moved] } : f)),
              };
            }
            return { ...c, requests: [...c.requests, moved] };
          }),
        };
      }),

      // ---------------- History ----------------
      history: [],
      pushHistory: (entry) => set((s) => ({
        history: [{ id: crypto.randomUUID(), ts: Date.now(), ...entry }, ...s.history].slice(0, 50),
      })),
      clearHistory: () => set({ history: [] }),
      removeHistory: (id) => set((s) => ({ history: s.history.filter((h) => h.id !== id) })),

      // ---------------- Environments ----------------
      environments: [],
      activeEnvId: null,
      addEnvironment: (name) => set((s) => {
        const env = { id: crypto.randomUUID(), name: name || 'New Environment', variables: [{ id: crypto.randomUUID(), key: '', value: '', enabled: true }] };
        return { environments: [...s.environments, env], activeEnvId: s.activeEnvId ?? env.id };
      }),
      renameEnvironment: (id, name) => set((s) => ({
        environments: s.environments.map((e) => (e.id === id ? { ...e, name } : e)),
      })),
      deleteEnvironment: (id) => set((s) => ({
        environments: s.environments.filter((e) => e.id !== id),
        activeEnvId: s.activeEnvId === id ? null : s.activeEnvId,
      })),
      updateEnvironmentVars: (id, variables) => set((s) => ({
        environments: s.environments.map((e) => (e.id === id ? { ...e, variables } : e)),
      })),
      setActiveEnv: (id) => set({ activeEnvId: id }),

      // ---------------- Import / Export ----------------
      importCollections: (list) => set((s) => ({
        collections: [...s.collections, ...list.map((c) => ({ ...c, id: crypto.randomUUID() }))],
      })),
      importEnvironments: (list) => set((s) => ({
        environments: [...s.environments, ...list.map((e) => ({ ...e, id: crypto.randomUUID() }))],
      })),
      restoreAll: (payload) => set(() => {
        const p = payload || {};
        return {
          tabs: (p.tabs && p.tabs.length ? p.tabs : [newTab()]),
          activeTabId: p.activeTabId ?? null,
          collections: p.collections || [],
          history: p.history || [],
          environments: p.environments || [],
          activeEnvId: p.activeEnvId || null,
        };
      }),
    }),
    {
      name: LS_KEY,
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : undefined)),
      version: 1,
      partialize: (s) => ({
        tabs: s.tabs,
        activeTabId: s.activeTabId,
        collections: s.collections,
        history: s.history,
        environments: s.environments,
        activeEnvId: s.activeEnvId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.tabs || state.tabs.length === 0) state.tabs = [newTab()];
        if (!state.activeTabId || !state.tabs.some((t) => t.id === state.activeTabId)) {
          state.activeTabId = state.tabs[0].id;
        }
      },
    }
  )
);

// Convenience selector — the active tab object.
export function useActiveTab() {
  return useApiClientStore((s) => s.tabs.find((t) => t.id === s.activeTabId) || s.tabs[0]);
}

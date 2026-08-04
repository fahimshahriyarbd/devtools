'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useApiClientStore, useActiveTab } from '@/lib/api-client/store';
import { sendRequest } from '@/lib/api-client/sender';
import { runTests } from '@/lib/api-client/test-runner';
import Sidebar from '@/components/api-client/Sidebar';
import RequestTabs from '@/components/api-client/RequestTabs';
import RequestBuilder from '@/components/api-client/RequestBuilder';
import ResponseViewer from '@/components/api-client/ResponseViewer';
import { SaveRequestDialog, EnvironmentManager, CodeGeneratorDialog, ImportExportDialog } from '@/components/api-client/Dialogs';

export default function ApiClientPage() {
  const store = useApiClientStore();
  const tab = useActiveTab();
  const activeEnv = useMemo(() => store.environments.find((e) => e.id === store.activeEnvId) || null, [store.environments, store.activeEnvId]);

  const [running, setRunning] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [envOpen, setEnvOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [ioOpen, setIoOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Wait a tick so persisted state has time to rehydrate before render.
    setHydrated(true);
  }, []);

  const send = useCallback(async () => {
    if (!tab) return;
    setRunning(true);
    store.setTabResponse(tab.id, null);
    const resp = await sendRequest(tab.request, activeEnv);
    let testResults = [];
    if (resp && !resp.error) {
      try { testResults = runTests(tab.request.tests, resp); } catch { /* noop */ }
    }
    const finalResp = { ...resp, testResults };
    store.setTabResponse(tab.id, finalResp);
    store.pushHistory({
      request: { ...tab.request, id: crypto.randomUUID() },
      status: resp?.status ?? null,
      time: resp?.ms ?? null,
    });
    setRunning(false);
    if (resp?.error) toast.error(resp.error);
    else toast.success(`Response ${resp.status} · ${resp.ms} ms`);
  }, [tab, activeEnv, store]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;
      if (e.key === 'Enter') { e.preventDefault(); send(); }
      else if (e.key.toLowerCase() === 't') { e.preventDefault(); store.addTab(); }
      else if (e.key.toLowerCase() === 'w') { e.preventDefault(); if (tab) store.closeTab(tab.id); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); setSaveOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [send, tab, store]);

  if (!hydrated || !tab) {
    return <div className="h-full grid place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] md:h-screen w-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={20} minSize={14} maxSize={35} className="min-w-[220px]">
          <Sidebar onManageEnvs={() => setEnvOpen(true)} onImportExport={() => setIoOpen(true)} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={80} minSize={40}>
          <div className="h-full flex flex-col min-h-0">
            <RequestTabs
              tabs={store.tabs}
              activeTabId={tab.id}
              onSelect={(id) => store.setActiveTab(id)}
              onClose={(id) => store.closeTab(id)}
              onAdd={() => store.addTab()}
              onDuplicate={(id) => store.duplicateTab(id)}
              onRename={(id, title) => store.renameTab(id, title)}
            />
            <ResizablePanelGroup direction="vertical" className="flex-1 min-h-0">
              <ResizablePanel defaultSize={55} minSize={20}>
                <RequestBuilder
                  tab={tab}
                  request={tab.request}
                  onChange={(patch) => store.updateTabRequest(tab.id, patch)}
                  onSend={send}
                  onSave={() => setSaveOpen(true)}
                  onOpenCode={() => setCodeOpen(true)}
                  activePane={tab.activePane || 'params'}
                  onActivePaneChange={(p) => store.updateTabActivePane(tab.id, p)}
                  activeEnvName={activeEnv?.name}
                  running={running}
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={45} minSize={20}>
                <ResponseViewer response={tab.response} running={running} />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <SaveRequestDialog open={saveOpen} onOpenChange={setSaveOpen} request={tab.request} tab={tab} />
      <EnvironmentManager open={envOpen} onOpenChange={setEnvOpen} />
      <CodeGeneratorDialog open={codeOpen} onOpenChange={setCodeOpen} request={tab.request} env={activeEnv} />
      <ImportExportDialog open={ioOpen} onOpenChange={setIoOpen} />
    </div>
  );
}

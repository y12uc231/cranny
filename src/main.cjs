const path = require('node:path');
const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  safeStorage,
  session,
} = require('electron');
const { ThreadlineStore, makeId, safeDomain } = require('./store.cjs');
const { duplicateIds, memoryCandidates, organizeTabs } = require('./organizer.cjs');
const { parseLocalCommand, requestModelPlan, tabInventoryForPrompt } = require('./agent.cjs');

const CHROME = Object.freeze({ top: 66, left: 276, right: 376, bottom: 0 });
const DEFAULT_START = 'https://www.google.com';

let window;
let store;
let activeTabId = null;
let memoryTimer;
let lastMemory = { totalMb: 0, limitMb: 2200, ratio: 0, status: 'calm', topTabs: [] };
let lastPressureStatus = 'calm';
let autoHibernateCooldown = 0;
const tabs = new Map();
const sessionApiKeys = new Map();

function publicTab(tab) {
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title || 'New tab',
    favicon: tab.favicon || '',
    intent: tab.intent || '',
    group: tab.group || 'Loose tabs',
    pinned: Boolean(tab.pinned),
    sleeping: Boolean(tab.sleeping),
    loading: Boolean(tab.loading),
    createdAt: tab.createdAt,
    lastActiveAt: tab.lastActiveAt,
    canGoBack: Boolean(tab.view?.webContents?.navigationHistory?.canGoBack()),
    canGoForward: Boolean(tab.view?.webContents?.navigationHistory?.canGoForward()),
  };
}

function persistedTab(tab) {
  const value = publicTab(tab);
  delete value.loading;
  delete value.canGoBack;
  delete value.canGoForward;
  return value;
}

function createWindow() {
  window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: '#f4f1ea',
    title: 'Threadline',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 22 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  installShortcuts(window.webContents);
  window.on('resize', layoutActiveView);
  window.on('closed', () => {
    for (const tab of tabs.values()) destroyView(tab);
    tabs.clear();
    window = null;
  });

  const saved = store.read();
  const restored = saved.tabs.length ? saved.tabs : [];
  for (const value of restored) {
    tabs.set(value.id, { ...value, sleeping: true, loading: false, view: null });
  }

  const preferred = tabs.has(saved.activeTabId) ? saved.activeTabId : restored[0]?.id;
  if (preferred) activateTab(preferred);
  else createTab({ target: DEFAULT_START, active: true, intent: '' });

  window.webContents.on('did-finish-load', () => {
    broadcastState();
    broadcastMemory();
  });
}

function createTab({ target = DEFAULT_START, active = true, intent = '', group = 'Loose tabs' } = {}) {
  const now = new Date().toISOString();
  const tab = {
    id: makeId('tab'),
    url: normalizeTarget(target),
    title: displayTarget(target),
    favicon: '',
    intent,
    group,
    pinned: false,
    sleeping: true,
    loading: false,
    createdAt: now,
    lastActiveAt: now,
    view: null,
  };
  tabs.set(tab.id, tab);
  if (active) activateTab(tab.id);
  else persistAndBroadcast();
  return publicTab(tab);
}

function buildView(tab) {
  if (tab.view && !tab.view.webContents.isDestroyed()) return tab.view;
  const view = new WebContentsView({
    webPreferences: {
      partition: 'persist:threadline',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'document-user-activation-required',
    },
  });
  view.setBackgroundColor('#ffffff');
  tab.view = view;
  tab.sleeping = false;

  const contents = view.webContents;
  installShortcuts(contents);
  contents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) createTab({ target: url, active: true, intent: tab.intent });
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isAllowedUrl(url)) event.preventDefault();
  });
  contents.on('did-start-loading', () => {
    tab.loading = true;
    broadcastState();
  });
  contents.on('did-stop-loading', () => {
    tab.loading = false;
    updateFromContents(tab);
  });
  contents.on('did-navigate', (_event, url) => {
    tab.url = url;
    recordVisit(tab, 'visited');
    updateFromContents(tab);
  });
  contents.on('did-navigate-in-page', (_event, url) => {
    tab.url = url;
    updateFromContents(tab);
  });
  contents.on('page-title-updated', (_event, title) => {
    tab.title = title || tab.title;
    persistAndBroadcast();
  });
  contents.on('page-favicon-updated', (_event, favicons) => {
    tab.favicon = favicons.find((url) => /^https?:/.test(url)) || '';
    persistAndBroadcast();
  });
  contents.on('render-process-gone', () => {
    tab.sleeping = true;
    tab.view = null;
    persistAndBroadcast();
  });

  contents.loadURL(tab.url).catch((error) => {
    tab.loading = false;
    tab.title = `Couldn’t load ${safeDomain(tab.url) || 'page'}`;
    console.error(error);
    broadcastState();
  });
  return view;
}

function updateFromContents(tab) {
  if (!tab.view || tab.view.webContents.isDestroyed()) return;
  tab.url = tab.view.webContents.getURL() || tab.url;
  tab.title = tab.view.webContents.getTitle() || tab.title;
  persistAndBroadcast();
}

function activateTab(tabId) {
  const tab = tabs.get(tabId);
  if (!tab || !window) return null;
  activeTabId = tabId;
  tab.lastActiveAt = new Date().toISOString();
  buildView(tab);
  attachOnly(tab.view);
  layoutActiveView();
  tab.view.webContents.focus();
  persistAndBroadcast();
  return publicTab(tab);
}

function attachOnly(activeView) {
  if (!window) return;
  for (const tab of tabs.values()) {
    if (tab.view && tab.view !== activeView) {
      try {
        window.contentView.removeChildView(tab.view);
      } catch {}
    }
  }
  try {
    window.contentView.addChildView(activeView);
  } catch {}
}

function layoutActiveView() {
  if (!window || !activeTabId) return;
  const tab = tabs.get(activeTabId);
  if (!tab?.view) return;
  const [width, height] = window.getContentSize();
  tab.view.setBounds({
    x: CHROME.left,
    y: CHROME.top,
    width: Math.max(100, width - CHROME.left - CHROME.right),
    height: Math.max(100, height - CHROME.top - CHROME.bottom),
  });
}

async function closeTab(tabId, reason = 'closed') {
  const tab = tabs.get(tabId);
  if (!tab || tab.pinned) return { ok: false, reason: tab?.pinned ? 'pinned' : 'missing' };
  await archiveTab(tab, reason);
  destroyView(tab);
  tabs.delete(tabId);
  if (activeTabId === tabId) {
    const replacement = [...tabs.values()].sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt))[0];
    activeTabId = null;
    if (replacement) activateTab(replacement.id);
    else createTab({ target: DEFAULT_START, active: true });
  } else {
    persistAndBroadcast();
  }
  return { ok: true };
}

async function hibernateTab(tabId, reason = 'hibernated') {
  const tab = tabs.get(tabId);
  if (!tab || tab.sleeping || tab.pinned || tab.id === activeTabId) {
    return { ok: false, reason: 'not-eligible' };
  }
  await archiveTab(tab, reason);
  destroyView(tab);
  tab.sleeping = true;
  persistAndBroadcast();
  return { ok: true };
}

function destroyView(tab) {
  if (!tab.view) return;
  try {
    window?.contentView.removeChildView(tab.view);
  } catch {}
  try {
    if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close();
  } catch {}
  tab.view = null;
}

async function archiveTab(tab, reason) {
  const snapshot = await snapshotPage(tab);
  store.addJournal({
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    intent: tab.intent,
    group: tab.group,
    excerpt: store.read().settings.storePageExcerpts ? snapshot.text : '',
    reason,
    visitedAt: tab.lastActiveAt,
    closedAt: new Date().toISOString(),
  });
}

function recordVisit(tab, reason) {
  if (!/^https?:/.test(tab.url)) return;
  store.addJournal({
    tabId: tab.id,
    url: tab.url,
    title: tab.title,
    intent: tab.intent,
    group: tab.group,
    reason,
    visitedAt: new Date().toISOString(),
  });
}

async function snapshotPage(tab = tabs.get(activeTabId)) {
  if (!tab?.view || tab.view.webContents.isDestroyed()) {
    return { url: tab?.url || '', title: tab?.title || '', text: '', controls: [] };
  }
  try {
    return await tab.view.webContents.executeJavaScript(`(() => {
      const normalize = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
      const elements = [...document.querySelectorAll('a, button, input, textarea, select, [role="button"], [contenteditable="true"]')]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        })
        .slice(0, 140);
      const controls = elements.map((element, index) => {
        const ref = 'e' + (index + 1);
        element.setAttribute('data-threadline-ref', ref);
        return {
          ref,
          role: element.getAttribute('role') || element.tagName.toLowerCase(),
          name: normalize(element.getAttribute('aria-label') || element.innerText || element.placeholder || element.name || element.value).slice(0, 180),
          type: element.type || '',
          href: element.href || '',
        };
      });
      return {
        url: location.href,
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content || '',
        text: normalize(document.body?.innerText).slice(0, 16000),
        controls,
      };
    })()`);
  } catch {
    return { url: tab.url, title: tab.title, text: '', controls: [] };
  }
}

function normalizeTarget(target) {
  const raw = String(target || '').trim();
  if (!raw) return DEFAULT_START;
  try {
    const url = new URL(raw);
    if (['http:', 'https:'].includes(url.protocol)) return url.toString();
  } catch {}
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(raw)) return `http://${raw}`;
  if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(raw)) return `https://${raw}`;
  return `${store?.read().settings.searchEngine || 'https://www.google.com/search?q='}${encodeURIComponent(raw)}`;
}

function displayTarget(target) {
  const value = String(target || '').trim();
  return value && !/^https?:/i.test(value) ? value : 'New tab';
}

function isAllowedUrl(url) {
  try {
    return ['http:', 'https:', 'about:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

function persistAndBroadcast() {
  if (!store) return;
  store.mutate((state) => {
    state.tabs = [...tabs.values()].map(persistedTab);
    state.activeTabId = activeTabId;
  });
  broadcastState();
}

function browserState() {
  return {
    tabs: [...tabs.values()].map(publicTab),
    activeTabId,
    journalCount: store?.read().journal.length || 0,
  };
}

function broadcastState() {
  if (window && !window.webContents.isDestroyed()) window.webContents.send('browser:state', browserState());
}

function calculateMemory() {
  const metrics = app.getAppMetrics();
  const totalKb = metrics.reduce((sum, processMetric) => sum + (processMetric.memory?.workingSetSize || 0), 0);
  const processByPid = new Map(metrics.map((item) => [item.pid, item.memory?.workingSetSize || 0]));
  const limitMb = Number(store.read().settings.memoryLimitMb) || 2200;
  const totalMb = totalKb / 1024;
  const ratio = limitMb ? totalMb / limitMb : 0;
  const status = ratio >= 1 ? 'wall' : ratio >= 0.85 ? 'high' : ratio >= 0.65 ? 'watch' : 'calm';
  const topTabs = [...tabs.values()]
    .filter((tab) => tab.view)
    .map((tab) => ({
      tabId: tab.id,
      title: tab.title,
      mb: Math.round((processByPid.get(tab.view.webContents.getOSProcessId()) || 0) / 1024),
    }))
    .sort((a, b) => b.mb - a.mb)
    .slice(0, 5);
  return { totalMb: Math.round(totalMb), limitMb, ratio, status, topTabs };
}

function sampleMemory() {
  lastMemory = calculateMemory();
  broadcastMemory();
  if (['high', 'wall'].includes(lastMemory.status) && lastPressureStatus !== lastMemory.status) {
    window?.webContents.send('memory:alert', {
      ...lastMemory,
      message:
        lastMemory.status === 'wall'
          ? 'Threadline reached the memory wall. I can hibernate the oldest background tabs without losing their trail.'
          : 'Memory is getting crowded. Your tab trail is safe if you want me to make room.',
    });
  }
  lastPressureStatus = lastMemory.status;

  const shouldAutoHibernate = store.read().settings.autoHibernate && lastMemory.status === 'wall';
  if (shouldAutoHibernate && Date.now() > autoHibernateCooldown) {
    autoHibernateCooldown = Date.now() + 30_000;
    saveMemory(2).catch(console.error);
  }
}

function broadcastMemory() {
  if (window && !window.webContents.isDestroyed()) window.webContents.send('memory:update', lastMemory);
}

async function saveMemory(count = 3) {
  const ids = memoryCandidates([...tabs.values()], activeTabId, count);
  const results = [];
  for (const id of ids) results.push(await hibernateTab(id, 'memory'));
  return { hibernated: results.filter((result) => result.ok).length, ids };
}

function getAiConfig() {
  const persisted = store.read().settings.ai;
  let apiKey = sessionApiKeys.get(persisted.provider) || '';
  if (!apiKey && persisted.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
    try {
      apiKey = safeStorage.decryptString(Buffer.from(persisted.apiKeyEncrypted, 'base64'));
    } catch {}
  }
  return { ...persisted, apiKey };
}

function publicSettings() {
  const settings = store.read().settings;
  return {
    ...settings,
    ai: {
      provider: settings.ai.provider,
      model: settings.ai.model,
      baseUrl: settings.ai.baseUrl,
      hasApiKey: Boolean(settings.ai.apiKeyEncrypted || sessionApiKeys.get(settings.ai.provider)),
    },
  };
}

async function handleAgentRequest(prompt) {
  const cleanPrompt = String(prompt || '').trim().slice(0, 4000);
  if (!cleanPrompt) throw new Error('Say or type what you want me to do.');
  store.addChat('user', cleanPrompt);
  const context = {
    tabs: tabInventoryForPrompt([...tabs.values()].map(publicTab)),
    activeTabId,
    activePage: await snapshotPage(),
    recentJournal: store.read().journal.slice(0, 12),
    memory: lastMemory,
  };
  let plan = parseLocalCommand(cleanPrompt, context);
  if (!plan) plan = await requestModelPlan(getAiConfig(), cleanPrompt, context);
  const results = [];
  for (const action of plan.actions) results.push(await executeAction(action));
  const journalResult = results.find((result) => result.type === 'journal.search');
  const suffix = journalResult?.entries?.length
    ? `\n\nI found ${journalResult.entries.length}: ${journalResult.entries
        .slice(0, 5)
        .map((entry) => `${entry.title} (${entry.url})`)
        .join('; ')}`
    : '';
  const message = `${plan.message}${suffix}`;
  store.addChat('assistant', message, { source: plan.source, actions: plan.actions });
  return { message, actions: plan.actions, results, source: plan.source };
}

async function executeAction(action) {
  const tab = tabs.get(action.tabId || activeTabId);
  switch (action.type) {
    case 'tab.open':
      return { type: action.type, tab: createTab({ target: action.target, intent: cleanText(action.intent, 240) }) };
    case 'tab.activate':
      return { type: action.type, tab: activateTab(action.tabId) };
    case 'tab.close':
      return { type: action.type, ...(await closeTab(action.tabId || activeTabId)) };
    case 'tab.hibernate':
      return { type: action.type, ...(await hibernateTab(action.tabId)) };
    case 'tab.organize': {
      const organized = organizeTabs([...tabs.values()].map(persistedTab));
      for (const value of organized) Object.assign(tabs.get(value.id), { group: value.group });
      persistAndBroadcast();
      return { type: action.type, count: organized.length };
    }
    case 'tab.closeDuplicates': {
      const ids = duplicateIds([...tabs.values()]);
      for (const id of ids) await closeTab(id, 'duplicate');
      return { type: action.type, count: ids.length };
    }
    case 'tab.setIntent':
      if (!tab) return { type: action.type, ok: false };
      tab.intent = cleanText(action.intent, 240);
      tab.group = tab.intent || tab.group;
      persistAndBroadcast();
      return { type: action.type, ok: true };
    case 'tab.pin':
      if (!tab) return { type: action.type, ok: false };
      tab.pinned = Boolean(action.pinned);
      persistAndBroadcast();
      return { type: action.type, ok: true };
    case 'page.navigate':
      if (!tab) return { type: action.type, ok: false };
      tab.url = normalizeTarget(action.target);
      buildView(tab).webContents.loadURL(tab.url);
      return { type: action.type, ok: true };
    case 'page.click':
      return runPageControl(tab, action.ref, 'click');
    case 'page.type':
      return runPageControl(tab, action.ref, 'type', action.text, action.submit);
    case 'page.scroll':
      if (!tab?.view) return { type: action.type, ok: false };
      await tab.view.webContents.executeJavaScript(`window.scrollBy({top: ${action.direction === 'up' ? -650 : 650}, behavior: 'smooth'})`);
      return { type: action.type, ok: true };
    case 'journal.search':
      return { type: action.type, entries: store.searchJournal(action.query, 12) };
    case 'journal.reopen': {
      const entry = store.read().journal.find((item) => item.id === action.entryId);
      return { type: action.type, tab: entry ? createTab({ target: entry.url, intent: entry.intent, group: entry.group }) : null };
    }
    case 'memory.save':
      return { type: action.type, ...(await saveMemory()) };
    default:
      return { type: action.type, ok: false, reason: 'unsupported' };
  }
}

async function runPageControl(tab, ref, kind, text = '', submit = false) {
  if (!tab?.view || !/^e\d+$/.test(String(ref))) return { type: `page.${kind}`, ok: false };
  const selector = JSON.stringify(`[data-threadline-ref="${ref}"]`);
  const value = JSON.stringify(cleanText(text, 4000));
  const script = kind === 'click'
    ? `(() => { const el = document.querySelector(${selector}); if (!el) return false; el.click(); return true; })()`
    : `(() => { const el = document.querySelector(${selector}); if (!el) return false; el.focus(); const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set; if (setter) setter.call(el, ${value}); else el.textContent = ${value}; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); ${submit ? "el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', code:'Enter', bubbles:true})); el.form?.requestSubmit?.();" : ''} return true; })()`;
  try {
    const ok = await tab.view.webContents.executeJavaScript(script);
    return { type: `page.${kind}`, ok };
  } catch {
    return { type: `page.${kind}`, ok: false };
  }
}

function cleanText(value, max = 500) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

function installShortcuts(contents) {
  contents.on('before-input-event', (event, input) => {
    const command = process.platform === 'darwin' ? input.meta : input.control;
    if (!command) return;
    const key = input.key.toLowerCase();
    if (key === 'l') {
      event.preventDefault();
      window?.webContents.send('ui:focus-address');
    } else if (key === 't') {
      event.preventDefault();
      window?.webContents.send('ui:new-tab');
    } else if (key === 'k') {
      event.preventDefault();
      window?.webContents.send('ui:focus-agent');
    } else if (key === 'w' && activeTabId) {
      event.preventDefault();
      closeTab(activeTabId).catch(console.error);
    } else if (key === 'r') {
      event.preventDefault();
      tabs.get(activeTabId)?.view?.webContents.reload();
    }
  });
}

function registerIpc() {
  ipcMain.handle('browser:get-state', () => browserState());
  ipcMain.handle('browser:create-tab', (_event, input) => createTab(input || {}));
  ipcMain.handle('browser:activate-tab', (_event, tabId) => activateTab(tabId));
  ipcMain.handle('browser:close-tab', (_event, tabId) => closeTab(tabId));
  ipcMain.handle('browser:hibernate-tab', (_event, tabId) => hibernateTab(tabId));
  ipcMain.handle('browser:pin-tab', (_event, { tabId, pinned }) => executeAction({ type: 'tab.pin', tabId, pinned }));
  ipcMain.handle('browser:set-intent', (_event, { tabId, intent }) => executeAction({ type: 'tab.setIntent', tabId, intent }));
  ipcMain.handle('browser:navigate', (_event, target) => executeAction({ type: 'page.navigate', target }));
  ipcMain.handle('browser:back', () => {
    const contents = tabs.get(activeTabId)?.view?.webContents;
    if (contents?.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
  });
  ipcMain.handle('browser:forward', () => {
    const contents = tabs.get(activeTabId)?.view?.webContents;
    if (contents?.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
  });
  ipcMain.handle('browser:reload', () => tabs.get(activeTabId)?.view?.webContents.reload());
  ipcMain.handle('browser:organize', () => executeAction({ type: 'tab.organize' }));
  ipcMain.handle('browser:save-memory', () => saveMemory());
  ipcMain.handle('agent:ask', (_event, prompt) => handleAgentRequest(prompt));
  ipcMain.handle('journal:list', (_event, query) => (query ? store.searchJournal(query, 100) : store.read().journal.slice(0, 100)));
  ipcMain.handle('journal:reopen', (_event, entryId) => executeAction({ type: 'journal.reopen', entryId }));
  ipcMain.handle('settings:get', () => publicSettings());
  ipcMain.handle('settings:set', (_event, incoming) => {
    const provider = ['none', 'anthropic', 'openai', 'openai-compatible', 'ollama'].includes(incoming.ai?.provider)
      ? incoming.ai.provider
      : 'none';
    const current = store.read().settings;
    let apiKeyEncrypted = provider === current.ai.provider ? current.ai.apiKeyEncrypted : '';
    if (typeof incoming.ai?.apiKey === 'string' && incoming.ai.apiKey) {
      sessionApiKeys.set(provider, incoming.ai.apiKey);
      if (safeStorage.isEncryptionAvailable()) {
        apiKeyEncrypted = safeStorage.encryptString(incoming.ai.apiKey).toString('base64');
        sessionApiKeys.delete(provider);
      }
    }
    if (incoming.ai?.clearApiKey) {
      apiKeyEncrypted = '';
      sessionApiKeys.delete(provider);
    }
    store.updateSettings({
      memoryLimitMb: Math.max(512, Math.min(32768, Number(incoming.memoryLimitMb) || current.memoryLimitMb)),
      autoHibernate: Boolean(incoming.autoHibernate),
      storePageExcerpts: incoming.storePageExcerpts !== false,
      voiceMode: incoming.voiceMode === 'off' ? 'off' : 'system',
      ai: {
        provider,
        model: cleanText(incoming.ai?.model, 160),
        baseUrl: cleanText(incoming.ai?.baseUrl, 500),
        apiKeyEncrypted,
        hasApiKey: Boolean(apiKeyEncrypted || sessionApiKeys.get(provider)),
      },
    });
    sampleMemory();
    return publicSettings();
  });
  ipcMain.handle('memory:get', () => lastMemory);
}

app.whenReady().then(() => {
  store = new ThreadlineStore(path.join(app.getPath('userData'), 'threadline.json'));
  registerIpc();
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
    callback(contents === window?.webContents && permission === 'media');
  });
  createWindow();
  sampleMemory();
  memoryTimer = setInterval(sampleMemory, 7000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (memoryTimer) clearInterval(memoryTimer);
  persistAndBroadcast();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

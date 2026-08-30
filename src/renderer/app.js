const api = window.threadline;
const elements = Object.fromEntries(
  [
    'backButton', 'forwardButton', 'reloadButton', 'addressForm', 'addressInput', 'newTabTopButton',
    'memoryPill', 'memoryPillText', 'newTabButton', 'tabsList', 'organizeButton', 'trailButton',
    'journalCount', 'agentStatus', 'memoryNotice', 'memoryNoticeTitle', 'memoryNoticeText',
    'memoryNoticeAction', 'messages', 'agentForm', 'agentInput', 'voiceButton', 'sendButton',
    'trailSearch', 'trailList', 'settingsForm', 'providerSelect', 'modelInput', 'baseUrlInput',
    'apiKeyInput', 'apiKeyStatus', 'memoryLimitInput', 'memoryLimitOutput', 'autoHibernateInput',
    'storeExcerptsInput', 'voiceModeInput', 'settingsFeedback',
  ].map((id) => [id, document.getElementById(id)]),
);

let state = { tabs: [], activeTabId: null, journalCount: 0 };
let settings = null;
let listening = false;

function activeTab() {
  return state.tabs.find((tab) => tab.id === state.activeTabId);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function faviconMarkup(tab) {
  if (tab.favicon) return `<img src="${escapeHtml(tab.favicon)}" alt="" />`;
  let letter = '•';
  try { letter = new URL(tab.url).hostname.replace('www.', '').charAt(0).toUpperCase(); } catch {}
  return escapeHtml(letter);
}

function renderTabs() {
  const groups = new Map();
  for (const tab of state.tabs) {
    const group = tab.pinned ? 'Pinned' : tab.group || 'Loose tabs';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(tab);
  }
  elements.tabsList.innerHTML = [...groups.entries()].map(([group, tabs]) => `
    <section class="tab-group">
      <div class="group-label">${escapeHtml(group)}</div>
      ${tabs.map((tab) => `
        <article class="tab-item ${tab.id === state.activeTabId ? 'active' : ''}" data-tab-id="${tab.id}" title="${escapeHtml(tab.url)}">
          <span class="tab-favicon">${faviconMarkup(tab)}</span>
          <span class="tab-copy">
            <span class="tab-title">${tab.loading ? 'Loading…' : escapeHtml(tab.title || 'New tab')}</span>
            <span class="tab-intent">${escapeHtml(tab.intent || (tab.sleeping ? 'Sleeping · trail saved' : compactDomain(tab.url)))} ${tab.sleeping ? '<span class="sleep-mark">◌</span>' : ''}</span>
          </span>
          <span class="tab-actions">
            <button class="tab-action intent-action" data-tab-id="${tab.id}" title="Set intent">⌁</button>
            <button class="tab-action close-action" data-tab-id="${tab.id}" title="${tab.pinned ? 'Unpin first' : 'Close and archive'}">${tab.pinned ? '◆' : '×'}</button>
          </span>
        </article>`).join('')}
    </section>`).join('');

  elements.tabsList.querySelectorAll('.tab-item').forEach((node) => {
    node.addEventListener('click', (event) => {
      if (!event.target.closest('button')) api.activateTab(node.dataset.tabId);
    });
  });
  elements.tabsList.querySelectorAll('.close-action').forEach((button) => {
    button.addEventListener('click', async () => {
      const tab = state.tabs.find((item) => item.id === button.dataset.tabId);
      if (tab?.pinned) await api.pinTab(tab.id, false);
      else await api.closeTab(button.dataset.tabId);
    });
  });
  elements.tabsList.querySelectorAll('.intent-action').forEach((button) => {
    button.addEventListener('click', async () => {
      const tab = state.tabs.find((item) => item.id === button.dataset.tabId);
      const intent = window.prompt('Why is this tab open?', tab?.intent || '');
      if (intent !== null) await api.setIntent(button.dataset.tabId, intent);
    });
  });
}

function renderState(next) {
  state = next;
  const tab = activeTab();
  if (document.activeElement !== elements.addressInput) elements.addressInput.value = tab?.url || '';
  elements.backButton.disabled = !tab?.canGoBack;
  elements.forwardButton.disabled = !tab?.canGoForward;
  elements.journalCount.textContent = String(next.journalCount || 0);
  renderTabs();
}

function compactDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url || ''; }
}

function switchPanel(name) {
  document.querySelectorAll('.panel-tab').forEach((button) => button.classList.toggle('active', button.dataset.panel === name));
  document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === `${name}Panel`));
  if (name === 'trail') loadTrail();
  if (name === 'settings') loadSettings();
}

function appendMessage(role, content, extraClass = '') {
  const article = document.createElement('article');
  article.className = `message ${role} ${extraClass}`;
  const paragraph = document.createElement('p');
  paragraph.textContent = content;
  article.appendChild(paragraph);
  elements.messages.appendChild(article);
  elements.messages.scrollTop = elements.messages.scrollHeight;
  return article;
}

async function askAgent(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean) return;
  switchPanel('agent');
  appendMessage('user', clean);
  elements.agentInput.value = '';
  elements.sendButton.disabled = true;
  elements.agentStatus.textContent = 'Working across your tabs…';
  const pending = appendMessage('assistant', 'Following the thread…', 'pending');
  try {
    const answer = await api.ask(clean);
    pending.remove();
    appendMessage('assistant', answer.message);
    elements.agentStatus.textContent = answer.source === 'local' ? 'Handled locally.' : 'Agent finished.';
  } catch (error) {
    pending.remove();
    appendMessage('assistant', error.message || String(error), 'error');
    elements.agentStatus.textContent = 'Needs your attention.';
  } finally {
    elements.sendButton.disabled = false;
    elements.agentInput.focus();
  }
}

function formatDay(iso) {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

async function loadTrail() {
  const entries = await api.getJournal(elements.trailSearch.value);
  if (!entries.length) {
    elements.trailList.innerHTML = '<div class="empty-state">Your trail is quiet. Visits and closed tabs will appear here with their links and intent.</div>';
    return;
  }
  let previousDay = '';
  elements.trailList.innerHTML = entries.map((entry) => {
    const day = formatDay(entry.closedAt || entry.visitedAt);
    const heading = day !== previousDay ? `<div class="trail-day">${escapeHtml(day)}</div>` : '';
    previousDay = day;
    return `${heading}<article class="trail-entry">
      <h3>${escapeHtml(entry.title || entry.url)}</h3>
      <span class="trail-url">${escapeHtml(entry.url)}</span>
      ${entry.intent ? `<p class="trail-intent">“${escapeHtml(entry.intent)}”</p>` : ''}
      <div class="trail-meta"><span>${escapeHtml(entry.reason)}</span><button data-entry-id="${entry.id}">Reopen</button></div>
    </article>`;
  }).join('');
  elements.trailList.querySelectorAll('button[data-entry-id]').forEach((button) => {
    button.addEventListener('click', () => api.reopenJournal(button.dataset.entryId));
  });
}

async function loadSettings() {
  settings = await api.getSettings();
  elements.providerSelect.value = settings.ai.provider;
  elements.modelInput.value = settings.ai.model || '';
  elements.baseUrlInput.value = settings.ai.baseUrl || '';
  elements.apiKeyInput.value = '';
  elements.apiKeyStatus.textContent = settings.ai.hasApiKey ? 'A key is saved securely' : 'No key saved';
  elements.memoryLimitInput.value = String(settings.memoryLimitMb);
  renderMemoryLimit();
  elements.autoHibernateInput.checked = settings.autoHibernate;
  elements.storeExcerptsInput.checked = settings.storePageExcerpts;
  elements.voiceModeInput.checked = settings.voiceMode !== 'off';
}

function renderMemoryLimit() {
  const mb = Number(elements.memoryLimitInput.value);
  elements.memoryLimitOutput.textContent = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

function renderMemory(memory) {
  elements.memoryPill.className = `memory-pill ${memory.status}`;
  elements.memoryPillText.textContent = `${memory.totalMb} MB · ${memory.status === 'wall' ? 'memory wall' : memory.status}`;
  const crowded = ['high', 'wall'].includes(memory.status);
  elements.memoryNotice.classList.toggle('hidden', !crowded);
  if (crowded) {
    elements.memoryNoticeTitle.textContent = memory.status === 'wall' ? 'At the memory wall' : 'Memory is crowded';
    elements.memoryNoticeText.textContent = `${memory.totalMb} MB in use. I can hibernate old background tabs and preserve their trail.`;
  }
}

function setupVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    elements.voiceButton.disabled = true;
    elements.voiceButton.title = 'System speech recognition is unavailable';
    return;
  }
  const recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';
  recognition.onstart = () => {
    listening = true;
    elements.voiceButton.classList.add('listening');
    elements.agentStatus.textContent = 'Listening…';
  };
  recognition.onresult = (event) => {
    const transcript = [...event.results].map((result) => result[0].transcript).join('');
    elements.agentInput.value = transcript;
    const final = [...event.results].every((result) => result.isFinal);
    if (final) askAgent(transcript);
  };
  recognition.onend = () => {
    listening = false;
    elements.voiceButton.classList.remove('listening');
    if (elements.agentStatus.textContent === 'Listening…') elements.agentStatus.textContent = 'Ready to keep the thread.';
  };
  recognition.onerror = (event) => appendMessage('assistant', `Voice input: ${event.error}`, 'error');
  elements.voiceButton.addEventListener('click', () => listening ? recognition.stop() : recognition.start());
}

elements.addressForm.addEventListener('submit', (event) => { event.preventDefault(); api.navigate(elements.addressInput.value); });
elements.backButton.addEventListener('click', () => api.back());
elements.forwardButton.addEventListener('click', () => api.forward());
elements.reloadButton.addEventListener('click', () => api.reload());
elements.newTabButton.addEventListener('click', () => api.createTab({}));
elements.newTabTopButton.addEventListener('click', () => api.createTab({}));
elements.organizeButton.addEventListener('click', () => askAgent('Organize my tabs'));
elements.trailButton.addEventListener('click', () => switchPanel('trail'));
elements.memoryPill.addEventListener('click', () => switchPanel('settings'));
elements.memoryNoticeAction.addEventListener('click', async () => {
  const result = await api.saveMemory();
  appendMessage('assistant', `I hibernated ${result.hibernated} background tab${result.hibernated === 1 ? '' : 's'}. Their trail is preserved.`);
});
elements.agentForm.addEventListener('submit', (event) => { event.preventDefault(); askAgent(elements.agentInput.value); });
elements.agentInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); askAgent(elements.agentInput.value); }
});
elements.messages.addEventListener('click', (event) => {
  const button = event.target.closest('[data-prompt]');
  if (button) askAgent(button.dataset.prompt);
});
document.querySelectorAll('.panel-tab').forEach((button) => button.addEventListener('click', () => switchPanel(button.dataset.panel)));
let searchTimer;
elements.trailSearch.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadTrail, 160); });
elements.memoryLimitInput.addEventListener('input', renderMemoryLimit);
elements.settingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.settingsFeedback.textContent = 'Saving…';
  try {
    settings = await api.saveSettings({
      ai: {
        provider: elements.providerSelect.value,
        model: elements.modelInput.value,
        baseUrl: elements.baseUrlInput.value,
        apiKey: elements.apiKeyInput.value,
      },
      memoryLimitMb: Number(elements.memoryLimitInput.value),
      autoHibernate: elements.autoHibernateInput.checked,
      storePageExcerpts: elements.storeExcerptsInput.checked,
      voiceMode: elements.voiceModeInput.checked ? 'system' : 'off',
    });
    elements.apiKeyInput.value = '';
    elements.apiKeyStatus.textContent = settings.ai.hasApiKey ? 'A key is saved securely' : 'No key saved';
    elements.settingsFeedback.textContent = 'Saved.';
  } catch (error) {
    elements.settingsFeedback.textContent = error.message;
  }
});

api.onState(renderState);
api.onMemory(renderMemory);
api.onMemoryAlert((alert) => {
  renderMemory(alert);
  appendMessage('assistant', alert.message);
});
api.onFocusAddress(() => { elements.addressInput.focus(); elements.addressInput.select(); });
api.onNewTab(() => api.createTab({}));
api.onFocusAgent(() => { switchPanel('agent'); elements.agentInput.focus(); });

Promise.all([api.getState(), api.getMemory()]).then(([initialState, memory]) => {
  renderState(initialState);
  renderMemory(memory);
});
setupVoice();

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULTS = Object.freeze({
  version: 1,
  settings: {
    ai: {
      provider: 'none',
      model: '',
      baseUrl: '',
      apiKeyEncrypted: '',
      hasApiKey: false,
    },
    memoryLimitMb: 2200,
    autoHibernate: false,
    storePageExcerpts: true,
    voiceMode: 'system',
    searchEngine: 'https://www.google.com/search?q=',
  },
  tabs: [],
  journal: [],
  chats: [],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function mergeDefaults(value = {}) {
  const defaults = clone(DEFAULTS);
  return {
    ...defaults,
    ...value,
    settings: {
      ...defaults.settings,
      ...(value.settings || {}),
      ai: {
        ...defaults.settings.ai,
        ...(value.settings?.ai || {}),
      },
    },
    tabs: Array.isArray(value.tabs) ? value.tabs : [],
    journal: Array.isArray(value.journal) ? value.journal : [],
    chats: Array.isArray(value.chats) ? value.chats : [],
  };
}

class ThreadlineStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = this.#load();
  }

  #load() {
    try {
      return mergeDefaults(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
      return mergeDefaults();
    }
  }

  read() {
    return clone(this.state);
  }

  mutate(mutator) {
    mutator(this.state);
    this.state.journal = this.state.journal.slice(0, 2000);
    this.state.chats = this.state.chats.slice(-200);
    this.#save();
    return this.read();
  }

  replaceTabs(tabs) {
    this.mutate((state) => {
      state.tabs = clone(tabs);
    });
  }

  updateSettings(patch) {
    this.mutate((state) => {
      state.settings = {
        ...state.settings,
        ...patch,
        ai: { ...state.settings.ai, ...(patch.ai || {}) },
      };
    });
  }

  addJournal(entry) {
    const normalized = {
      id: entry.id || makeId('visit'),
      tabId: entry.tabId || null,
      url: entry.url || '',
      title: entry.title || entry.url || 'Untitled',
      intent: entry.intent || '',
      group: entry.group || 'Loose tabs',
      domain: entry.domain || safeDomain(entry.url),
      excerpt: (entry.excerpt || '').slice(0, 8000),
      reason: entry.reason || 'visited',
      visitedAt: entry.visitedAt || new Date().toISOString(),
      closedAt: entry.closedAt || null,
    };

    this.mutate((state) => {
      const recent = state.journal.find(
        (item) => item.tabId === normalized.tabId && item.url === normalized.url && item.reason === normalized.reason,
      );
      if (recent && Math.abs(Date.parse(recent.visitedAt) - Date.parse(normalized.visitedAt)) < 60_000) {
        Object.assign(recent, normalized, { id: recent.id });
      } else {
        state.journal.unshift(normalized);
      }
    });
    return normalized;
  }

  searchJournal(query, limit = 30) {
    const terms = String(query || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const entries = this.state.journal.filter((entry) => {
      const haystack = [entry.title, entry.url, entry.intent, entry.group, entry.excerpt]
        .join(' ')
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return clone(entries.slice(0, limit));
  }

  addChat(role, content, metadata = {}) {
    this.mutate((state) => {
      state.chats.push({
        id: makeId('chat'),
        role,
        content,
        createdAt: new Date().toISOString(),
        ...metadata,
      });
    });
  }

  #save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, this.filePath);
  }
}

function safeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

module.exports = { DEFAULTS, ThreadlineStore, makeId, safeDomain, mergeDefaults };

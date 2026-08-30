const { safeDomain } = require('./store.cjs');

const GROUP_RULES = [
  ['Build', /github|gitlab|stackoverflow|developer\.|docs\.|npmjs|pypi|vercel|localhost/],
  ['Research', /wikipedia|arxiv|scholar|research|paper|notion|docs\.google/],
  ['Watch & listen', /youtube|spotify|soundcloud|vimeo|podcast/],
  ['Social', /x\.com|twitter|linkedin|reddit|facebook|instagram|threads\.net/],
  ['Shopping', /amazon|ebay|etsy|shop|store|doordash|instacart/],
  ['Messages', /gmail|mail\.|slack|discord|teams|outlook/],
];

function inferGroup(tab) {
  const haystack = `${safeDomain(tab.url)} ${tab.title || ''} ${tab.intent || ''}`.toLowerCase();
  const match = GROUP_RULES.find(([, expression]) => expression.test(haystack));
  return match ? match[0] : 'Loose tabs';
}

function organizeTabs(tabs) {
  return tabs.map((tab) => ({ ...tab, group: tab.intent ? intentGroup(tab.intent) : inferGroup(tab) }));
}

function intentGroup(intent) {
  const clean = String(intent).trim();
  if (!clean) return 'Loose tabs';
  return clean.length > 32 ? `${clean.slice(0, 29)}…` : clean;
}

function duplicateIds(tabs) {
  const seen = new Map();
  const duplicates = [];
  for (const tab of tabs) {
    let key;
    try {
      const url = new URL(tab.url);
      url.hash = '';
      key = url.toString().replace(/\/$/, '');
    } catch {
      key = tab.url;
    }
    if (seen.has(key) && !tab.pinned) duplicates.push(tab.id);
    else seen.set(key, tab.id);
  }
  return duplicates;
}

function memoryCandidates(tabs, activeTabId, count = 3) {
  return tabs
    .filter((tab) => tab.id !== activeTabId && !tab.pinned && !tab.sleeping)
    .sort((a, b) => Date.parse(a.lastActiveAt || 0) - Date.parse(b.lastActiveAt || 0))
    .slice(0, count)
    .map((tab) => tab.id);
}

module.exports = { duplicateIds, inferGroup, intentGroup, memoryCandidates, organizeTabs };

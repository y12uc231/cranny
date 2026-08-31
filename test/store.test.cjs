const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CrannyStore } = require('../src/store.cjs');

function temporaryStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cranny-test-'));
  return {
    directory,
    store: new CrannyStore(path.join(directory, 'cranny.json')),
  };
}

test('starts with private, conservative defaults and persists mutations', (t) => {
  const { directory, store } = temporaryStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  assert.equal(store.read().settings.ai.provider, 'none');
  assert.equal(store.read().settings.autoHibernate, false);

  store.updateSettings({ memoryLimitMb: 1600, ai: { provider: 'anthropic', model: 'test-model' } });
  const reloaded = new CrannyStore(path.join(directory, 'cranny.json'));
  assert.equal(reloaded.read().settings.memoryLimitMb, 1600);
  assert.equal(reloaded.read().settings.ai.provider, 'anthropic');
  assert.equal(reloaded.read().settings.ai.model, 'test-model');
});

test('journal preserves URL, intent, excerpt, and can be searched', (t) => {
  const { directory, store } = temporaryStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  store.addJournal({
    tabId: 'tab_1',
    url: 'https://example.com/llm-memory',
    title: 'Context compaction notes',
    intent: 'Understand memory-efficient agents',
    excerpt: 'A bounded working set avoids context drift.',
    reason: 'closed',
  });

  assert.equal(store.searchJournal('memory agents').length, 1);
  assert.equal(store.searchJournal('context drift')[0].url, 'https://example.com/llm-memory');
  assert.equal(store.searchJournal('unrelated').length, 0);
});

test('rapid duplicate visit events update one journal record', (t) => {
  const { directory, store } = temporaryStore();
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const entry = { tabId: 'tab_1', url: 'https://example.com', title: 'One', reason: 'visited' };
  store.addJournal(entry);
  store.addJournal({ ...entry, title: 'Updated' });
  assert.equal(store.read().journal.length, 1);
  assert.equal(store.read().journal[0].title, 'Updated');
});

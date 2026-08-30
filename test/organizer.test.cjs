const assert = require('node:assert/strict');
const test = require('node:test');
const { duplicateIds, inferGroup, memoryCandidates, organizeTabs } = require('../src/organizer.cjs');

test('organizes by explicit intent before domain heuristics', () => {
  const tabs = organizeTabs([
    { id: 'a', url: 'https://github.com/example/repo', title: 'Repo', intent: '' },
    { id: 'b', url: 'https://example.com', title: 'Essay', intent: 'Plan the Iceland trip' },
  ]);
  assert.equal(tabs[0].group, 'Build');
  assert.equal(tabs[1].group, 'Plan the Iceland trip');
  assert.equal(inferGroup({ url: 'https://arxiv.org/abs/123', title: '', intent: '' }), 'Research');
});

test('finds normalized duplicate URLs without closing pinned copies', () => {
  const tabs = [
    { id: 'a', url: 'https://example.com/page#one', pinned: false },
    { id: 'b', url: 'https://example.com/page#two', pinned: false },
    { id: 'c', url: 'https://example.com/page/', pinned: true },
  ];
  assert.deepEqual(duplicateIds(tabs), ['b']);
});

test('memory candidates are old, inactive, unpinned, and awake', () => {
  const tabs = [
    { id: 'old', lastActiveAt: '2026-01-01', pinned: false, sleeping: false },
    { id: 'new', lastActiveAt: '2026-06-01', pinned: false, sleeping: false },
    { id: 'pinned', lastActiveAt: '2025-01-01', pinned: true, sleeping: false },
    { id: 'asleep', lastActiveAt: '2024-01-01', pinned: false, sleeping: true },
  ];
  assert.deepEqual(memoryCandidates(tabs, 'new', 3), ['old']);
});

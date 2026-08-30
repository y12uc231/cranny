# Architecture

## Why Electron first

Threadline needs real logged-in web pages, independent renderer lifecycles, Chromium DevTools primitives, and a native shell. Electron’s current `WebContentsView` provides that with a much smaller build and maintenance surface than a Chromium fork. The tradeoff is that Electron is not yet a complete consumer browser platform; extensions, profile import, permissions, downloads, and updates require product work.

The code deliberately does not adopt a large browser-agent framework in v0.1. Browser-use and CDP-oriented harnesses are useful references for autonomous task execution, but the differentiator here is lifecycle and memory stewardship inside the daily browser.

## Processes and trust boundaries

```text
Local shell renderer (sandboxed)
  └─ narrow contextBridge / IPC
       └─ Electron main process
            ├─ Tab controller
            ├─ Persistent journal + settings
            ├─ Memory sampler / hibernator
            ├─ Agent planner + action allowlist
            └─ WebContentsView per awake tab (sandboxed, persistent web session)
```

The shell never receives an API key. Remote pages have no preload and no Node.js integration. The main process extracts a bounded semantic snapshot only when needed by the agent or journal.

## Tab lifecycle

- **Awake:** metadata plus a live sandboxed `WebContentsView`.
- **Background:** live but detached from the window’s view tree.
- **Sleeping:** metadata only; reactivation creates a new view and reloads the URL.
- **Closed:** removed from the working set after a final journal snapshot.

Tabs persist across application launches as sleeping tabs. This avoids rebuilding an entire previous renderer working set at startup.

## Durable state

The local JSON store contains:

- settings (with encrypted key material when supported),
- current tab metadata,
- up to 2,000 journal entries,
- up to 200 recent chat turns.

Writes use a temporary file and atomic rename. Page excerpts are bounded to 8,000 characters and can be disabled.

## Memory model

Every seven seconds, the main process totals Electron process working sets and associates renderer PIDs with tabs where possible. Pressure states are relative to the user-configured comfort limit:

- calm: under 65%,
- watch: 65–85%,
- high: 85–100%,
- wall: at or over 100%.

“Make room” hibernates least-recently-used tabs that are inactive, awake, and unpinned. The active tab and pinned tabs are never selected.

## Agent model

Fast deterministic commands are parsed locally. Requests outside that grammar use the configured provider. The provider returns structured JSON containing a short message and allowlisted browser actions. Unknown actions are discarded.

The model sees bounded tab metadata, recent journal metadata, memory state, visible page text, and stable references for visible controls. It does not receive a general JavaScript, shell, or filesystem tool.

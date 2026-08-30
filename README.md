# Threadline

Threadline is a small, local-first browser with a tab steward built into its frame. It behaves like a familiar Chromium browser, but treats open tabs as a working set with intent, memory pressure, and a recoverable trail.

This repository contains a working macOS-first MVP. It is intentionally narrower than a general “AI browser”:

- Tell the agent to open, switch, group, pin, close, or hibernate tabs.
- Give a tab an intent such as “compare ASR papers” so its purpose survives the session.
- Search a local browsing trail after a tab is closed. The title, URL, intent, timestamps, and optional page excerpt remain recoverable.
- See live memory pressure. At the configured wall, Threadline offers to hibernate old background tabs; it never discards their trail.
- Use useful commands without any model, or connect Claude, OpenAI, an OpenAI-compatible endpoint, or local Ollama.
- Push to talk through Chromium’s system speech-recognition path when it is available.

Threadline has no filesystem or shell tool. Page text is treated as untrusted input, and model-proposed actions pass through a fixed browser-only allowlist.

## Run it

Requirements: macOS, Node.js 22+, and npm.

```bash
npm install
npm start
```

To launch it as `threadline` from any terminal:

```bash
npm link
threadline
```

Useful shortcuts:

- `⌘L` focuses the address bar.
- `⌘T` opens a tab.
- `⌘W` archives and closes the active tab.
- `⌘K` focuses the agent.

## Things to say

These commands work locally, without an API key:

- “Organize my tabs”
- “Close duplicate tabs”
- “Save memory”
- “What tabs do I have open?”
- “Set this tab intent to compare agent browsers”
- “Open electronjs.org”
- “Find context compaction in my journal”

With a model configured, Threadline can also summarize the active page, reason over the working set, navigate, and interact with visible page controls. Settings support Anthropic/Claude, OpenAI, OpenAI-compatible APIs, and Ollama. API keys are encrypted with Electron `safeStorage` when the OS keychain is available; otherwise they remain in memory for the current session.

## How it is built

The shell is Electron 44 with one sandboxed `WebContentsView` per awake tab. Sleeping tabs keep metadata but no renderer process. A small main-process controller owns navigation and exposes a narrow IPC bridge to the local shell. State is written atomically to one JSON file under Electron’s per-user application-data directory.

No framework or runtime service is required. Electron is the only package dependency. The implementation favors a small inspectable surface over a Chromium fork for the first version.

Read [PRODUCT.md](docs/PRODUCT.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md), [PRIOR_ART.md](docs/PRIOR_ART.md), and [SECURITY.md](docs/SECURITY.md) for the product thesis and technical boundaries.

## Status and limits

This is a development MVP, not yet a daily-driver Chrome replacement. It does not currently ship an updater, packaged binaries, extension support, profile import, password-manager integration, download UI, multi-window sessions, or transaction confirmations. OAuth popups may open as normal tabs. Those are deliberate follow-on milestones after the tab-memory loop is validated.

Run checks with:

```bash
npm test
npm run check
```

## License

MIT

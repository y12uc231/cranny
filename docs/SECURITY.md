# Security model

Agentic browsers combine private authenticated pages, untrusted web content, and an actor capable of changing page state. That makes prompt injection and unintended data movement core product risks, not edge cases.

## Current safeguards

- Remote pages run in sandboxed `WebContentsView` instances with Node.js integration disabled.
- The UI’s preload exposes named IPC operations instead of raw IPC or Electron objects.
- The model can propose only a fixed set of browser actions. Unknown action types are dropped.
- Page interaction uses temporary references for visible controls; the model cannot submit arbitrary JavaScript.
- The system prompt marks page text as untrusted data.
- Page context and journal excerpts are bounded before provider calls.
- The agent has no shell, filesystem, email, calendar, purchase, or arbitrary network tool.
- Navigation is limited to HTTP(S) and internal blank pages. File URLs are not accepted.
- API keys stay in the main process and are encrypted with OS-backed Electron `safeStorage` when available.
- Pinned tabs cannot be closed or hibernated by the current action path.

## Important MVP limits

Prompt instructions are not a complete defense against page-borne prompt injection. A malicious page may still influence a model’s proposed browser action. Do not use this development build for sensitive transactions or unattended work.

Before broader release, actions that send messages, submit forms, change accounts, expose private text to another origin, or initiate purchases must require an explicit confirmation surface showing the target, data, and consequence. Provider calls should also gain a per-request context disclosure preview and site-level deny rules.

Report security issues privately to the repository owner while the project remains private.

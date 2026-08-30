# Product brief

## Thesis

The browser’s primary object should not be the tab. It should be the user’s thread of intent.

Tabs are transient renderers. Threadline keeps a durable local record of what a page was, why it mattered, and what happened to it. The agent is a steward of that working set rather than a general assistant pasted into a sidebar.

## Product principles

1. **Calm before clever.** Ordinary browsing never waits for a model.
2. **Closing is lossless.** A closed or hibernated tab leaves a searchable title, URL, intent, timestamp, and optional excerpt.
3. **Memory is legible.** The browser names pressure before performance collapses and offers a reversible response.
4. **Intent beats taxonomy.** User-stated intent is the strongest grouping signal. Domain heuristics are only a fallback.
5. **Models are replaceable.** Local commands always work; Claude, OpenAI, compatible services, and Ollama are adapters.
6. **Browser authority only.** The agent has no implicit access to files, the terminal, mail, purchases, or other applications.
7. **Pages are adversarial.** Page content is context, never an instruction source.

## MVP loop

1. Browse normally in real Chromium pages.
2. Tell Threadline why a tab exists, or let it infer a coarse group.
3. Ask the steward to act across open tabs.
4. Watch the working-set memory indicator.
5. At pressure, hibernate old background tabs.
6. Retrieve any prior page from the browsing trail.

## Measures worth tracking

- Percentage of closed tabs successfully rediscovered through the trail.
- Time from “too many tabs” to a useful organized working set.
- Median awake-tab count and memory reclaimed by hibernation.
- Percentage of organization commands handled locally without model latency or cost.
- Rate of incorrect/destructive page actions and confirmation cancellations once confirmations ship.

## Roadmap

### 0.1 — working shell (this repository)

- Real tabbed Chromium views, vertical working set, navigation controls.
- Persistent tab metadata and browsing trail.
- Intent, heuristic organization, duplicate cleanup, hibernation.
- Live memory wall and configurable automatic hibernation.
- Browser-only model adapters and system voice input.

### 0.2 — daily-driver basics

- Packaged and signed macOS build with updater.
- Downloads, permission UI, find-in-page, print, and profile import.
- Better new-tab canvas and session/workspace naming.
- Per-site storage controls and private windows.

### 0.3 — trustworthy agent loop

- Multi-step observe/act loop with action receipts.
- Explicit confirmation for sending messages, submitting forms, purchases, or account changes.
- Prompt-injection classifier and data-egress preview.
- Optional local embeddings for semantic trail search.

### Later — only if the simple loop earns it

- Native ASR adapters such as local Whisper or a configured transcription API.
- Sync as an opt-in encrypted service.
- Chromium fork or CEF only if Electron’s browser limitations become product blockers.

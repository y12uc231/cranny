# Prior art and positioning

The broad idea is not new. The specific product constraint—an intentionally simple browser whose primary agent job is to preserve intent, tab recoverability, and memory headroom—is still a useful wedge.

## Closest products and projects

- [BrowserOS](https://github.com/browseros-ai/BrowserOS) is an open-source Chromium fork with a native agent, persistent memory, and vertical tabs. It is the closest broad open-source comparison, but it aims at a large agentic-browser surface.
- [Tandem Browser](https://tandembrowser.org/) is a local-first browser built to share a real browsing session with agents and emphasizes a multi-layer security pipeline.
- [open-browser-use](https://github.com/open-browser-use/open-browser-use) exposes a browser SDK to an agent through a long-lived JavaScript environment.
- [browser-use](https://github.com/browser-use/browser-use) is a mature open-source browser automation framework with CDP control, message compaction, token tracking, and model adapters. It is better viewed as agent infrastructure than a deliberately minimal daily browser shell.
- [Perplexity Comet](https://www.perplexity.ai/comet) and [Dia](https://www.diabrowser.com/) are proprietary AI browsers focused on general assistance and cross-page task execution.
- Arc popularized vertical tabs, spaces, automatic archival, and tab-chaos reduction before The Browser Company shifted new development toward Dia.
- Norton Neo and other 2025–2026 entrants have also explored smart tab grouping and AI-driven new-tab experiences.

## Cranny’s intended difference

Most competitors lead with “the agent can do anything on the web.” Cranny leads with a smaller promise:

> You can close a tab without losing the thread, and the browser will tell you before the working set becomes unhealthy.

That changes priorities. A browsing journal, explicit intent, deterministic organization, sleeping-tab lifecycle, and memory telemetry belong in the first milestone. General autonomy, application connectors, and a large tool catalog do not.

## Foundation decision

Version 0.1 uses Electron `WebContentsView`, the current replacement for deprecated `BrowserView`, rather than forking Chromium or embedding browser-use. This is the fastest way to validate the interaction loop while retaining isolated Chromium renderers. A fork should be reconsidered only when missing consumer-browser capabilities—not novelty—justify its maintenance cost.

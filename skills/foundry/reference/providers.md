# Providers

The seed table that `providers` reads after the agent's own list of skills and MCP tools.
Foundry never installs a provider. It names the provider, why, a link and its license. When the owner keeps a skills store, it proposes the provider as a PR to that store.

How to read the table:

- Kind is `skill`, `mcp` or `tool`. The row with Kind `fallback` is foundry's own fallback for that theme. Each theme has exactly one.
- A fallback names a foundry template, or `ask the owner` when no template fits. Its license is foundry's own (MIT).
- The Fallback column says `yes` on the fallback row and is blank on the others.
- An MCP row names the capability, not a server. Its link is a public server where one exists, or `self-hosted` when the owner runs their own.
- Licenses are as GitHub reports them on 2026-11-01. Two need care: Shannon is AGPL-3.0, and Trail of Bits skills are CC-BY-SA-4.0. The defending-code harness ships an Apache 2.0 LICENSE file. The Sentry MCP is under FSL-1.1 with an Apache 2.0 future license; GitHub reports it as NOASSERTION, and the terms are in the repo's [LICENSE.md](https://github.com/getsentry/toolkit/blob/main/LICENSE.md).
- Themes and their stages are in [themes.md](themes.md).

## Local overlay

If `~/.config/foundry/local.md` exists, read it before the seed table. It is the owner's own file, outside any repo, and can hold:

- extra provider rows, with the same six columns as the table below; their links may point to private servers;
- a `store:` line: the path to a skills store (a repo listing skill sources) and how to propose a PR to it;
- notes, such as how to find the owner's MCP tools.

For the same theme, its rows win over the seed rows. Never copy its contents into a repo, a commit or a PR. A template is in [../templates/local.md.example](../templates/local.md.example).

## Seed table

| Theme | Provider | Kind (skill/mcp/tool) | License | Link | Fallback |
|---|---|---|---|---|---|
| intent | interview-me | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/interview-me) |  |
| intent | grill-me | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) |  |
| intent | grill-with-docs | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |  |
| intent | pm `create-prd` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/tree/main/pm-execution/skills/create-prd) |  |
| intent | pm `identify-assumptions-new` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/tree/main/pm-product-discovery/skills/identify-assumptions-new) |  |
| intent | pm `pre-mortem` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/tree/main/pm-execution/skills/pre-mortem) |  |
| intent | pm `red-team-prd` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-execution/commands/red-team-prd.md) |  |
| intent | pm `strategy-red-team` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/tree/main/pm-execution/skills/strategy-red-team) |  |
| intent | papers search MCP | mcp | n/a | self-hosted |  |
| intent | web search MCP | mcp | n/a | self-hosted |  |
| intent | scraper MCP (Firecrawl) | mcp | MIT | [firecrawl/firecrawl-mcp-server](https://github.com/firecrawl/firecrawl-mcp-server) |  |
| intent | `templates/PRODUCT.md` | fallback | MIT | [templates/PRODUCT.md](../templates/PRODUCT.md) | yes |
| variants | Matt Pocock `prototype` | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) |  |
| variants | Impeccable `shape` | skill | Apache-2.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable/blob/main/plugin/skills/impeccable/reference/shape.md) |  |
| variants | taste-skill | skill | MIT | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) |  |
| variants | ask the owner | fallback | MIT | n/a | yes |
| decisions | documentation-and-adrs | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/documentation-and-adrs) |  |
| decisions | grill-with-docs | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |  |
| decisions | `templates/decision.md` | fallback | MIT | [templates/decision.md](../templates/decision.md) | yes |
| specs | writing-plans | skill | MIT | [obra/superpowers](https://github.com/obra/superpowers/tree/main/skills/writing-plans) |  |
| specs | ask the owner | fallback | MIT | n/a | yes |
| changes | changesets | tool | MIT | [changesets/changesets](https://github.com/changesets/changesets) |  |
| changes | release-please | tool | Apache-2.0 | [googleapis/release-please](https://github.com/googleapis/release-please) |  |
| changes | ask the owner | fallback | MIT | n/a | yes |
| glossary | domain-modeling | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling) |  |
| glossary | grill-with-docs | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) |  |
| glossary | `templates/GLOSSARY.md` | fallback | MIT | [templates/GLOSSARY.md](../templates/GLOSSARY.md) | yes |
| architecture | codebase-design | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) |  |
| architecture | strategic-programming (code map) | skill | MIT | [razakiau/skills](https://github.com/razakiau/skills/tree/main/skills/strategic-programming) |  |
| architecture | improve-codebase-architecture | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture) |  |
| architecture | `templates/ARCHITECTURE.md` | fallback | MIT | [templates/ARCHITECTURE.md](../templates/ARCHITECTURE.md) | yes |
| design-system | Impeccable `init` | skill | Apache-2.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable/blob/main/plugin/skills/impeccable/reference/init.md) |  |
| design-system | Impeccable `document` | skill | Apache-2.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable/blob/main/plugin/skills/impeccable/reference/document.md) |  |
| design-system | ui-ux-pro-max `design-system` | skill | MIT | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/design-system) |  |
| design-system | Mobbin MCP (design references) | mcp | MIT | [mobbin/mobbin-mcp-server](https://github.com/mobbin/mobbin-mcp-server) |  |
| design-system | image generation MCP (design references) | mcp | n/a | self-hosted |  |
| design-system | check-screens (approved mockups, the screen map) | skill | MIT | [razakiau/skills](https://github.com/razakiau/skills/tree/main/skills/check-screens) |  |
| design-system | ask the owner | fallback | MIT | n/a | yes |
| screens | check-screens | skill | MIT | [razakiau/skills](https://github.com/razakiau/skills/tree/main/skills/check-screens) |  |
| screens | `templates/screens.md` | fallback | MIT | [templates/screens.md](../templates/screens.md) | yes |
| quality-bar | constraint-driven-development | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/constraint-driven-development) |  |
| quality-bar | `templates/CONSTRAINTS.md` | fallback | MIT | [templates/CONSTRAINTS.md](../templates/CONSTRAINTS.md) | yes |
| verification | check-screens (UI changes) | skill | MIT | [razakiau/skills](https://github.com/razakiau/skills/tree/main/skills/check-screens) |  |
| verification | pm `derive-tests` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-ai-shipping/commands/derive-tests.md) |  |
| verification | tdd | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd) |  |
| verification | webapp-testing | skill | Apache-2.0 | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) |  |
| verification | browser-testing-with-devtools | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/browser-testing-with-devtools) |  |
| verification | mobile-automation | skill | Apache-2.0 | [mobile-next/mobile-mcp](https://github.com/mobile-next/mobile-mcp/tree/main/skills/mobile-automation) |  |
| verification | doubt-driven-development | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/doubt-driven-development) |  |
| verification | agency-agents `testing-reality-checker` (reviewer brief) | skill | MIT | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents/blob/main/testing/testing-reality-checker.md) |  |
| verification | browser DevTools MCP | mcp | Apache-2.0 | [ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) |  |
| verification | mobile MCP | mcp | Apache-2.0 | [mobile-next/mobile-mcp](https://github.com/mobile-next/mobile-mcp) |  |
| verification | computer use MCP (desktop) | mcp | n/a | self-hosted |  |
| verification | `templates/AGENTS.md` | fallback | MIT | [templates/AGENTS.md](../templates/AGENTS.md) | yes |
| security-review | security-and-hardening | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/security-and-hardening) |  |
| security-review | Trail of Bits `differential-review` | skill | CC-BY-SA-4.0 | [trailofbits/skills](https://github.com/trailofbits/skills/tree/main/plugins/differential-review) |  |
| security-review | agency-agents `security-ai-generated-code-auditor` (reviewer brief) | skill | MIT | [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents/blob/main/security/security-ai-generated-code-auditor.md) |  |
| security-review | the harness security-review agent (Claude Code `security-review`) | tool | MIT | [anthropics/claude-code-security-review](https://github.com/anthropics/claude-code-security-review) |  |
| security-review | `templates/AGENTS.md` | fallback | MIT | [templates/AGENTS.md](../templates/AGENTS.md) | yes |
| threat-model | Anthropic defending-code `threat-model` | skill | Apache-2.0 | [anthropics/defending-code-reference-harness](https://github.com/anthropics/defending-code-reference-harness/tree/main/.claude/skills/threat-model) |  |
| threat-model | `templates/threat-model.md` | fallback | MIT | [templates/threat-model.md](../templates/threat-model.md) | yes |
| security-scan | pm `security-audit-static` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-ai-shipping/commands/security-audit-static.md) |  |
| security-scan | Cloudflare `security-audit` | skill | MIT | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill/tree/main/skills/security-audit) |  |
| security-scan | Trail of Bits `semgrep` | skill | CC-BY-SA-4.0 | [trailofbits/skills](https://github.com/trailofbits/skills/tree/main/plugins/static-analysis/skills/semgrep) |  |
| security-scan | Trail of Bits `supply-chain-risk-auditor` | skill | CC-BY-SA-4.0 | [trailofbits/skills](https://github.com/trailofbits/skills/tree/main/plugins/supply-chain-risk-auditor) |  |
| security-scan | ask the owner | fallback | MIT | n/a | yes |
| pentest | Shannon (per release, run by the owner) | tool | AGPL-3.0 | [KeygraphHQ/shannon](https://github.com/KeygraphHQ/shannon) |  |
| pentest | Strix (per release, run by the owner) | tool | Apache-2.0 | [usestrix/strix](https://github.com/usestrix/strix) |  |
| pentest | ask the owner | fallback | MIT | n/a | yes |
| readiness | pm `ship-check` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-ai-shipping/commands/ship-check.md) |  |
| readiness | shipping-and-launch | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/shipping-and-launch) |  |
| readiness | ask the owner | fallback | MIT | n/a | yes |
| observability | observability-and-instrumentation | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/observability-and-instrumentation) |  |
| observability | Sentry skills | skill | MIT | [getsentry/sentry-for-ai](https://github.com/getsentry/sentry-for-ai/tree/main/src/skills) |  |
| observability | Sentry MCP (errors) | mcp | FSL-1.1-Apache-2.0 | [getsentry/toolkit](https://github.com/getsentry/toolkit) |  |
| observability | `templates/runbook.md` | fallback | MIT | [templates/runbook.md](../templates/runbook.md) | yes |
| gardening | pm `document-app` (check mode) | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-ai-shipping/commands/document-app.md) |  |
| gardening | pm `derive-tests` (check mode) | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-ai-shipping/commands/derive-tests.md) |  |
| gardening | Linear MCP (tracking) | mcp | n/a (hosted service) | [linear.app/docs/mcp](https://linear.app/docs/mcp) |  |
| gardening | GitHub MCP (tracking) | mcp | MIT | [github/github-mcp-server](https://github.com/github/github-mcp-server) |  |
| gardening | ask the owner | fallback | MIT | n/a | yes |
| tuning | backpass | tool | MIT | [kunchenguid/backpass](https://github.com/kunchenguid/backpass) |  |
| tuning | Matt Pocock `retro` | skill | MIT | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/retro) |  |
| tuning | ask the owner | fallback | MIT | n/a | yes |
| performance | performance-optimization | skill | MIT | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills/tree/main/skills/performance-optimization) |  |
| performance | pm `performance-audit-static` | skill | MIT | [phuryn/pm-skills](https://github.com/phuryn/pm-skills/blob/main/pm-ai-shipping/commands/performance-audit-static.md) |  |
| performance | ask the owner | fallback | MIT | n/a | yes |

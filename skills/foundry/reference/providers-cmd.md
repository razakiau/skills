# Providers

Maps each theme of the stage to a provider the agent already has, or to foundry's fallback.
Never install a skill or MCP server. Recommend; the owner decides.
`<skill dir>` is the folder holding SKILL.md. Call the script with `node`, exactly as written.

### 1. List the themes

Run `node <skill dir>/scripts/foundry.mjs state` and read `stage` and `providers`. Read [themes.md](themes.md) for the themes open at that stage.
Done: you have the list of open themes and the providers already recorded.

### 2. Search what the agent has

If `~/.config/foundry/local.md` exists, read it first (see "Local overlay" in [providers.md](providers.md)). Its rows win over the seed rows for the same theme, and its notes may say how to find the owner's tools. An overlay row counts only if the agent can reach that tool now, as with seed rows. Never copy its contents into the repo.
For each theme, search your own skills list and MCP tools for one that does the work. Use `mcp_tool_search` or `local_tool_search` when present.
Done: each theme has a match from the overlay or the agent's own tools, or none.

### 3. Fall back to the seed table

For a theme with no match, read its rows in [providers.md](providers.md). A row counts only if the agent has that provider now. Otherwise use the theme's `fallback` row.
Done: each theme names one provider or its fallback.

### 4. Record the choice

Edit `.agents/foundry.json` and set `providers.<theme>` to the provider's name, for example `"intent": "grill-me"`. Keep 2-space JSON with one key per line.
Show the owner the mapping before you save it.
Done: `node <skill dir>/scripts/foundry.mjs state` prints the new `providers` without error.

### 5. Recommend where the fallback is thin

For a theme where the fallback is not enough, recommend one provider from [providers.md](providers.md) with:

- its name;
- why it fits this repo;
- its link;
- its license, from the table. Flag the two that need care: Shannon is AGPL-3.0, and Trail of Bits skills are CC-BY-SA-4.0.

Then check for a skills store you keep (a repo listing skill sources). Its location comes from the `store:` line of the local overlay.

- With a store, offer a PR to it that adds the provider, as the `store:` line says. Open it only on the owner's yes.
- Without one, point the owner to `npx skills find <query>`.

Never install it yourself.
Done: each thin theme has a recommendation with all four parts, and the store PR or the `npx skills find` pointer.

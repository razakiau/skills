# Providers

check-screens names what it needs, not a tool. For each need, use the first provider you can reach. Never install one yourself: name it, say why, and let the owner install it.

| Need | Providers, in order |
| --- | --- |
| Capture web | Playwright (the `capture` command, or a Playwright MCP), Chrome DevTools MCP, the harness's own browser |
| Capture native | A mobile MCP or device agent on an emulator or simulator |
| Measure against the mockup | impeccable `comp-diff` (per-region scores) when impeccable is installed; otherwise the reviewer compares by eye from captures of the same size |
| Design review | impeccable critique when installed; otherwise the reviewer's own checks ([reviewer.md](reviewer.md)) |
| Tokens and drift | dembrandt when installed; otherwise the tokens file the map names in `design-source:` |
| Route table | The framework's CLI (`react-router routes --json`, nuxt-mcp-dev) or the code ([map.md](map.md#route-tables)) |

`capture` uses the Playwright that the app has installed (`playwright` or `@playwright/test`, resolved from the repo top). It does not bring its own. When the app keeps Playwright in another folder, such as a workspace package, set `CHECK_SCREENS_PLAYWRIGHT_FROM=<that folder>` for the command.

## Capture with a browser MCP

When `capture` exits 3, capture with the browser MCP your harness has, and keep everything else the same:

1. Set the viewport to each width: 360 px (plus the mockup's own phone width when it differs) and 1440 px. Use a height of 800 px below 1024 px wide and 900 px from 1024 px.
2. Set the colour scheme to light, then to dark when the app has both. Use the MCP's colour scheme emulation, not a theme toggle in the page, unless the app has no other way.
3. Turn on reduced motion when the MCP can, open the URL, wait for the network to go idle, then wait 300 ms more.
4. Check the page: it has text, and it shows no framework error overlay. If it fails, it is not a capture; fix the page first.
5. Take a full-page screenshot and save it as `.check-screens/captures/<screen>-<width>-<theme>[-<state>].png`. The screen and state are slugs: lower case, every run of other characters turned into one `-`, so `Settings / Billing` becomes `settings-billing`.

Files saved this way work with `record` and `approve` like the script's own. An MCP that cannot save to a path returns an image: save it under the same name yourself. When the MCP cannot set the width, say which width you captured instead and do not name the file as if it were 360 or 1440.

For a native app, use the device's own screen width in the name (`home-393-light.png`) and capture each state the change affects.

## No browser

When no provider can capture the screen, the screen was not checked. Say so in the report, in those words: "not checked: no browser to capture <screen>". Do not run the reviewer on code alone, do not describe how the screen probably looks, and do not `record` it. Name the provider that would have worked, so the owner can install it.

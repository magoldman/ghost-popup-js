# ghost-popup-js

Single-file embeddable popup for Ghost blogs that promotes newsletter signup and social sharing. Consumers either load it from CDN or paste it inline into Ghost Admin → Settings → Code Injection → Site Footer.

## File layout

- `ghost-popup.js` — **pure JS** (v2+). Builds the popup DOM + style at runtime via `document.createElement` + a runtime-injected `<style>` block. Configurable via `window.POPUP_CONFIG`. In v1 this file mixed HTML, CSS, and JS in one paste; v2 made it CDN-loadable.
- `README.md` — install instructions + config reference.
- `LICENSE` — MIT.

## Versioning + release

This is a vendored library used by external sites. Treat releases as semver:
- **Major** (v2 → v3) for breaking install or config changes
- **Minor** (v2.0 → v2.1) for new config fields, new events, new triggers
- **Patch** (v2.0.0 → v2.0.1) for bug fixes that don't touch the schema

Release flow:
1. PR a change to `main` (don't push direct — local auto-mode classifier blocks it; use `gh pr create`)
2. After merge: `git tag vX.Y.Z && git push origin vX.Y.Z`
3. jsdelivr automatically serves the tag at `https://cdn.jsdelivr.net/gh/magoldman/ghost-popup-js@vX.Y.Z/ghost-popup.js`

## Configuration

Defaults live in the `DEFAULTS` object at the top of `ghost-popup.js`. Consumers override via `window.POPUP_CONFIG`. **Don't bake real-site branding into the defaults** — the file ships as a generic library, sites supply their own `siteName`/`siteUrl`/`logoUrl`/etc. via the config block.

## Load-bearing constraint: UTM placement in `portalLink`

`POPUP_CONFIG.portalLink` MUST keep UTM params **before** the `#` fragment, e.g.:

```
/?utm_source=popup&utm_medium=ghost&utm_campaign=subscribe_popup#/portal/signup
```

Ghost Portal opens off the `#/portal/signup` fragment, but analytics tools (Tinybird, GA, Plausible) only parse UTMs from the query string. If UTMs end up after the `#`, Portal still opens but every analytics tool sees `utm_source` as empty. This was the bug fixed when we shipped v2 from a real-world site; the README documents this for end users too.

## Behavior summary (v2)

- Triggers (any combination, configurable): time elapsed, scroll percentage, mouse exit-intent.
- Hidden from logged-in Ghost members — checks `body.is-member` class, `ghost-members-ssr` cookie, and `window.ghost.member`. v1's `window.member` check was always false (Ghost doesn't set that global), so v1 popups showed to members; fixed in v2.
- Dismissable via × button, click outside, or Escape key. Dismissal persists in localStorage for `dismissExpiryDays` days (default 60).
- Fires analytics events to `gtag` and `plausible` if loaded:
  - `popup_shown`
  - `popup_subscribe_click`
  - `popup_share_click { platform: "x" | "linkedin" }`
  - `popup_dismissed { method: "close_button" | "backdrop_click" | "escape_key" }` *(backdrop_click replaced outside_click in v2.0.1; corner-toast modes don't dismiss on outside click anymore)*

## Social share toggle — v2.1.0

`POPUP_CONFIG.social` (default `"all"`) gates the X + LinkedIn share buttons:
- `"all"` — show both (legacy behavior, default)
- `"linkedin"` — show only LinkedIn
- `"x"` — show only X
- `"none"` — skip the entire `.share-icons` block; the popup becomes a single-CTA subscribe-only modal

Use case: consumer sites that decide shares are a distraction and want to focus 100% of popup intent on subscribe. The library keeps `"all"` as default so existing installs don't change behavior on a version bump; opt out by setting `social: "none"` in config.

Implementation: validation + `showX`/`showLi` booleans computed up-front, then `if (showX || showLi)` wraps the whole share-row construction, with individual `if (showX) {...}` / `if (showLi) {...}` blocks inside. Event wiring is also gated (`if (xLink)`, `if (liLink)`) so we don't crash when buttons aren't rendered.

## Subscribe-click tracking — v2.0.2 fix

v2.0.x prior used `<form action><button type=submit>`. Clicking the button fired the `popup_subscribe_click` gtag/Plausible event AND submitted the form (navigated to `/portal/signup`) in the same tick. gtag's beacon often hadn't flushed before page unload, so the event was lost in transit. We saw this in production: 1,263 `popup_shown` events across 3 sites in 7 days, only 1 `popup_subscribe_click`. Actual click rate was being under-counted by ~99%.

v2.0.2 fixes by:
1. Replacing the form with `<a href>` so we own the click semantics.
2. Calling `e.preventDefault()` to suppress default navigation.
3. Firing the event with `event_callback` (gtag) and `callback` (Plausible). Navigation happens from whichever callback fires first.
4. `setTimeout(go, 500)` as a belt-and-suspenders fallback in case neither analytics tool is loaded OR the callback never fires (ad-blocker, network failure, etc.).

The share buttons (X, LinkedIn) use `target="_blank"`, which opens a new window without unloading the current page. Their events flush normally; no fix needed for shares.

## DOM + storage identifiers

- DOM root id: `#ghost-popup` (don't reintroduce a site prefix)
- localStorage key: `ghostPopupClosed` by default, configurable via `cfg.storageKey`
- Inline `<style>` tag tagged with `data-ghost-popup` attribute for trivial discovery

## Third-party hotlinks

`xIcon` and `linkedinIcon` defaults point at Twitter and LinkedIn CDNs. Leave the "Consider self-hosting" note in the README — these URLs can rot.

## What changed v1 → v2

- Pure JS (was HTML+CSS+JS combined)
- Builds DOM at runtime (was inline `<div id="ghost-popup">…`)
- Reads config from `window.POPUP_CONFIG` (was inline `POPUP_CONFIG = {…}`)
- CDN-loadable via jsdelivr (was paste-only)
- Member detection fixed (was `!window.member` which was always true)
- Close (×) button + Escape handler (was outside-click only)
- Dismiss expiry capped at 60 days (was forever)
- Full conversion-funnel events (was `popup_shown` only)
- ARIA dialog roles + close button has `aria-label`

## Git workflow

- Remote: `https://github.com/magoldman/ghost-popup-js.git`
- Direct push to `main` is blocked. Use a feature branch + PR via `gh pr create`.
- After PR merge: tag the release (`git tag vX.Y.Z && git push origin vX.Y.Z`).

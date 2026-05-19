# ghost-popup-js

A small, MIT-licensed subscribe + share popup for [Ghost](https://www.ghost.org) blogs. Drops into Site Footer code injection. No build step, no dependencies.

## Install (CDN)

Paste into Ghost Admin → **Settings → Code Injection → Site Footer**:

```html
<script>
window.POPUP_CONFIG = {
  siteName: "Your Site",
  siteUrl:  "https://yoursite.com",
  logoUrl:  "https://yoursite.com/path/to/logo.png",
  buttonColor: "#F9A60D"
};
</script>
<script src="https://cdn.jsdelivr.net/gh/magoldman/ghost-popup-js@v2.0.0/ghost-popup.js" defer></script>
```

jsdelivr serves the file directly from this repo's tagged release. Pin to a version (`@v2.0.0`) so future changes don't surprise your live site. To upgrade, bump the version.

## Install (inline)

If you'd rather not depend on a CDN, paste `window.POPUP_CONFIG` plus the full contents of `ghost-popup.js` directly inside two `<script>` tags in Site Footer code injection. Same behavior.

## Configuration

All fields are optional except `siteName`, `siteUrl`, and `logoUrl`. Defaults shown:

| Field | Default | Description |
|---|---|---|
| `siteName` | `"Your Site"` | Used in heading + share text |
| `siteUrl` | `"https://yoursite.com"` | Used in share links |
| `logoUrl` | `""` | Logo shown in the popup. Omit for no logo. |
| `buttonColor` | `"#F9A60D"` | CSS color for the Subscribe button |
| `headline` | `null` → `"Subscribe to <siteName>"` | Heading text |
| `description` | `null` → `"Subscribe today or share this post"` | Body text |
| `buttonLabel` | `"Subscribe"` | Subscribe button label |
| `shareXText` | `null` → `"Check out <siteName>!"` | Pre-filled text on the X share button |
| `xIcon` | hotlinked from twitter.com | Consider self-hosting |
| `linkedinIcon` | hotlinked from linkedin.com | Consider self-hosting |
| `portalLink` | `/?utm_source=popup&utm_medium=ghost&utm_campaign=subscribe_popup#/portal/signup` | **Don't change unless you know about the URL-fragment caveat below.** |
| `triggers.timeSeconds` | `10` | Show after N seconds. `0` to disable. |
| `triggers.scrollPct` | `30` | Show after scrolling N% of page. `0` to disable. |
| `triggers.exitIntent` | `true` | Show on mouse-leave through top edge (desktop only). |
| `dismissExpiryDays` | `60` | Re-show to dismissers after this many days. |
| `storageKey` | `"ghostPopupClosed"` | localStorage key used to track dismissal. |

## Behavior

- Shown when *any* enabled trigger fires.
- Hidden from logged-in Ghost members (checks `body.is-member`, `ghost-members-ssr` cookie, and `window.ghost.member`).
- Dismissable via × button, click outside, or Escape key. Dismissal persists in localStorage for `dismissExpiryDays` days.
- Fires analytics events to `gtag` and `plausible` if either is loaded on the page:
  - `popup_shown` — when popup first appears
  - `popup_subscribe_click` — Subscribe button clicked
  - `popup_share_click` `{ platform: "x" | "linkedin" }` — share button clicked
  - `popup_dismissed` `{ method: "close_button" | "outside_click" | "escape_key" }`

## Why UTM params go before the `#` in `portalLink`

Ghost Portal opens the signup modal when the URL fragment becomes `#/portal/signup`. Analytics tools (Tinybird, GA, Plausible) only parse UTM params from the **query string** — the fragment is never sent to the server. If you put UTMs after the `#`, Portal still opens but every analytics tool sees `utm_source` as empty.

The default `portalLink` puts UTMs before the fragment. If you override it, keep that structure:

```
✓  /?utm_source=popup&utm_medium=ghost&utm_campaign=subscribe_popup#/portal/signup
✗  /#/portal/signup/?utm_source=popup&utm_medium=ghost&utm_campaign=subscribe_popup
```

## Upgrading from v1

v1 was a single HTML+CSS+JS paste with hardcoded strings. v2 is a pure JS file that builds the DOM at runtime and reads everything from `window.POPUP_CONFIG`.

- v1 install: paste the file's whole contents into Site Footer.
- v2 install: paste a small `POPUP_CONFIG` block + a `<script src>` to the CDN.

v2 also:
- Fixes the member-detection check (v1 was always showing to logged-in members)
- Adds a close button + Escape key handler
- Caps dismiss memory at 60 days (was lifetime)
- Fires the full conversion funnel as events
- Moves UTM params before the `#` so analytics can see the popup

## License

MIT.

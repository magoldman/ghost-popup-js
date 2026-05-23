/*!
 * ghost-popup-js v2.1.0
 * Subscribe + share popup for Ghost blogs. MIT licensed.
 * https://github.com/magoldman/ghost-popup-js
 *
 * v2.1.0: new `social` config option to hide one or both share buttons.
 *   social: 'all'      — show both X and LinkedIn (default, current behavior)
 *   social: 'linkedin' — show only LinkedIn
 *   social: 'x'        — show only X
 *   social: 'none'     — hide the entire share-icons row (focuses popup on subscribe CTA)
 *
 * v2.0.2: fixes the subscribe-click tracking dead zone. v2.0.x prior used
 * <form action> + <button type=submit>; clicking the button fired the
 * popup_subscribe_click gtag/plausible event AND navigated to /portal/signup
 * in the same tick. GA4's gtag often hadn't flushed the beacon before the
 * page unloaded, so the event was lost. Result: 1,263 popup_shown across 3
 * sites in 7 days, only 1 popup_subscribe_click. The actual click rate was
 * not 0.08% — it was just under-counted by ~99%.
 *
 * Fix: replace the form with an <a href>, intercept the click, fire the
 * event with event_callback + Plausible callback, navigate from the
 * callback (with a 500ms timeout fallback in case the callback never fires).
 *
 * Install (CDN, recommended):
 *
 *   <script>
 *   window.POPUP_CONFIG = {
 *     siteName: "Your Site",
 *     siteUrl:  "https://yoursite.com",
 *     logoUrl:  "https://yoursite.com/path/to/logo.png",
 *     buttonColor: "#F9A60D"
 *   };
 *   </script>
 *   <script src="https://cdn.jsdelivr.net/gh/magoldman/ghost-popup-js@v2.1.0/ghost-popup.js" defer></script>
 *
 * Paste this in Ghost Admin → Settings → Code Injection → Site Footer.
 *
 * v2.0.1: position now defaults to 'bottom-right' (slide-in corner toast).
 * Center mode now has a dimmed backdrop. Override via POPUP_CONFIG.position:
 *   'bottom-right' (default) | 'bottom-left' | 'center'
 *
 * Load-bearing detail (don't regress): POPUP_CONFIG.portalLink MUST keep
 * UTM params BEFORE the # fragment. Ghost Portal opens off the
 * `#/portal/signup` fragment, but analytics tools (Tinybird, GA, Plausible)
 * only parse UTMs from the query string. The default below has them in the
 * right place. If you override portalLink, keep the same shape.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // DEFAULTS — placeholders only. Override via window.POPUP_CONFIG.
  // Do NOT bake real-site branding into this file.
  // ---------------------------------------------------------------------
  var DEFAULTS = {
    siteName: 'Your Site',
    siteUrl: 'https://yoursite.com',
    logoUrl: '',
    buttonColor: '#F9A60D',
    portalLink: '/?utm_source=popup&utm_medium=ghost&utm_campaign=subscribe_popup#/portal/signup',
    headline: null,        // null → "Subscribe to <siteName>"
    description: null,     // null → "Subscribe today or share this post"
    buttonLabel: 'Subscribe',
    position: 'bottom-right', // 'bottom-right' | 'bottom-left' | 'center'
    social: 'all',            // 'all' | 'linkedin' | 'x' | 'none'
    // Third-party icon hotlinks. Consider self-hosting — these URLs can rot.
    xIcon:        'https://abs.twimg.com/favicons/twitter.3.ico',
    linkedinIcon: 'https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca',
    shareXText: null,      // null → "Check out <siteName>!"
    triggers: {
      timeSeconds: 10,   // show after N seconds (0 to disable)
      scrollPct:   30,   // show after scrolling N% of the page (0 to disable)
      exitIntent:  true, // show when mouse leaves through the top edge
    },
    dismissExpiryDays: 60, // re-show to dismissers after this many days
    storageKey: 'ghostPopupClosed',
  };

  // ---------------------------------------------------------------------
  // CONFIG resolution
  // ---------------------------------------------------------------------
  function mergeDeep(target, source) {
    var out = {};
    for (var k in target) out[k] = target[k];
    if (source) {
      for (var k2 in source) {
        if (source[k2] && typeof source[k2] === 'object' && !Array.isArray(source[k2])) {
          out[k2] = mergeDeep(target[k2] || {}, source[k2]);
        } else {
          out[k2] = source[k2];
        }
      }
    }
    return out;
  }
  var cfg = mergeDeep(DEFAULTS, window.POPUP_CONFIG || {});
  var validPositions = { 'bottom-right': 1, 'bottom-left': 1, 'center': 1 };
  if (!validPositions[cfg.position]) cfg.position = 'bottom-right';
  var isModal = cfg.position === 'center';

  var validSocials = { 'all': 1, 'linkedin': 1, 'x': 1, 'none': 1 };
  if (!validSocials[cfg.social]) cfg.social = 'all';
  var showX  = cfg.social === 'all' || cfg.social === 'x';
  var showLi = cfg.social === 'all' || cfg.social === 'linkedin';

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  // Member detection. v1's `window.member` check was always false (Ghost
  // does not expose that global), so v1 popups showed to logged-in members
  // unnecessarily. Check the three signals Ghost actually emits.
  function isLoggedInMember() {
    if (document.body && document.body.classList.contains('is-member')) return true;
    if (document.cookie.indexOf('ghost-members-ssr') !== -1) return true;
    if (window.ghost && window.ghost.member) return true;
    return false;
  }

  // Dismiss tracking. v1 stored the literal string "true" → dismissers
  // never saw the popup again. v2 stores Date.now() and re-shows after
  // dismissExpiryDays. v1 storage values are migrated by clearing them.
  function wasRecentlyDismissed() {
    var raw = null;
    try { raw = localStorage.getItem(cfg.storageKey); } catch (e) { return false; }
    if (!raw) return false;
    if (raw === 'true') { // v1 legacy
      try { localStorage.removeItem(cfg.storageKey); } catch (e) {}
      return false;
    }
    var ts = parseInt(raw, 10);
    if (!ts || isNaN(ts)) return false;
    var ageMs = Date.now() - ts;
    var maxAgeMs = cfg.dismissExpiryDays * 24 * 60 * 60 * 1000;
    return ageMs < maxAgeMs;
  }

  function markDismissed() {
    try { localStorage.setItem(cfg.storageKey, String(Date.now())); } catch (e) {}
  }

  // Analytics event firing. Adapts to whatever's loaded on the page.
  function fire(eventName, props) {
    props = props || {};
    if (window.gtag) {
      try { window.gtag('event', eventName, Object.assign({ event_category: 'popup' }, props)); } catch (e) {}
    }
    if (window.plausible) {
      try { window.plausible(eventName, { props: props }); } catch (e) {}
    }
  }

  // Fire an event AND navigate, but make sure the beacon flushes first.
  // gtag returns synchronously but the underlying network call may not have
  // sent before window.location changes — and a partial beacon gets dropped
  // by the browser on unload. event_callback (gtag) and callback (Plausible)
  // both fire when the beacon is queued; we navigate from whichever fires
  // first. 500ms timeout fallback in case neither analytics tool is loaded
  // OR the callback never fires.
  function fireAndNavigate(eventName, url, props) {
    var navigated = false;
    function go() {
      if (navigated) return;
      navigated = true;
      window.location.href = url;
    }

    var fired = false;
    if (window.gtag) {
      fired = true;
      try {
        window.gtag('event', eventName, Object.assign({
          event_category: 'popup',
          event_callback: go,
          event_timeout: 500,
        }, props || {}));
      } catch (e) {}
    }
    if (window.plausible) {
      fired = true;
      try {
        window.plausible(eventName, { props: props || {}, callback: go });
      } catch (e) {}
    }

    // Belt-and-suspenders: fire after 500ms regardless. Covers (a) neither
    // analytics tool loaded, and (b) analytics tool present but callback
    // never fires (network blocked, ad-blocker, etc.).
    setTimeout(go, fired ? 500 : 0);
  }

  // ---------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------
  function injectStyles() {
    var css =
      // Base popup card — position-class controls placement + transform
      '#ghost-popup{position:fixed;background:#fdfdfd;border:1px solid #e5e5e5;' +
      'padding:2em 1.5em;box-shadow:0 4px 24px rgba(0,0,0,0.18);z-index:9999;' +
      'max-width:360px;width:90%;font-family:"Helvetica Neue",sans-serif;' +
      'display:none;border-radius:8px;box-sizing:border-box;text-align:center;' +
      'opacity:0;transition:opacity 0.4s ease-in-out,transform 0.4s ease-in-out}' +

      // Center (modal-style)
      '#ghost-popup.pos-center{top:50%;left:50%;' +
        'transform:translate(-50%,-50%) scale(0.96)}' +
      '#ghost-popup.pos-center.show{transform:translate(-50%,-50%) scale(1)}' +

      // Bottom-right toast — stacked above Ghost native Subscribe button (~16px+56px)
      '#ghost-popup.pos-bottom-right{right:16px;bottom:88px;left:auto;top:auto;' +
        'transform:translateX(24px)}' +
      '#ghost-popup.pos-bottom-right.show{transform:translateX(0)}' +

      // Bottom-left toast — symmetric, doesn't fight Ghost native Subscribe
      '#ghost-popup.pos-bottom-left{left:16px;bottom:24px;right:auto;top:auto;' +
        'transform:translateX(-24px)}' +
      '#ghost-popup.pos-bottom-left.show{transform:translateX(0)}' +

      '#ghost-popup.show{display:block;opacity:1}' +

      // Backdrop — modal mode only
      '#ghost-popup-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.5);' +
        'z-index:9998;opacity:0;display:none;' +
        'transition:opacity 0.4s ease-in-out}' +
      '#ghost-popup-backdrop.show{display:block;opacity:1}' +

      // Internal layout
      '#ghost-popup .ghost-popup-close{position:absolute;top:8px;right:12px;' +
      'background:transparent;border:0;cursor:pointer;font-size:24px;' +
      'line-height:1;color:#888;padding:4px 8px;border-radius:4px}' +
      '#ghost-popup .ghost-popup-close:hover{color:#000;background:#f0f0f0}' +
      '#ghost-popup .ghost-popup-close:focus-visible{outline:2px solid #4a90e2;outline-offset:2px}' +
      '#ghost-popup .logo{position:absolute;top:12px;left:12px;width:40px;height:auto}' +
      '#ghost-popup h2{font-size:1.4em;margin:0 0 0.5em;padding-left:52px;' +
      'text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#ghost-popup p{text-align:center;font-size:1em;margin-bottom:1em}' +
      '#ghost-popup .subscribe-btn{margin-top:1em;padding:0.5em 1em;border:none;' +
      'color:#fff;cursor:pointer;font-weight:bold;border-radius:4px;width:100%;box-sizing:border-box;' +
      'display:block;text-align:center;text-decoration:none;font-family:inherit;font-size:inherit}' +
      '#ghost-popup .subscribe-btn:hover{color:#fff;text-decoration:none}' +
      '#ghost-popup .subscribe-btn:focus-visible{outline:2px solid #4a90e2;outline-offset:2px}' +
      '#ghost-popup a{text-decoration:none}' +
      '#ghost-popup .share-icons{display:flex;justify-content:center;gap:1em;margin-top:1em;flex-wrap:wrap}' +
      '#ghost-popup .share-icon{display:flex;flex-direction:column;align-items:center;' +
      'text-decoration:none;color:#333;font-size:12px;width:64px;margin-bottom:0.5em}' +
      '#ghost-popup .share-icon img{width:36px;height:36px;border-radius:50%;' +
      'background:#eee;padding:6px;margin-bottom:4px;object-fit:contain}' +

      // Mobile — corner toasts become a full-width strip pinned to the bottom
      '@media (max-width:480px){#ghost-popup{padding:2em 1em;max-width:none;width:auto}' +
      '#ghost-popup.pos-bottom-right,#ghost-popup.pos-bottom-left{' +
        'left:8px;right:8px;bottom:16px;transform:translateY(20px)}' +
      '#ghost-popup.pos-bottom-right.show,#ghost-popup.pos-bottom-left.show{transform:translateY(0)}' +
      '#ghost-popup.pos-center{width:90%}' +
      '#ghost-popup h2{font-size:1.3em;padding-left:0;text-align:center;white-space:normal}' +
      '#ghost-popup .logo{position:static;display:block;margin:0 auto 1em}' +
      '#ghost-popup .share-icons{gap:0.5em}#ghost-popup .share-icon{width:48px}}' +

      // Dark mode
      '@media (prefers-color-scheme:dark){#ghost-popup{background:#1a1a1a;border-color:#2a2a2a;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.6);color:#f0f0f0}' +
      '#ghost-popup h2{color:#f0f0f0}#ghost-popup p,#ghost-popup .share-icon{color:#c4c4c4}' +
      '#ghost-popup .ghost-popup-close{color:#888}' +
      '#ghost-popup .ghost-popup-close:hover{color:#fff;background:#2a2a2a}}';
    var styleEl = document.createElement('style');
    styleEl.setAttribute('data-ghost-popup', '');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  function build() {
    var root = document.createElement('div');
    root.id = 'ghost-popup';
    root.className = 'pos-' + cfg.position;
    root.setAttribute('role', 'dialog');
    // Center+backdrop is modal-like; corner toast leaves page interactive.
    root.setAttribute('aria-modal', isModal ? 'true' : 'false');
    root.setAttribute('aria-labelledby', 'ghost-popup-headline');

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ghost-popup-close';
    closeBtn.setAttribute('aria-label', 'Close subscribe popup');
    closeBtn.textContent = '×';
    root.appendChild(closeBtn);

    if (cfg.logoUrl) {
      var logo = document.createElement('img');
      logo.className = 'logo';
      logo.src = cfg.logoUrl;
      logo.alt = (cfg.siteName || 'Site') + ' logo';
      root.appendChild(logo);
    }

    var h2 = document.createElement('h2');
    h2.id = 'ghost-popup-headline';
    h2.textContent = cfg.headline || ('Subscribe to ' + cfg.siteName);
    root.appendChild(h2);

    var p = document.createElement('p');
    p.textContent = cfg.description || 'Subscribe today or share this post';
    root.appendChild(p);

    // Anchor (not <form><button type=submit>) so we can intercept the click
    // and ensure the gtag/Plausible beacon flushes before navigation. See
    // fireAndNavigate(). Keep href set so JS-disabled clients still reach
    // Portal (graceful degradation).
    var subBtn = document.createElement('a');
    subBtn.className = 'subscribe-btn';
    subBtn.style.background = cfg.buttonColor;
    subBtn.href = cfg.portalLink;
    subBtn.setAttribute('role', 'button');
    subBtn.textContent = cfg.buttonLabel;
    root.appendChild(subBtn);

    // Share icons — gated by cfg.social. Set 'none' to focus the popup
    // entirely on subscribe (one CTA, no distractions). The whole
    // .share-icons block is skipped if both showX and showLi are false.
    var xLink = null, liLink = null;
    if (showX || showLi) {
      var shareDiv = document.createElement('div');
      shareDiv.className = 'share-icons';
      var shareText = cfg.shareXText || ('Check out ' + cfg.siteName + '!');
      var shareUtm = 'utm_source=popup&utm_medium=ghost&utm_campaign=share_popup';

      if (showX) {
        xLink = document.createElement('a');
        xLink.className = 'share-icon';
        xLink.href = 'https://twitter.com/intent/tweet?text=' +
          encodeURIComponent(shareText) + '&url=' + encodeURIComponent(cfg.siteUrl) +
          '&' + shareUtm;
        xLink.target = '_blank';
        xLink.rel = 'noopener';
        var xImg = document.createElement('img');
        xImg.src = cfg.xIcon;
        xImg.alt = 'X logo';
        xLink.appendChild(xImg);
        xLink.appendChild(document.createTextNode('Share on X'));
        shareDiv.appendChild(xLink);
      }

      if (showLi) {
        liLink = document.createElement('a');
        liLink.className = 'share-icon';
        liLink.href = 'https://www.linkedin.com/shareArticle?mini=true&url=' +
          encodeURIComponent(cfg.siteUrl) + '&' + shareUtm;
        liLink.target = '_blank';
        liLink.rel = 'noopener';
        var liImg = document.createElement('img');
        liImg.src = cfg.linkedinIcon;
        liImg.alt = 'LinkedIn logo';
        liLink.appendChild(liImg);
        liLink.appendChild(document.createTextNode('Share on LinkedIn'));
        shareDiv.appendChild(liLink);
      }

      root.appendChild(shareDiv);
    }

    document.body.appendChild(root);

    // Event wiring — exposes a real conversion funnel:
    //   popup_shown → popup_subscribe_click → (Portal arrival, via utm_source=popup)
    //                ↘ popup_share_click  { platform: x | linkedin }    (only if social ≠ 'none')
    //                ↘ popup_dismissed    { method: close_button | backdrop_click | escape_key }
    subBtn.addEventListener('click', function (e) {
      e.preventDefault();
      fireAndNavigate('popup_subscribe_click', cfg.portalLink);
    });
    if (xLink)  xLink.addEventListener('click',  function () { fire('popup_share_click', { platform: 'x' }); });
    if (liLink) liLink.addEventListener('click', function () { fire('popup_share_click', { platform: 'linkedin' }); });
    closeBtn.addEventListener('click', function () { dismiss('close_button'); });

    return root;
  }

  function buildBackdrop() {
    var b = document.createElement('div');
    b.id = 'ghost-popup-backdrop';
    b.addEventListener('click', function () { dismiss('backdrop_click'); });
    document.body.appendChild(b);
    return b;
  }

  // ---------------------------------------------------------------------
  // Show / dismiss
  // ---------------------------------------------------------------------
  var popupEl = null;
  var backdropEl = null;
  var shown = false;

  function show() {
    if (shown || wasRecentlyDismissed() || isLoggedInMember()) return;
    if (!popupEl) popupEl = build();
    if (isModal && !backdropEl) backdropEl = buildBackdrop();
    if (backdropEl) backdropEl.classList.add('show');
    popupEl.classList.add('show');
    shown = true;
    fire('popup_shown');

    // Corner toasts: leave page interactive. Center modal: backdrop click +
    // Escape dismiss. Escape is wired in both modes; outside-click is only
    // wired via the backdrop (so reading-clicks on the page don't kill the
    // corner toast accidentally).
    setTimeout(function () {
      document.addEventListener('keydown', keydownHandler);
    }, 50);
  }

  function dismiss(method) {
    if (!popupEl || !shown) return;
    popupEl.classList.remove('show');
    if (backdropEl) backdropEl.classList.remove('show');
    shown = false;
    markDismissed();
    fire('popup_dismissed', { method: method || 'unknown' });
    document.removeEventListener('keydown', keydownHandler);
  }

  function keydownHandler(e) {
    if (e.key === 'Escape') dismiss('escape_key');
  }

  // ---------------------------------------------------------------------
  // Bootstrap + triggers
  // ---------------------------------------------------------------------
  function init() {
    injectStyles();
    if (wasRecentlyDismissed() || isLoggedInMember()) return;

    if (cfg.triggers.timeSeconds > 0) {
      setTimeout(show, cfg.triggers.timeSeconds * 1000);
    }

    if (cfg.triggers.scrollPct > 0) {
      var scrollHandler = function () {
        var max = document.body.scrollHeight - window.innerHeight;
        if (max <= 0) return;
        if (window.scrollY / max > cfg.triggers.scrollPct / 100) {
          window.removeEventListener('scroll', scrollHandler);
          show();
        }
      };
      window.addEventListener('scroll', scrollHandler, { passive: true });
    }

    if (cfg.triggers.exitIntent) {
      document.addEventListener('mouseleave', function (e) {
        if (e.clientY < 0) show();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

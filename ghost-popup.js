<!--
Reusable Ghost Popup for Subscriptions + Sharing
=================================================
This embeddable popup can be injected into any Ghost blog to encourage subscriptions and sharing.

CONFIGURATION:
1. Update the POPUP_CONFIG block below with your:
   - Site name
   - Site URL
   - Logo URL
   - Portal signup link
   - Button color
   - Share icon URLs (you may wish to host these yourself)

INSTALLATION:
1. Go to Ghost Admin → Settings → Code Injection → Site Footer.
2. Paste the entire contents of this script.
3. Save and test your site.

BEHAVIOR:
- Triggers after 10s, 30% scroll, or exit intent.
- Does not show to logged-in members.
- Closes on click outside popup.
-->

<script>
// === CONFIG START ===
const POPUP_CONFIG = {
  siteName: "CardsFTW",
  siteUrl: "https://cardsftw.com",
  logoUrl: "https://www.cardsftw.com/content/images/2025/04/cftwlogo.png",
  portalLink: "/#/portal/signup/?utm_source=popup&utm_medium=ghost&utm_campaign=subscribe_popup",
  buttonColor: "#F9A60D",
  xIcon: "https://abs.twimg.com/favicons/twitter.3.ico", // Consider self-hosting
  linkedinIcon: "https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca" // Consider self-hosting
};
// === CONFIG END ===
</script>

<style>
#cards-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fdfdfd;
  border: 1px solid #e5e5e5;
  padding: 2em 1.5em 2em 1.5em;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  z-index: 9999;
  max-width: 360px;
  width: 90%;
  font-family: 'Helvetica Neue', sans-serif;
  display: none;
  border-radius: 8px;
  box-sizing: border-box;
  text-align: center;
  opacity: 0;
  transition: opacity 0.4s ease-in-out;
}
#cards-popup.show {
  display: block;
  opacity: 1;
}
#cards-popup .logo {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 40px;
  height: auto;
}
#cards-popup h2 {
  font-size: 1.4em;
  margin: 0 0 0.5em;
  padding-left: 52px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#cards-popup p {
  text-align: center;
  font-size: 1em;
  margin-bottom: 1em;
}
#cards-popup button {
  margin-top: 1em;
  padding: 0.5em 1em;
  border: none;
  background: var(--popup-btn-color);
  color: #ffffff;
  cursor: pointer;
  font-weight: bold;
  border-radius: 4px;
  width: 100%;
  box-sizing: border-box;
}
#cards-popup a {
  text-decoration: none;
}
#cards-popup .share-icons {
  display: flex;
  justify-content: center;
  gap: 1em;
  margin-top: 1em;
  flex-wrap: wrap;
}
#cards-popup .share-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-decoration: none;
  color: #333;
  font-size: 12px;
  width: 64px;
  margin-bottom: 0.5em;
}
#cards-popup .share-icon img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #eee;
  padding: 6px;
  margin-bottom: 4px;
  object-fit: contain;
}
@media (max-width: 480px) {
  #cards-popup {
    padding: 2em 1em;
    max-width: 90%;
  }
  #cards-popup h2 {
    font-size: 1.3em;
    padding-left: 0;
    text-align: center;
    white-space: normal;
  }
  #cards-popup .logo {
    position: static;
    display: block;
    margin: 0 auto 1em;
  }
  #cards-popup .share-icons {
    gap: 0.5em;
  }
  #cards-popup .share-icon {
    width: 48px;
  }
}
</style>

<div id="cards-popup">
  <img class="logo" id="popup-logo" alt="Site Logo">
  <h2 id="popup-heading"></h2>
  <p>Subscribe today or share this post</p>
  <form id="popup-form" method="GET">
    <button type="submit">Subscribe</button>
  </form>
  <div class="share-icons">
    <a class="share-icon" id="share-x" target="_blank">
      <img id="x-icon" alt="X logo">
      Share on X
    </a>
    <a class="share-icon" id="share-linkedin" target="_blank">
      <img id="linkedin-icon" alt="LinkedIn logo">
      Share on LinkedIn
    </a>
  </div>
</div>

<script>
(function() {
  const popup = document.getElementById('cards-popup');
  const logo = document.getElementById('popup-logo');
  const heading = document.getElementById('popup-heading');
  const form = document.getElementById('popup-form');
  const shareX = document.getElementById('share-x');
  const shareLinkedIn = document.getElementById('share-linkedin');
  const xIcon = document.getElementById('x-icon');
  const linkedinIcon = document.getElementById('linkedin-icon');

  // Set dynamic content
  logo.src = POPUP_CONFIG.logoUrl;
  heading.innerText = `Subscribe to ${POPUP_CONFIG.siteName}`;
  form.action = POPUP_CONFIG.portalLink;
  document.documentElement.style.setProperty('--popup-btn-color', POPUP_CONFIG.buttonColor);
  shareX.href = `https://twitter.com/intent/tweet?text=Check out ${POPUP_CONFIG.siteName}!&url=${POPUP_CONFIG.siteUrl}&utm_source=popup&utm_medium=ghost&utm_campaign=share_popup`;
  shareLinkedIn.href = `https://www.linkedin.com/shareArticle?mini=true&url=${POPUP_CONFIG.siteUrl}&utm_source=popup&utm_medium=ghost&utm_campaign=share_popup`;
  xIcon.src = POPUP_CONFIG.xIcon;
  linkedinIcon.src = POPUP_CONFIG.linkedinIcon;

  let shown = false;
  function showPopup() {
    if (!shown && !localStorage.getItem('cardsPopupClosed')) {
      if (!window.member) {
        popup.classList.add('show');
        shown = true;

        if (window.gtag) {
          gtag('event', 'popup_shown', {
            'event_category': 'Engagement',
            'event_label': 'Subscribe Share Popup'
          });
        }
        if (window.plausible) {
          plausible('Popup Shown');
        }

        // Click outside to close
        setTimeout(() => {
          document.addEventListener('click', function outsideClickHandler(e) {
            if (!popup.contains(e.target)) {
              popup.classList.remove('show');
              localStorage.setItem('cardsPopupClosed', 'true');
              document.removeEventListener('click', outsideClickHandler);
            }
          });
        }, 50);
      }
    }
  }

  setTimeout(showPopup, 10000);
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY / (document.body.scrollHeight - window.innerHeight);
    if (scrolled > 0.3) showPopup();
  });
  document.addEventListener('mouseleave', function(e) {
    if (e.clientY < 0) showPopup();
  });
})();
</script>

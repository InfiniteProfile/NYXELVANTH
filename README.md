# NYXELVANTH

**ONE UNIVERSE. INFINITE IDENTITIES. LIMITLESS POSSIBILITIES.**

NYXELVANTH is a no-framework, static website that generates deterministic digital profiles in the browser. It is designed for GitHub Pages and does not require an API key, backend, login, paid hosting, or third-party image service.

## Files

- `index.html` — page structure and accessible controls
- `style.css` — responsive cosmic interface and reduced-motion support
- `script.js` — deterministic profile generator, exact-ID search, virtualized scrolling, and profile pages

## Run it

1. Keep all three files in the same folder.
2. Open `index.html` in a modern browser, or publish the folder using GitHub Pages.
3. Search for any positive decimal ID. The ID is treated as a string/`BigInt`, never as a JavaScript floating-point number.
4. Open a card to view its direct profile URL, which uses `?profile=ID` and works on a static host such as GitHub Pages.

## Infinite feed behavior

- The initial logical batch contains 300 identities.
- As the visible browsing position approaches roughly 100 identities into the available batch, the script begins preparing another batch of 300.
- Further batches are triggered automatically before the user reaches the prepared range's end.
- Cards are virtualized: only a small window around the viewport is in the DOM at once. This keeps DOM usage bounded during long sessions.
- The virtual scroll coordinate is periodically rebased while keeping the same profile at the same viewport position. This avoids accumulating an enormous browser document height; it is not an instruction to scroll the user's visible content.
- No Load More control, pagination stop, final card, or application-level profile cap is used.

## ID and identity model

Each ID is a positive decimal string. Feed IDs advance using decimal-string arithmetic, and profile lookup uses the exact decimal text / `BigInt` indexing. A profile can therefore be generated directly even when its ID is far beyond `Number.MAX_SAFE_INTEGER`; the app does not have to generate every smaller ID first.

Names, sectors, status values, colors, and SVG portraits are derived deterministically from the ID. Portraits are embedded SVG data URIs, so they do not depend on remote image hosts. The generated full name ends with the unique ID (for example, `Nova Vale #123`), making exact name lookup practical even for IDs not previously visited.

ID search accepts only positive decimal digits. Leading zeroes are normalized (`00042` resolves to ID `42`); zero, signs, decimals, scientific notation, and non-digit characters are rejected. Full-name search verifies the full generated name including its `#ID` suffix. Partial-name search scans at most the first 2,000 and most recent 2,000 prepared identities so it stays bounded; it does not claim to search an infinite name database.

## Static-site limits (important)

This is an algorithmic profile universe, not a shared user database. Profiles are deterministic and reproducible on any copy running the same generator version, but edits are not synchronized between visitors and there is no account-based persistent data. For user-created profiles that must be globally shared, editable, and persistent, a real database/API would be required.

Browsers and URL implementations have practical limits on extremely large text fields and URLs, and browser engines still use finite rendering and memory resources. This project avoids an application-imposed ID digit cap and uses virtualization/rebasing to extend scrolling well beyond a conventional finite feed, but no browser application can promise literally infinite physical memory, browser uptime, or input length.

## Performance details

- Virtual rendering limits live card DOM to the visible range plus a small overscan window.
- A bounded least-recently-used profile cache keeps at most 900 generated profile descriptors.
- Identity portraits are local SVG data URIs; no remote image request is needed.
- Scroll work is animation-frame scheduled; the scroll listener is passive.
- The layout honors `prefers-reduced-motion` and adapts to narrow screens.

## Basic verification checklist

- [ ] Open `index.html` and confirm the profile cards appear.
- [ ] Scroll until approximately profile 100; the generation status should briefly show that the next 300 are being prepared.
- [ ] Keep scrolling; new batches should arrive without a Load More button or automatic visual scrolling.
- [ ] Search IDs such as `1`, `99`, `100000`, `999999999999999999999999999999`, and `123456789012345678901234567890123456789`.
- [ ] Open a profile and refresh the `?profile=ID` URL.
- [ ] Resize to a narrow Android-sized viewport and verify there is no horizontal overflow.
- [ ] Temporarily block clipboard access and confirm the profile remains usable; clipboard failure is reported in a toast.

## Publish with GitHub Pages

1. Create a repository named `NYXELVANTH` (or any repository name you prefer).
2. Upload `index.html`, `style.css`, and `script.js` to the repository root.
3. Open **Settings → Pages**, select the branch and `/ (root)` as the publishing source, and save.
4. Wait for GitHub Pages to publish the first build, then open the Pages URL.

No build step is needed.

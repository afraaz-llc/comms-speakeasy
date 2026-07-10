# design

Editable source files for the comms logo. Keep the master here so the
project is self-contained — no dependency on external drives.

## comms-logo.ai

The Adobe Illustrator **master** — the editable vector source of the logo
(the swoosh circling a negative-space speech bubble). Edit this when the
mark needs to change.

**Exported / deployed versions live in the repo root** and are derived from
this master:

- `favicon.svg` — flattened SVG mark, used as the site favicon
- `apple-touch-icon.png` — 180px, dark background, iOS home-screen icon
- `og-image.png` — 1024px, dark background + wordmark, link-share preview

If you re-edit `comms-logo.ai`, re-export those three to keep them in sync.

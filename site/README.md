# MDownManager — marketing site

Static landing page for **mdownmanager.com**. Single self-contained `index.html`
(no build step). Fonts load from Google Fonts; Vercel Web Analytics is wired in.

## Deploy (Vercel, from this GitHub repo)
1. Vercel → **Add New… → Project** → import `nickhilster/MDownManager`.
2. **Root Directory:** `site`
3. **Framework Preset:** Other (no build command, output = the folder).
4. Add domain **mdownmanager.com** under the project's **Domains** tab.
5. Enable **Web Analytics** under the project's **Analytics** tab.

Every push to `main` that touches `site/` redeploys automatically.

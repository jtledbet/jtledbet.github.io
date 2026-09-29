# jtledbet.github.io

Personal portfolio for [Jon Ledbetter](https://jtledbet.github.io/), cybersecurity engineer and full-stack developer.

**Live:** https://jtledbet.github.io/

---

## Pages

| File | Route | Description |
|------|-------|-------------|
| `index.html` | `/` | About, bio, credentials, social links, and visible game launchers |
| `portfolio/index.html` | `/portfolio/` | Project showcase with category filters |
| `cummings/index.html` | `/cummings/` | Public-domain E. E. Cummings reader |
| `support/index.html` | `/support/` | Coffee, tips, payment links, and paid-help entry point |
| `coffee/index.html` | `/coffee/` | Separate shareable coffee/tip page |
| `contact/index.html` | `/contact/` | Contact info |

## Stack

Vanilla HTML, CSS, and JavaScript. No build step, no framework, no bundler. Hosted on GitHub Pages from `master`.

## Projects

18 projects across web apps, games, and CLI tools, including live deployments on GitHub Pages and Railway. See [portfolio](portfolio/) for the full list.

Pinball Wizard and NTv4x are linked from the About page's Play section, above the bio. Pinball also opens directly at `/#pinball`; NTv4x lives at `/projects/ntv4x/`. The existing long-press and typed easter egg shortcuts remain available.

## Local Development

Serve locally:

```bash
python -m http.server 8080
# → http://localhost:8080
```

## Branches

| Branch | Purpose |
|--------|---------|
| `master` | Production, auto-deployed to GitHub Pages |
| `redesign` | Merged to `master`, redesign complete |

## Assets

```
assets/
  css/        Legacy stylesheets (superseded by inline styles in redesign)
  images/     Project screenshots and UI assets
  resume/     Resume PDF
```

# jtledbet.github.io

Personal portfolio site for Jon Ledbetter — deployed on GitHub Pages.

**Live:** https://jtledbet.github.io/

---

## Pages

| File | Route | Description |
|------|-------|-------------|
| `index.html` | `/` | About / bio page |
| `portfolio.html` | `/portfolio.html` | Project showcase |
| `contact.html` | `/contact.html` | Contact form / links |

---

## Tech Stack

- Static HTML / CSS / JavaScript — no build step, no framework
- [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts
- Dark theme with purple accent (`#8b68d4`), custom CSS variables
- Sticky nav with backdrop blur

---

## Running Locally

No build step required.

```bash
# Python (built-in)
python -m http.server 8080
# then open http://localhost:8080

# or with npx
npx serve -l 3000
```

VS Code: the **Live Server** extension (`Go Live!`) works on port 5500.

---

## Deployment

Deployed automatically via GitHub Pages from the `master` branch. Push to `master` → live within ~1 minute.

There is an in-progress `redesign` branch — test locally before merging to `master`.

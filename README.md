# Procon USA Law — MVA Intake

A click-through digital version of the Procon USA Law MVA (Motor Vehicle Accident)
paper intake checklist. Deployed as a static site — no backend, no database. Every
answer stays in the browser until the intake is finished, then it's exported as a
downloadable PDF summary.

## Using it
Open the site, click "Start Intake," and answer each question by clicking a
choice (or typing where needed). At the end, click **Download PDF** to save a
summary for the case file.

## Local preview
No build step required — it's plain HTML/CSS/JS.
```
python3 -m http.server 8000
```
then open http://localhost:8000

## Deploying updates
This repo is served via GitHub Pages from the `main` branch root. Push changes
to `main` and the live site updates automatically within a minute or two.

## Structure
- `index.html` — page shell, header/logo, progress bar
- `style.css` — Procon USA Law black/gold theme
- `app.js` — question flow schema, branching logic, PDF export

# Forkcast

A personal calorie and macro diary in the style of Cronometer, with three ways to log food:

- **Search**: USDA FoodData Central (generic foods plus ~400k branded products). Open Food Facts results are added when its search service accepts browser requests.
- **Barcode**: live camera scan (native `BarcodeDetector` on Android/Chrome, ZXing elsewhere, including iPhone), a barcode from a photo, or a typed number. Looks up Open Food Facts first, then USDA Branded. Unknown barcodes can be saved as a custom food from the label.
- **From Claude**: send a meal photo to your Forkcast project in Claude (it uses your Claude subscription, no API key). Claude ends its reply with a `FORKCAST {...}` block. Copy it, tap **From Claude → Paste from Claude**, adjust grams or untick items, and log them as separate entries or as one combined meal. Setup steps and the project instructions are in [CLAUDE_PROJECT_INSTRUCTIONS.md](CLAUDE_PROJECT_INSTRUCTIONS.md).

Everything is stored in your browser's local storage. Use Settings → Export to back it up.

## Run it on your computer

```bash
python -m http.server 5173
```

Then open http://localhost:5173. The camera works on localhost.

## Use it on your phone

Phone browsers only allow the camera on **https** pages, so host the folder somewhere with HTTPS. Two free options:

- **Netlify Drop**: go to app.netlify.com/drop and drag this folder onto the page. You get an https URL right away.
- **GitHub Pages**: push the folder to a repository and turn on Pages in the repository settings.

Open the URL on your phone, then use "Add to Home Screen" (Safari share menu, or the Chrome menu) so it opens like an app.

## Setup in the app (Settings, gear icon)

1. **Daily targets** for calories, protein, carbs and fat.
2. **USDA key**: `DEMO_KEY` works but has low rate limits. A free key from api.data.gov removes them.

## Files

- `index.html`: page structure
- `styles.css`: design (light and dark)
- `app.js`: diary, search, barcode, pasted Claude estimates
- `CLAUDE_PROJECT_INSTRUCTIONS.md`: what to paste into the Claude Project
- `sw.js`, `manifest.webmanifest`, `icon.svg`: installable app and offline shell

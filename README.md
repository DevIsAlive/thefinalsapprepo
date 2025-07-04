# AAAFinalsApp – Overwolf Web App for THE FINALS

This is a high-fidelity Overwolf web app designed for THE FINALS, featuring a modern, glassmorphic UI, micro-interactions, and a professional dark theme. 

## Project Structure
- `manifest.json`: Overwolf app manifest (main entry for packaging)
- `.opkignore`: Specifies files/folders to exclude from packaging
- `index.html`, `index_hello.html`: Main and minimal HTML windows
- `main.js`: Main JavaScript logic
- `style.css`: Main stylesheet
- `icon.png`: App icon
- `assets/`: Folder for images, SVGs, fonts, and other static assets

## Packaging & Running
1. Ensure all files above are present and referenced in `manifest.json`.
2. Place any additional assets (SVGs, icons, etc.) in the `assets/` folder and reference them in your HTML/CSS.
3. Use Overwolf's developer tools or CLI to package the app:
   - Package: `overwolf-tools pack .`
   - Test:    `overwolf-tools run .`

## Notes
- The app is set to auto-launch with THE FINALS (set `auto_launch_game_ids` in manifest if required).
- All UI/UX is themed for gaming, with glassmorphism, micro-interactions, and smooth animations.
- Edit `manifest.json` to update window files, icons, or add permissions/features.

For more, see [Overwolf Web App Docs](https://overwolf.github.io/docs/api/overwolf-web/).

## Deploying the OCR Plugin DLL to Your Overwolf App

1. **Copy these files from `OcrPlugin/bin/Release/net48/` to your app root (`/AAAFinalsApp/`):**
   - `OcrPlugin.dll`
   - `Tesseract.dll`
2. **Copy these files from `OcrPlugin/bin/Release/net48/x64/` to your app root:**
   - `leptonica-1.80.0.dll`
   - `tesseract41.dll`
3. **Ensure `/AAAFinalsApp/tessdata/eng.traineddata` exists.**

Your app root should now contain:
- OcrPlugin.dll
- Tesseract.dll
- leptonica-1.80.0.dll
- tesseract41.dll
- tessdata/eng.traineddata

This will ensure your Overwolf app can load and use the OCR plugin with all dependencies.

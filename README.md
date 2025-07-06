# AAAFinalsApp – Overwolf Web App for THE FINALS

This is a high-fidelity Overwolf web app designed for THE FINALS, featuring real-time OCR functionality to detect usernames in specific screen regions using the OCR.space API. 

## Project Structure
- `manifest.json`: Overwolf app manifest (main entry for packaging)
- `index.html`: Main desktop window
- `ingame_overlay.html`: Real-time game overlay
- `ocr_space_test.html`: OCR.space API test application
- `main.js`: Main JavaScript logic
- `background.js`: Background script for game events
- `style.css`: Main stylesheet
- `icon.png`: App icon
- `assets/`: Folder for images, sounds, and other static assets
- `RapidOcrNetPlugin.cs`: C# plugin (to be updated for OCR.space)

## Packaging & Running
1. Ensure all files above are present and referenced in `manifest.json`.
2. Place any additional assets (SVGs, icons, etc.) in the `assets/` folder and reference them in your HTML/CSS.
3. Use Overwolf's developer tools or CLI to package the app:
   - Package: `overwolf-tools pack .`
   - Test:    `overwolf-tools run .`

## OCR Testing

### OCR.space API Test
Open `ocr_space_test.html` in your browser to test the OCR.space API:
- Upload any image to test OCR functionality
- No API key required for testing (uses demo key)
- Free tier allows 500 requests/day
- Get your API key at [https://ocr.space/ocrapi](https://ocr.space/ocrapi)

## Notes
- The app is set to auto-launch with THE FINALS (set `auto_launch_game_ids` in manifest if required).
- All UI/UX is themed for gaming, with glassmorphism, micro-interactions, and smooth animations.
- OCR functionality uses cloud-based OCR.space API for better reliability.
- Edit `manifest.json` to update window files, icons, or add permissions/features.

For more, see [Overwolf Web App Docs](https://overwolf.github.io/docs/api/overwolf-web/).

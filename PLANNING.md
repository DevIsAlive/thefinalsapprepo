# AAAFinalsApp - Project Planning & Architecture

## 🎯 Project Overview
AAAFinalsApp is an Overwolf extension that provides real-time OCR functionality for The Finals game, detecting usernames in specific screen regions and providing game statistics tracking.

## 🏗️ Architecture

### Core Components
1. **Background Script** (`background.js`) - Main orchestrator, handles game events
2. **Desktop Window** (`index.html`) - Main UI for configuration and results display
3. **Ingame Overlay** (`ingame_overlay.html`) - Real-time game overlay
4. **Custom OCR Plugin** (`RapidOcrNetPlugin.dll`) - C# .NET 4.8 plugin for OCR processing
5. **OCR Log Window** (`ocr_log.html`) - Debug and logging interface

### Technology Stack
- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: C# .NET Framework 4.8
- **OCR Engine**: OCR.space API (cloud-based)
- **Platform**: Overwolf Extensions API
- **Build System**: MSBuild (.NET Framework)

## 📁 File Structure
```
AAAFinalsApp/
├── assets/                 # Static assets (icons, sounds)
├── screenshots/           # Captured screenshots
├── *.html                 # UI windows (including ocr_space_test.html)
├── *.js                   # JavaScript logic
├── *.css                  # Styling
├── RapidOcrNetPlugin.cs   # Main C# plugin (to be updated for OCR.space)
├── manifest.json          # Overwolf manifest
└── build_plugin.bat       # Build script
```

## 🔧 Development Guidelines

### Code Style
- **JavaScript**: ES6+ with async/await, consistent logging
- **C#**: .NET Framework 4.8, COM interop for Overwolf
- **CSS**: Modern flexbox/grid, responsive design
- **File Size**: Max 500 lines per file, modular structure

### Naming Conventions
- **Files**: kebab-case (e.g., `ingame-overlay.html`)
- **Functions**: camelCase (e.g., `takeScreenshot()`)
- **Classes**: PascalCase (e.g., `RapidOcrNetPlugin`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `SCREENSHOT_INTERVAL`)

### Logging Strategy
- **Levels**: ERROR, WARN, INFO, DEBUG
- **Format**: `[Timestamp] [Component] [Level] Message`
- **Targets**: Console, OCR log window, file system

## 🎮 Game Integration

### The Finals Specific
- **Resolution**: 1920x1080 (scaled for other resolutions)
- **Username Regions**: 3 predefined screen areas
- **Game Events**: lobby, ingame, death, summary
- **Polling**: 2.5-second intervals during lobby

### OCR Regions (1920x1080 base)
1. **Box 0**: (765, 285) - 478x34 - Top player
2. **Box 1**: (783, 161) - 474x31 - Middle player  
3. **Box 2**: (791, 68) - 384x33 - Bottom player

## 🔌 Plugin Architecture

### C# Plugin Interface
```csharp
public class RapidOcrNetPlugin
{
    void Test(Action<object> callback)
    void TakeScreenshot(Action<object> callback)
    void ScanUsernameRegions(string imagePath, Action<object> callback)
    void PerformOcr(string imagePath, int x, int y, int width, int height, Action<object> callback)
}
```

### JavaScript Integration
```javascript
overwolf.extensions.current.getExtraObject('RapidOcrPlugin', (result) => {
    if (result.status === 'success') {
        ocrPlugin = result.object;
        // Use plugin methods
    }
});
```

## 🚀 Performance Considerations
- **Screenshot Rate**: 2.5 seconds during lobby only
- **OCR Processing**: Async, non-blocking
- **Memory Management**: Dispose screenshots after processing
- **Error Handling**: Graceful fallbacks, retry logic

## 🔒 Security & Privacy
- **Cloud Processing**: OCR done via OCR.space API, images sent to external service
- **Data Storage**: Screenshots stored locally, auto-cleanup
- **API Limits**: 500 requests/day free tier, rate limiting implemented
- **Permissions**: Minimal required Overwolf permissions

## 📋 Development Workflow
1. **Feature Development**: Create branch, implement, test
2. **Plugin Updates**: Rebuild DLL, restart Overwolf
3. **Testing**: Use test buttons, check logs
4. **Deployment**: Package extension, update manifest

## 🐛 Debugging Strategy
- **Console Logs**: Browser dev tools
- **Plugin Logs**: `rapidocrnet_plugin.log`
- **Overwolf Logs**: AppData/Local/Overwolf/Log/
- **Test Functions**: Built-in test buttons for each component 
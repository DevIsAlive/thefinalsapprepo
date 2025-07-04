# OcrPlugin (Overwolf Native OCR Plugin)

This is a native C# plugin for Overwolf, providing fast OCR (Optical Character Recognition) for your app using Tesseract.

## Build Instructions

1. Open `OcrPlugin.csproj` in Visual Studio (2019 or later).
2. Restore NuGet packages (Tesseract).
3. Make sure you have `System.Drawing` and `Overwolf.SDK.Plugins` referenced.
4. Build the project in **Release** mode (targeting .NET Framework 4.8).
5. Copy the resulting `OcrPlugin.dll` to your Overwolf app directory (`/AAAFinalsApp/`).
6. Download the Tesseract language data (`tessdata/eng.traineddata`) and place it in a `tessdata` folder next to the DLL.

## Usage
- The plugin exposes `OcrRegion(filePath, x, y, width, height, callback)` to JavaScript.
- The JS code in `background.js` will call this method and receive the OCR result.

## Dependencies
- [Tesseract .NET](https://github.com/charlesw/tesseract)
- System.Drawing
- Overwolf.SDK.Plugins (provided by Overwolf)

## Notes
- You can add more languages by placing additional `.traineddata` files in `tessdata`.
- Make sure the DLL and `tessdata` are accessible to the Overwolf app at runtime. 
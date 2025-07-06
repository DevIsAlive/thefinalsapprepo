@echo off
echo Building RapidOcrNetPlugin...

REM Set paths
set CSC_PATH="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
set REFS=System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,Microsoft.CSharp.dll,SkiaSharp.dll,Microsoft.ML.OnnxRuntime.dll,System.Drawing.Common.dll,System.Memory.dll,System.Buffers.dll,System.Runtime.CompilerServices.Unsafe.dll,System.Numerics.Vectors.dll
set RAPIDOCRNET_DLL=RapidOcrNet.dll

REM Check if RapidOcrNet.dll exists
if not exist "%RAPIDOCRNET_DLL%" (
    echo Error: RapidOcrNet.dll not found!
    echo Please make sure RapidOcrNet.dll is in the current directory.
    pause
    exit /b 1
)

REM Check if SkiaSharp.dll exists
if not exist "SkiaSharp.dll" (
    echo Error: SkiaSharp.dll not found!
    echo Please make sure SkiaSharp.dll is in the current directory.
    pause
    exit /b 1
)

REM Compile the plugin
%CSC_PATH% /target:library /out:RapidOcrNetPlugin.dll /reference:%REFS% /reference:%RAPIDOCRNET_DLL% /optimize+ /debug- RapidOcrNetPlugin.cs

if %ERRORLEVEL% EQU 0 (
    echo Build successful! RapidOcrNetPlugin.dll created.
) else (
    echo Build failed!
)

pause 
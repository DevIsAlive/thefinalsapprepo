using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Tesseract;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Diagnostics;
using System.Security.Principal;
using System.Reflection;

namespace overwolf.plugins
{
    public class OcrPlugin
    {
        // Windows API imports for screenshot capture
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern IntPtr GetWindowRect(IntPtr hWnd, ref RECT rect);

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleBitmap(IntPtr hDC, int nWidth, int nHeight);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hDC, IntPtr hgdiobj);

        [DllImport("gdi32.dll")]
        private static extern bool BitBlt(IntPtr hdcDest, int nXDest, int nYDest, int nWidth, int nHeight, IntPtr hdcSrc, int nXSrc, int nYSrc, uint dwRop);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hDC);

        [DllImport("user32.dll")]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        // Windows API for DLL search path
        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool SetDllDirectory(string lpPathName);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int SetSearchPathMode(int Flags);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern bool SetDefaultDllDirectories(int DirectoryFlags);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr LoadLibrary(string lpFileName);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool FreeLibrary(IntPtr hModule);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint GetLastError();

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool OpenProcessToken(IntPtr ProcessHandle, uint DesiredAccess, out IntPtr TokenHandle);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool LookupPrivilegeValue(string lpSystemName, string lpName, out LUID lpLuid);

        [DllImport("advapi32.dll", SetLastError = true)]
        private static extern bool AdjustTokenPrivileges(IntPtr TokenHandle, bool DisableAllPrivileges, ref TOKEN_PRIVILEGES NewState, uint BufferLength, IntPtr PreviousState, IntPtr ReturnLength);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern IntPtr GetCurrentProcess();

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        [DllImport("shell32.dll", SetLastError = true)]
        private static extern IntPtr ShellExecute(IntPtr hwnd, string lpOperation, string lpFile, string lpParameters, string lpDirectory, int nShowCmd);



        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct LUID
        {
            public uint LowPart;
            public int HighPart;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct TOKEN_PRIVILEGES
        {
            public uint PrivilegeCount;
            public LUID_AND_ATTRIBUTES Privileges;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct LUID_AND_ATTRIBUTES
        {
            public LUID Luid;
            public uint Attributes;
        }

        private const uint SRCCOPY = 0x00CC0020;
        private const int SW_RESTORE = 9;
        private const uint TOKEN_ADJUST_PRIVILEGES = 0x0020;
        private const uint SE_PRIVILEGE_ENABLED = 0x00000002;
        private const string SE_TAKE_OWNERSHIP_NAME = "SeTakeOwnershipPrivilege";
        private const int SW_HIDE = 0;
        private const int SW_SHOW = 5;

        private TesseractEngine _tesseractEngine;
        private bool _engineInitialized = false;

        public OcrPlugin()
        {
            LogToFile("[LOG] OcrPlugin DLL version: 2024-07-04-unique-test");
            InitializeTesseract();
        }

        private void LogToFile(string message)
        {
            try
            {
                // Try multiple possible log locations
                string[] possibleLogPaths = {
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ocr_plugin.log"),
                    Path.Combine(Directory.GetCurrentDirectory(), "ocr_plugin.log"),
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Overwolf", "Log", "Apps", "AAAFinalsApp", "ocr_plugin.log"),
                    "ocr_plugin.log"
                };

                string logPath = null;
                foreach (string path in possibleLogPaths)
                {
                    try
                    {
                        string dir = Path.GetDirectoryName(path);
                        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
                        {
                            Directory.CreateDirectory(dir);
                        }
                        
                        // Test if we can write to this location
                        File.AppendAllText(path, "");
                        logPath = path;
                        break;
                    }
                    catch { }
                }

                if (logPath != null)
                {
                    File.AppendAllText(logPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + "\n");
                }
            }
            catch { }
        }

        private bool IsRunningAsAdministrator()
        {
            try
            {
                WindowsIdentity identity = WindowsIdentity.GetCurrent();
                WindowsPrincipal principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch (Exception ex)
            {
                LogToFile($"[LOG] Error checking admin status: {ex.Message}");
                return false;
            }
        }

        private bool PromptForAdminPrivileges()
        {
            try
            {
                LogToFile("[LOG] Prompting for admin privileges...");
                
                // Check if already running as admin
                if (IsRunningAsAdministrator())
                {
                    LogToFile("[LOG] Already running as administrator");
                    return true;
                }

                // Get the current process path
                string currentProcessPath = Process.GetCurrentProcess().MainModule.FileName;
                LogToFile($"[LOG] Current process path: {currentProcessPath}");

                // Create a temporary batch file to restart with admin privileges
                string tempBatchPath = Path.Combine(Path.GetTempPath(), "ocr_admin_prompt.bat");
                string batchContent = $@"@echo off
echo Requesting administrator privileges for OCR plugin...
echo This is needed to copy DLL files to the Overwolf directory.
echo.
pause
start "" "" ""{currentProcessPath}""
exit";

                File.WriteAllText(tempBatchPath, batchContent);
                LogToFile($"[LOG] Created admin prompt batch file: {tempBatchPath}");

                // Execute the batch file with "runas" to prompt for admin
                IntPtr result = ShellExecute(IntPtr.Zero, "runas", tempBatchPath, "", "", SW_SHOW);
                LogToFile($"[LOG] ShellExecute result: {result}");

                // Clean up the batch file
                try
                {
                    File.Delete(tempBatchPath);
                    LogToFile("[LOG] Cleaned up batch file");
                }
                catch (Exception ex)
                {
                    LogToFile($"[LOG] Could not clean up batch file: {ex.Message}");
                }

                return result.ToInt64() > 32; // Success if result > 32
            }
            catch (Exception ex)
            {
                LogToFile($"[LOG] Error prompting for admin privileges: {ex.Message}");
                return false;
            }
        }

        private bool TryEnableTakeOwnershipPrivilege()
        {
            try
            {
                LogToFile("[LOG] Attempting to enable SeTakeOwnershipPrivilege...");
                
                IntPtr processHandle = GetCurrentProcess();
                IntPtr tokenHandle;
                
                if (OpenProcessToken(processHandle, TOKEN_ADJUST_PRIVILEGES, out tokenHandle))
                {
                    LUID luid;
                    if (LookupPrivilegeValue(null, SE_TAKE_OWNERSHIP_NAME, out luid))
                    {
                        TOKEN_PRIVILEGES tokenPrivileges = new TOKEN_PRIVILEGES
                        {
                            PrivilegeCount = 1,
                            Privileges = new LUID_AND_ATTRIBUTES
                            {
                                Luid = luid,
                                Attributes = SE_PRIVILEGE_ENABLED
                            }
                        };

                        if (AdjustTokenPrivileges(tokenHandle, false, ref tokenPrivileges, 0, IntPtr.Zero, IntPtr.Zero))
                        {
                            LogToFile("[LOG] Successfully enabled SeTakeOwnershipPrivilege");
                            CloseHandle(tokenHandle);
                            return true;
                        }
                        else
                        {
                            uint error = GetLastError();
                            LogToFile($"[LOG] Failed to adjust token privileges, Error: {error}");
                        }
                    }
                    else
                    {
                        uint error = GetLastError();
                        LogToFile($"[LOG] Failed to lookup privilege value, Error: {error}");
                    }
                    CloseHandle(tokenHandle);
                }
                else
                {
                    uint error = GetLastError();
                    LogToFile($"[LOG] Failed to open process token, Error: {error}");
                }
                
                return false;
            }
            catch (Exception ex)
            {
                LogToFile($"[LOG] Error enabling take ownership privilege: {ex.Message}");
                return false;
            }
        }

        private bool CopyDllsToOverwolfDirectory(string sourceDir, string targetDir, string[] dllNames)
        {
            try
            {
                LogToFile($"[LOG] === Copying DLLs to Overwolf directory ===");
                LogToFile($"[LOG] Source directory: {sourceDir}");
                LogToFile($"[LOG] Target directory: {targetDir}");
                
                // Check if target directory exists
                if (!Directory.Exists(targetDir))
                {
                    LogToFile($"[LOG] Target directory does not exist: {targetDir}");
                    return false;
                }

                // Check if we have write access
                try
                {
                    string testFile = Path.Combine(targetDir, "test_write_access.tmp");
                    File.WriteAllText(testFile, "test");
                    File.Delete(testFile);
                    LogToFile("[LOG] Have write access to target directory");
                }
                catch (Exception ex)
                {
                    LogToFile($"[LOG] No write access to target directory: {ex.Message}");
                    LogToFile("[LOG] Will attempt to prompt for admin privileges...");
                    
                    // Try to enable take ownership privilege
                    if (!TryEnableTakeOwnershipPrivilege())
                    {
                        LogToFile("[LOG] Could not enable take ownership privilege");
                        return false;
                    }
                }

                bool allCopied = true;
                foreach (var dllName in dllNames)
                {
                    string sourcePath = Path.Combine(sourceDir, dllName);
                    string targetPath = Path.Combine(targetDir, dllName);
                    
                    if (File.Exists(sourcePath))
                    {
                        try
                        {
                            // Check if target file exists and is different
                            bool needsCopy = true;
                            if (File.Exists(targetPath))
                            {
                                var sourceInfo = new FileInfo(sourcePath);
                                var targetInfo = new FileInfo(targetPath);
                                
                                if (sourceInfo.Length == targetInfo.Length && 
                                    sourceInfo.LastWriteTime == targetInfo.LastWriteTime)
                                {
                                    LogToFile($"[LOG] {dllName} already exists and is identical, skipping");
                                    needsCopy = false;
                                }
                                else
                                {
                                    LogToFile($"[LOG] {dllName} exists but is different, will overwrite");
                                    try
                                    {
                                        File.Delete(targetPath);
                                        LogToFile($"[LOG] Deleted existing {dllName}");
                                    }
                                    catch (Exception ex)
                                    {
                                        LogToFile($"[LOG] Could not delete existing {dllName}: {ex.Message}");
                                    }
                                }
                            }
                            
                            if (needsCopy)
                            {
                                File.Copy(sourcePath, targetPath, true);
                                LogToFile($"[LOG] Successfully copied {dllName} to Overwolf directory");
                            }
                        }
                        catch (Exception ex)
                        {
                            LogToFile($"[LOG] Failed to copy {dllName} to Overwolf directory: {ex.Message}");
                            allCopied = false;
                        }
                    }
                    else
                    {
                        LogToFile($"[LOG] Source DLL not found: {sourcePath}");
                        allCopied = false;
                    }
                }
                
                return allCopied;
            }
            catch (Exception ex)
            {
                LogToFile($"[LOG] Error in CopyDllsToOverwolfDirectory: {ex.Message}");
                return false;
            }
        }



        private void InitializeTesseract()
        {
            try
            {
                LogToFile($"[LOG] Is64BitProcess: {Environment.Is64BitProcess}");
                LogToFile("=== Starting Tesseract Initialization ===");
                string appDirectory = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
                LogToFile($"[LOG] Using appDirectory: {appDirectory}");
                LogToFile($"[LOG] AppDomain.CurrentDomain.BaseDirectory: {AppDomain.CurrentDomain.BaseDirectory}");
                LogToFile($"[LOG] Directory.GetCurrentDirectory(): {Directory.GetCurrentDirectory()}");

                // Set Environment.CurrentDirectory to appDirectory for Overwolf
                Environment.CurrentDirectory = appDirectory;
                LogToFile($"[LOG] Environment.CurrentDirectory set to: {Environment.CurrentDirectory}");

                // Enhanced DLL loading strategy
                LogToFile("=== Enhanced DLL Loading Strategy ===");
                
                // 1. Set DLL directory to our app directory
                bool dllDirSet = SetDllDirectory(appDirectory);
                LogToFile($"[LOG] SetDllDirectory({appDirectory}) result: {dllDirSet}");
                
                // 2. Set current directory
                string originalDir = Directory.GetCurrentDirectory();
                Directory.SetCurrentDirectory(appDirectory);
                LogToFile($"[LOG] Changed current directory from {originalDir} to {appDirectory}");
                
                // 3. Copy critical DLLs to Overwolf directory with admin privileges
                LogToFile("=== Strategy 0: Copy DLLs to Overwolf directory with elevated privileges ===");
                string overwolfDir = AppDomain.CurrentDomain.BaseDirectory;
                
                // Check if critical DLLs are already in Overwolf directory
                string[] criticalDlls = {
                    "leptonica-1.82.0.dll",
                    "tesseract50.dll"
                };
                
                bool dllsAlreadyPresent = true;
                foreach (var dllName in criticalDlls)
                {
                    string overwolfDllPath = Path.Combine(overwolfDir, dllName);
                    if (!File.Exists(overwolfDllPath))
                    {
                        LogToFile($"[LOG] Critical DLL missing from Overwolf directory: {dllName}");
                        dllsAlreadyPresent = false;
                    }
                    else
                    {
                        LogToFile($"[LOG] Critical DLL already present: {dllName}");
                    }
                }
                
                if (!dllsAlreadyPresent)
                {
                    LogToFile("[LOG] Attempting to copy DLLs with elevated privileges...");
                    bool dllsCopied = CopyDllsToOverwolfDirectory(appDirectory, overwolfDir, criticalDlls);
                    if (dllsCopied)
                    {
                        LogToFile("[LOG] Successfully copied all critical DLLs to Overwolf directory");
                    }
                    else
                    {
                        LogToFile("[LOG] Failed to copy some critical DLLs - will try alternative strategies");
                    }
                }
                else
                {
                    LogToFile("[LOG] All critical DLLs are already present in Overwolf directory");
                }
                
                // 4. Preload all required DLLs manually (as backup)
                LogToFile("=== Multiple DLL Loading Strategies ===");
                string[] dllsToLoad = {
                    "leptonica-1.82.0.dll",
                    "tesseract50.dll",
                    "Tesseract.dll"
                };
                
                bool dllsLoaded = false;
                foreach (var dllName in dllsToLoad)
                {
                    string dllPath = Path.Combine(appDirectory, dllName);
                    if (File.Exists(dllPath))
                    {
                        var fileInfo = new FileInfo(dllPath);
                        LogToFile($"[LOG] Attempting to load DLL: {dllName} (size: {fileInfo.Length} bytes)");
                        
                        IntPtr dllHandle = LoadLibrary(dllPath);
                        if (dllHandle != IntPtr.Zero)
                        {
                            LogToFile($"[LOG] Successfully loaded DLL: {dllName}");
                            dllsLoaded = true;
                        }
                        else
                        {
                            uint error = GetLastError();
                            LogToFile($"[LOG] Failed to load DLL: {dllName}, Error: {error}");
                        }
                    }
                    else
                    {
                        LogToFile($"[LOG] DLL file not found: {dllPath}");
                    }
                }

                // Strategy 2: Try loading DLLs by name only (let Windows search)
                LogToFile("=== Strategy 2: Loading DLLs by name only ===");
                foreach (var dllName in dllsToLoad)
                {
                    LogToFile($"[LOG] Attempting to load DLL by name: {dllName}");
                    IntPtr dllHandle = LoadLibrary(dllName);
                    if (dllHandle != IntPtr.Zero)
                    {
                        LogToFile($"[LOG] Successfully loaded DLL by name: {dllName}");
                    }
                    else
                    {
                        uint error = GetLastError();
                        LogToFile($"[LOG] Failed to load DLL by name: {dllName}, Error: {error}");
                    }
                }

                // Strategy 3: Try loading common dependencies that might be missing
                LogToFile("=== Strategy 3: Loading common dependencies ===");
                string[] commonDeps = {
                    "msvcp140.dll",
                    "vcruntime140.dll",
                    "vcruntime140_1.dll"
                };
                
                foreach (var depName in commonDeps)
                {
                    IntPtr depHandle = LoadLibrary(depName);
                    if (depHandle != IntPtr.Zero)
                    {
                        LogToFile($"[LOG] Successfully loaded dependency: {depName}");
                    }
                    else
                    {
                        uint error = GetLastError();
                        LogToFile($"[LOG] Failed to load dependency: {depName}, Error: {error}");
                    }
                }
                
                // NEW: Strategy 4: Intercept Tesseract.NET's internal library loader
                LogToFile("=== Strategy 4: Intercepting Tesseract.NET Library Loader ===");
                bool interceptorSuccess = InterceptTesseractLibraryLoader(appDirectory);
                LogToFile($"[LOG] Library loader interception result: {interceptorSuccess}");
                
                // 6. Check tessdata
                string tessdataPath = Path.Combine(appDirectory, "tessdata");
                LogToFile($"Checking tessdata path: {tessdataPath}");
                if (Directory.Exists(tessdataPath))
                {
                    LogToFile($"Found tessdata at: {tessdataPath}");
                    string engDataPath = Path.Combine(tessdataPath, "eng.traineddata");
                    if (File.Exists(engDataPath))
                    {
                        var fileInfo = new FileInfo(engDataPath);
                        LogToFile($"eng.traineddata file size: {fileInfo.Length} bytes");
                    }
                    else
                    {
                        LogToFile($"eng.traineddata not found at: {engDataPath}");
                    }
                }
                else
                {
                    LogToFile($"tessdata directory does not exist: {tessdataPath}");
                }
                
                // 7. Set environment variable for Tesseract
                Environment.SetEnvironmentVariable("TESSDATA_PREFIX", appDirectory);
                LogToFile($"[LOG] Set TESSDATA_PREFIX environment variable to: {appDirectory}");
                
                // 8. Initialize TesseractEngine with multiple fallback strategies
                LogToFile($"Attempting to initialize TesseractEngine with path: {tessdataPath}");
                
                Exception lastException = null;
                
                // Try different initialization approaches
                try
                {
                    _tesseractEngine = new TesseractEngine(tessdataPath, "eng", EngineMode.TesseractAndLstm);
                    LogToFile("TesseractEngine created successfully with TesseractAndLstm mode");
                }
                catch (Exception ex1)
                {
                    lastException = ex1;
                    LogToFile($"Failed with TesseractAndLstm mode: {ex1.Message}");
                    try
                    {
                        _tesseractEngine = new TesseractEngine(tessdataPath, "eng", EngineMode.Default);
                        LogToFile("TesseractEngine created successfully with Default mode");
                    }
                    catch (Exception ex2)
                    {
                        lastException = ex2;
                        LogToFile($"Failed with Default mode: {ex2.Message}");
                        try
                        {
                            // Try with just the app directory as tessdata path
                            _tesseractEngine = new TesseractEngine(appDirectory, "eng", EngineMode.Default);
                            LogToFile("TesseractEngine created successfully with app directory as tessdata path");
                        }
                        catch (Exception ex3)
                        {
                            lastException = ex3;
                            LogToFile($"Failed with app directory as tessdata path: {ex3.Message}");
                            throw; // Re-throw the last exception
                        }
                    }
                }
                
                // Set Tesseract variables for better text recognition
                _tesseractEngine.SetVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.");
                
                LogToFile("TesseractEngine variables set successfully");
                LogToFile("=== Tesseract engine initialized successfully ===");
                _engineInitialized = true;
                
                // Restore original directory
                Directory.SetCurrentDirectory(originalDir);
            }
            catch (Exception ex)
            {
                LogToFile("=== Failed to initialize Tesseract ===");
                LogToFile($"Exception type: {ex.GetType().Name}");
                LogToFile($"Exception message: {ex.Message}");
                LogToFile($"Exception stack trace: {ex.StackTrace}");
                if (ex.InnerException != null)
                {
                    LogToFile($"Inner exception: {ex.InnerException.Message}");
                    LogToFile($"Inner exception stack trace: {ex.InnerException.StackTrace}");
                }
                _engineInitialized = false;
            }
        }

        private bool InterceptTesseractLibraryLoader(string appDirectory)
        {
            try
            {
                LogToFile("[LOG] Attempting to intercept Tesseract.NET library loader...");
                
                // Get the Tesseract assembly
                Assembly tesseractAssembly = typeof(TesseractEngine).Assembly;
                LogToFile($"[LOG] Tesseract assembly: {tesseractAssembly.FullName}");
                
                // Try to find the InteropDotNet types
                Type libraryLoaderType = tesseractAssembly.GetType("InteropDotNet.LibraryLoader");
                if (libraryLoaderType == null)
                {
                    LogToFile("[LOG] Could not find InteropDotNet.LibraryLoader type");
                    return false;
                }
                
                LogToFile("[LOG] Found InteropDotNet.LibraryLoader type");
                
                // Try to find the InteropRuntimeImplementer type
                Type interopRuntimeType = tesseractAssembly.GetType("InteropDotNet.InteropRuntimeImplementer");
                if (interopRuntimeType == null)
                {
                    LogToFile("[LOG] Could not find InteropDotNet.InteropRuntimeImplementer type");
                    return false;
                }
                
                LogToFile("[LOG] Found InteropDotNet.InteropRuntimeImplementer type");
                
                // Try to access the static instance or create a new one
                PropertyInfo instanceProperty = interopRuntimeType.GetProperty("Instance", BindingFlags.Public | BindingFlags.Static);
                if (instanceProperty != null)
                {
                    LogToFile("[LOG] Found Instance property on InteropRuntimeImplementer");
                    object instance = instanceProperty.GetValue(null);
                    if (instance != null)
                    {
                        LogToFile("[LOG] Successfully got InteropRuntimeImplementer instance");
                        
                        // Try to find and modify the library loader
                        PropertyInfo loaderProperty = interopRuntimeType.GetProperty("LibraryLoader", BindingFlags.Public | BindingFlags.Instance);
                        if (loaderProperty != null)
                        {
                            LogToFile("[LOG] Found LibraryLoader property");
                            object loader = loaderProperty.GetValue(instance);
                            if (loader != null)
                            {
                                LogToFile("[LOG] Successfully got LibraryLoader instance");
                                
                                // Try to modify the search paths
                                MethodInfo addSearchPathMethod = libraryLoaderType.GetMethod("AddSearchPath", BindingFlags.Public | BindingFlags.Instance);
                                if (addSearchPathMethod != null)
                                {
                                    LogToFile($"[LOG] Adding search path: {appDirectory}");
                                    addSearchPathMethod.Invoke(loader, new object[] { appDirectory });
                                    LogToFile("[LOG] Successfully added search path to library loader");
                                    return true;
                                }
                                else
                                {
                                    LogToFile("[LOG] Could not find AddSearchPath method");
                                }
                            }
                        }
                        else
                        {
                            LogToFile("[LOG] Could not find LibraryLoader property");
                        }
                    }
                }
                else
                {
                    LogToFile("[LOG] Could not find Instance property");
                }
                
                // Alternative approach: Try to create a custom library loader
                LogToFile("[LOG] Attempting alternative approach: Create custom library loader");
                try
                {
                    // Try to find the constructor
                    ConstructorInfo constructor = libraryLoaderType.GetConstructor(BindingFlags.Public | BindingFlags.Instance, null, Type.EmptyTypes, null);
                    if (constructor != null)
                    {
                        LogToFile("[LOG] Found LibraryLoader constructor");
                        object customLoader = constructor.Invoke(null);
                        LogToFile("[LOG] Created custom LibraryLoader instance");
                        
                        // Try to set it as the default loader
                        MethodInfo setDefaultMethod = interopRuntimeType.GetMethod("SetDefaultLibraryLoader", BindingFlags.Public | BindingFlags.Static);
                        if (setDefaultMethod != null)
                        {
                            LogToFile("[LOG] Found SetDefaultLibraryLoader method");
                            setDefaultMethod.Invoke(null, new object[] { customLoader });
                            LogToFile("[LOG] Successfully set custom library loader as default");
                            return true;
                        }
                        else
                        {
                            LogToFile("[LOG] Could not find SetDefaultLibraryLoader method");
                        }
                    }
                }
                catch (Exception ex)
                {
                    LogToFile($"[LOG] Error creating custom library loader: {ex.Message}");
                }
                
                LogToFile("[LOG] Could not intercept library loader - will continue with standard approach");
                return false;
            }
            catch (Exception ex)
            {
                LogToFile($"[LOG] Error intercepting library loader: {ex.Message}");
                LogToFile($"[LOG] Stack trace: {ex.StackTrace}");
                return false;
            }
        }

        public void Test(Action<object> callback)
        {
            try
            {
                LogToFile("=== Plugin Test Called ===");
                LogToFile($"Engine initialized: {_engineInitialized}");
                
                if (_engineInitialized)
                {
                    callback(new { 
                        success = true, 
                        message = "Plugin Test OK", 
                        engineInitialized = _engineInitialized 
                    });
                }
                else
                {
                    // Try to get the last error from the log file
                    string errorDetails = "Engine not initialized - check ocr_plugin.log for details";
                    try
                    {
                        string[] possibleLogPaths = {
                            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ocr_plugin.log"),
                            Path.Combine(Directory.GetCurrentDirectory(), "ocr_plugin.log"),
                            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Overwolf", "Log", "Apps", "AAAFinalsApp", "ocr_plugin.log"),
                            "ocr_plugin.log"
                        };

                        foreach (string logPath in possibleLogPaths)
                        {
                            if (File.Exists(logPath))
                            {
                                string[] lines = File.ReadAllLines(logPath);
                                if (lines.Length > 0)
                                {
                                    // Get last 5 lines or all lines if less than 5
                                    int startIndex = Math.Max(0, lines.Length - 5);
                                    errorDetails = string.Join(" | ", lines, startIndex, lines.Length - startIndex);
                                }
                                break;
                            }
                        }
                    }
                    catch { }

                    callback(new { 
                        success = true, 
                        message = "Plugin Test OK", 
                        engineInitialized = _engineInitialized,
                        errorDetails = errorDetails
                    });
                }
            }
            catch (Exception ex)
            {
                LogToFile($"Test method error: {ex.Message}");
                callback(new { 
                    success = false, 
                    message = "Plugin Test Failed", 
                    engineInitialized = false,
                    error = ex.Message 
                });
            }
        }

        public void RequestAdminPrivileges(Action<object> callback)
        {
            try
            {
                LogToFile("=== Requesting Admin Privileges ===");
                
                if (IsRunningAsAdministrator())
                {
                    LogToFile("[LOG] Already running as administrator");
                    callback(new { 
                        success = true, 
                        message = "Already running as administrator",
                        isAdmin = true
                    });
                    return;
                }

                bool success = PromptForAdminPrivileges();
                callback(new { 
                    success = success, 
                    message = success ? "Admin privileges requested successfully" : "Failed to request admin privileges",
                    isAdmin = IsRunningAsAdministrator()
                });
            }
            catch (Exception ex)
            {
                LogToFile($"RequestAdminPrivileges error: {ex.Message}");
                callback(new { 
                    success = false, 
                    message = "Error requesting admin privileges",
                    error = ex.Message 
                });
            }
        }

        public void TakeScreenshot(Action<object> callback)
        {
            try
            {
                var screenshot = CaptureScreen();
                if (screenshot != null)
                {
                    // Use user's Documents folder instead of Overwolf directory
                    string screenshotsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "AAAFinalsApp", "screenshots");
                    Directory.CreateDirectory(screenshotsDir);
                    string tempPath = Path.Combine(screenshotsDir, $"screenshot_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                    screenshot.Save(tempPath, System.Drawing.Imaging.ImageFormat.Png);
                    screenshot.Dispose();

                    callback(new { 
                        success = true, 
                        path = tempPath,
                        message = "Screenshot captured successfully"
                    });
                }
                else
                {
                    callback(new { success = false, error = "Failed to capture screenshot" });
                }
            }
            catch (Exception ex)
            {
                LogToFile($"TakeScreenshot error: {ex.Message}");
                callback(new { success = false, error = ex.Message });
            }
        }

        public void TakeGameScreenshot(Action<object> callback)
        {
            try
            {
                // Try multiple possible window titles for THE FINALS
                string[] windowTitles = {
                    "THE FINALS",
                    "THE FINALS - Embark Studios",
                    "THE FINALS.exe",
                    "THE FINALS (64-bit, DX12)",
                    "THE FINALS (64-bit, DX11)"
                };

                IntPtr gameWindow = IntPtr.Zero;
                foreach (string title in windowTitles)
                {
                    gameWindow = FindWindow(null, title);
                    if (gameWindow != IntPtr.Zero)
                    {
                        Console.WriteLine($"Found THE FINALS window: {title}");
                        break;
                    }
                }

                if (gameWindow != IntPtr.Zero)
                {
                    var screenshot = CaptureWindow(gameWindow);
                    if (screenshot != null)
                    {
                        // Use user's Documents folder instead of Overwolf directory
                        string screenshotsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "AAAFinalsApp", "screenshots");
                        Directory.CreateDirectory(screenshotsDir);
                        string tempPath = Path.Combine(screenshotsDir, $"game_screenshot_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                        screenshot.Save(tempPath, System.Drawing.Imaging.ImageFormat.Png);
                        screenshot.Dispose();

                        callback(new { 
                            success = true, 
                            path = tempPath,
                            message = "Game screenshot captured successfully"
                        });
                    }
                    else
                    {
                        callback(new { success = false, error = "Failed to capture game window" });
                    }
                }
                else
                {
                    callback(new { success = false, error = "THE FINALS window not found" });
                }
            }
            catch (Exception ex)
            {
                callback(new { success = false, error = ex.Message });
            }
        }

        public void PerformOCR(string imagePath, int x, int y, int width, int height, Action<object> callback)
        {
            try
            {
                if (!_engineInitialized)
                {
                    callback(new { success = false, error = "Tesseract engine not initialized" });
                    return;
                }

                using (var image = new Bitmap(imagePath))
                {
                    // Crop the image to the specified region
                    var croppedImage = CropImage(image, x, y, width, height);
                    
                    // Convert to Pix for Tesseract
                    using (var pix = PixConverter.ToPix(croppedImage))
                    using (var page = _tesseractEngine.Process(pix))
                    {
                        string text = page.GetText().Trim();
                        callback(new { 
                            success = true, 
                            text = text,
                            confidence = page.GetMeanConfidence(),
                            message = "OCR completed successfully"
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                callback(new { success = false, error = ex.Message });
            }
        }

        public void PerformFullOCR(string imagePath, Action<object> callback)
        {
            try
            {
                if (!_engineInitialized)
                {
                    callback(new { success = false, error = "Tesseract engine not initialized" });
                    return;
                }

                using (var image = new Bitmap(imagePath))
                using (var pix = PixConverter.ToPix(image))
                using (var page = _tesseractEngine.Process(pix))
                {
                    string text = page.GetText().Trim();
                    callback(new { 
                        success = true, 
                        text = text,
                        confidence = page.GetMeanConfidence(),
                        message = "Full OCR completed successfully"
                    });
                }
            }
            catch (Exception ex)
            {
                callback(new { success = false, error = ex.Message });
            }
        }

        public void ScanUsernameRegions(string imagePath, Action<object> callback)
        {
            try
            {
                if (!_engineInitialized)
                {
                    callback(new { success = false, error = "Tesseract engine not initialized" });
                    return;
                }

                // Define scan regions (same as in JavaScript)
                var scanRegions = new[]
                {
                    new { x = 765, y = 285, width = 478, height = 34 },
                    new { x = 783, y = 161, width = 474, height = 31 },
                    new { x = 791, y = 68, width = 384, height = 33 }
                };

                var results = new System.Collections.Generic.List<object>();

                using (var image = new Bitmap(imagePath))
                {
                    for (int i = 0; i < scanRegions.Length; i++)
                    {
                        var region = scanRegions[i];
                        var croppedImage = CropImage(image, region.x, region.y, region.width, region.height);
                        
                        using (var pix = PixConverter.ToPix(croppedImage))
                        using (var page = _tesseractEngine.Process(pix))
                        {
                            string text = page.GetText().Trim();
                            if (!string.IsNullOrEmpty(text))
                            {
                                results.Add(new
                                {
                                    boxIndex = i,
                                    text = text,
                                    confidence = page.GetMeanConfidence(),
                                    region = region
                                });
                            }
                        }
                    }
                }

                callback(new { 
                    success = true, 
                    results = results.ToArray(),
                    message = $"Scanned {scanRegions.Length} regions, found {results.Count} results"
                });
            }
            catch (Exception ex)
            {
                callback(new { success = false, error = ex.Message });
            }
        }

        private Bitmap CaptureScreen()
        {
            var screen = Screen.PrimaryScreen.Bounds;
            var bitmap = new Bitmap(screen.Width, screen.Height);
            
            using (var graphics = Graphics.FromImage(bitmap))
            {
                graphics.CopyFromScreen(screen.X, screen.Y, 0, 0, screen.Size);
            }
            
            return bitmap;
        }

        private Bitmap CaptureWindow(IntPtr handle)
        {
            RECT rect = new RECT();
            GetWindowRect(handle, ref rect);

            int width = rect.Right - rect.Left;
            int height = rect.Bottom - rect.Top;

            var bitmap = new Bitmap(width, height);
            using (var graphics = Graphics.FromImage(bitmap))
            {
                IntPtr hdcScreen = GetDC(IntPtr.Zero);
                IntPtr hdcMemory = CreateCompatibleDC(hdcScreen);
                IntPtr hBitmap = CreateCompatibleBitmap(hdcScreen, width, height);
                IntPtr hOldBitmap = SelectObject(hdcMemory, hBitmap);

                BitBlt(hdcMemory, 0, 0, width, height, hdcScreen, rect.Left, rect.Top, SRCCOPY);

                graphics.DrawImage(bitmap, 0, 0);

                SelectObject(hdcMemory, hOldBitmap);
                DeleteObject(hBitmap);
                DeleteDC(hdcMemory);
                ReleaseDC(IntPtr.Zero, hdcScreen);
            }

            return bitmap;
        }

        private Bitmap CropImage(Image source, int x, int y, int width, int height)
        {
            var cropRect = new Rectangle(x, y, width, height);
            var croppedImage = new Bitmap(cropRect.Width, cropRect.Height);
            
            using (var graphics = Graphics.FromImage(croppedImage))
            {
                graphics.DrawImage(source, new Rectangle(0, 0, cropRect.Width, cropRect.Height), cropRect, GraphicsUnit.Pixel);
            }
            
            return croppedImage;
        }

        public void GetGameWindowInfo(Action<object> callback)
        {
            try
            {
                var gameWindows = new[]
                {
                    "THE FINALS",
                    "THE FINALS - Embark Studios",
                    "THE FINALS.exe"
                };

                var results = new System.Collections.Generic.List<object>();

                foreach (var windowTitle in gameWindows)
                {
                    IntPtr handle = FindWindow(null, windowTitle);
                    if (handle != IntPtr.Zero)
                    {
                        RECT rect = new RECT();
                        GetWindowRect(handle, ref rect);
                        
                        results.Add(new
                        {
                            title = windowTitle,
                            handle = handle.ToInt64(),
                            rect = new { left = rect.Left, top = rect.Top, right = rect.Right, bottom = rect.Bottom },
                            width = rect.Right - rect.Left,
                            height = rect.Bottom - rect.Top
                        });
                    }
                }

                callback(new { success = true, windows = results.ToArray() });
            }
            catch (Exception ex)
            {
                callback(new { success = false, error = ex.Message });
            }
        }

        public void TakeScreenshotByHandle(long windowHandle, Action<object> callback)
        {
            try
            {
                IntPtr handle = new IntPtr(windowHandle);
                LogToFile($"TakeScreenshotByHandle called with handle: {windowHandle}");
                var screenshot = CaptureWindow(handle);
                if (screenshot != null)
                {
                    // Use user's Documents folder instead of Overwolf directory
                    string screenshotsDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "AAAFinalsApp", "screenshots");
                    Directory.CreateDirectory(screenshotsDir);
                    string tempPath = Path.Combine(screenshotsDir, $"handle_screenshot_{DateTime.Now:yyyyMMdd_HHmmss}.png");
                    screenshot.Save(tempPath, System.Drawing.Imaging.ImageFormat.Png);
                    screenshot.Dispose();

                    callback(new {
                        success = true,
                        path = tempPath,
                        message = "Screenshot by handle captured successfully"
                    });
                }
                else
                {
                    callback(new { success = false, error = "Failed to capture window by handle" });
                }
            }
            catch (Exception ex)
            {
                LogToFile($"TakeScreenshotByHandle error: {ex.Message}");
                callback(new { success = false, error = ex.Message });
            }
        }
    }
}
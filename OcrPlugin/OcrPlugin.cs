using System;
using System.IO;

namespace overwolf.plugins
{
    public class OcrPlugin
    {
        public OcrPlugin()
        {
            // This will create a file in your app root if the plugin loads
            File.WriteAllText("plugin_test.log", $"Plugin loaded at {DateTime.Now}");
        }

        public void Test(Action<object> callback)
        {
            callback("Plugin Test OK");
        }
    }
}
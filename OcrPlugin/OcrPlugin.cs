using System;

namespace overwolf.plugins
{
    public class OcrPlugin
    {
        public OcrPlugin()
        {
            // Empty constructor
        }

        public void Test(Action<object> callback)
        {
            callback("Plugin Test OK");
        }
    }
}
using System;
using System.Collections.Generic;
using System.Linq;
// Apache-2.0 license

namespace RapidOcrNet
{
    public sealed class RapidOcrOptions
    {
        public static readonly RapidOcrOptions Default = new RapidOcrOptions()
        {
            Padding = 50,
            ImgResize = 1024,
            BoxScoreThresh = 0.5f,
            BoxThresh = 0.3f,
            UnClipRatio = 1.6f,
            DoAngle = true,
            MostAngle = false
        };

        public int Padding { get; set; }
        public int ImgResize { get; set; }
        public float BoxScoreThresh { get; set; }
        public float BoxThresh { get; set; }
        public float UnClipRatio { get; set; }
        public bool DoAngle { get; set; }
        public bool MostAngle { get; set; }
    }
}

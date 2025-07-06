// Apache-2.0 license
// Adapted from RapidAI / RapidOCR
// https://github.com/RapidAI/RapidOCR/blob/92aec2c1234597fa9c3c270efd2600c83feecd8d/dotnet/RapidOcrOnnxCs/OcrLib/ScaleParam.cs

using System;
using System.Collections.Generic;
using System.Linq;
using SkiaSharp;

namespace RapidOcrNet
{
    public sealed class ScaleParam
    {
        public int SrcWidth { get; private set; }

        public int SrcHeight { get; private set; }

        public int DstWidth { get; private set; }

        public int DstHeight { get; private set; }

        public float ScaleWidth { get; private set; }

        public float ScaleHeight { get; private set; }

        public ScaleParam(int srcWidth, int srcHeight, int dstWidth, int dstHeight)
        {
            SrcWidth = srcWidth;
            SrcHeight = srcHeight;
            DstWidth = dstWidth;
            DstHeight = dstHeight;
            ScaleWidth = dstWidth / (float)srcWidth;
            ScaleHeight = dstHeight / (float)srcHeight;
        }

        public override string ToString()
        {
            return $"sw:{SrcWidth},sh:{SrcHeight},dw:{DstWidth},dh:{DstHeight},{ScaleWidth},{ScaleHeight}";
        }

        public static ScaleParam GetScaleParam(SKBitmap src, int dstSize)
        {
            int srcWidth = src.Width;
            int dstWidth = src.Width;
            int srcHeight = src.Height;
            int dstHeight = src.Height;

            if (dstWidth > dstHeight)
            {
                float scale = dstSize / (float)dstWidth;
                dstWidth = dstSize;
                dstHeight = (int)(dstHeight * scale);
            }
            else
            {
                float scale = dstSize / (float)dstHeight;
                dstHeight = dstSize;
                dstWidth = (int)(dstWidth * scale);
            }

            if (dstWidth % 32 != 0)
            {
                dstWidth = (dstWidth / 32 - 1) * 32;
                dstWidth = Math.Max(dstWidth, 32);
            }

            if (dstHeight % 32 != 0)
            {
                dstHeight = (dstHeight / 32 - 1) * 32;
                dstHeight = Math.Max(dstHeight, 32);
            }

            return new ScaleParam(srcWidth, srcHeight, dstWidth, dstHeight);
        }
    }
}
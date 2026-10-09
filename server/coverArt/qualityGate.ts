/**
 * server/coverArt/qualityGate.ts
 *
 * Plain-language summary:
 * Automated pixel-level quality verification for Cover Art v2.
 * Inspects rendered artwork buffers with `sharp` before typography compositing:
 * - Decodability verification
 * - Minimum resolution check (>= 800x800)
 * - Contrast & non-blank check (not completely black, not completely white, non-zero std-dev)
 * - Flags failure to allow the orchestrator to trigger a single gate retry.
 */

import sharp from 'sharp';

export interface QualityGateResult {
  passed: boolean;
  reason?: string;
  width?: number;
  height?: number;
  meanLuminance?: number;
}

export async function inspectArtworkQuality(imageBuffer: Buffer): Promise<QualityGateResult> {
  if (!imageBuffer || imageBuffer.length < 5000) {
    return { passed: false, reason: 'IMAGE_BUFFER_CORRUPT_OR_TRUNCATED' };
  }

  try {
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    if (width < 800 || height < 800) {
      return {
        passed: false,
        reason: `INSUFFICIENT_RESOLUTION: ${width}x${height} is below 800x800 minimum`,
        width,
        height,
      };
    }

    // Inspect statistics (channels mean and standard deviation)
    const stats = await sharp(imageBuffer).stats();
    const channels = stats.channels;

    if (!channels || channels.length < 3) {
      return { passed: false, reason: 'INVALID_COLOR_CHANNELS', width, height };
    }

    const meanR = channels[0].mean;
    const meanG = channels[1].mean;
    const meanB = channels[2].mean;
    const avgMean = (meanR + meanG + meanB) / 3;

    // Check for solid black canvas
    if (avgMean < 4.0) {
      return {
        passed: false,
        reason: `IMAGE_TOO_DARK_OR_BLANK: mean luminance is ${avgMean.toFixed(1)}`,
        width,
        height,
        meanLuminance: avgMean,
      };
    }

    // Check for blown-out flat white canvas
    if (avgMean > 252.0) {
      return {
        passed: false,
        reason: `IMAGE_BLOWN_OUT_OR_BLANK: mean luminance is ${avgMean.toFixed(1)}`,
        width,
        height,
        meanLuminance: avgMean,
      };
    }

    // Check standard deviation across channels to ensure visual texture and variation
    const stdDevAvg = (channels[0].stdev + channels[1].stdev + channels[2].stdev) / 3;
    if (stdDevAvg < 8.0) {
      return {
        passed: false,
        reason: `IMAGE_LACKS_CONTRAST: standard deviation is ${stdDevAvg.toFixed(1)}`,
        width,
        height,
        meanLuminance: avgMean,
      };
    }

    return {
      passed: true,
      width,
      height,
      meanLuminance: avgMean,
    };
  } catch (err: any) {
    return {
      passed: false,
      reason: `DECODE_EXCEPTION: ${err?.message || 'Sharp could not decode image'}`,
    };
  }
}

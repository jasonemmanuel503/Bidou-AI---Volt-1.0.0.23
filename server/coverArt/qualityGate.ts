/**
 * server/coverArt/qualityGate.ts
 *
 * Plain-language summary:
 * Pixel-level automated quality gate for AI Cover Art v2 (Section 5.4).
 * Uses sharp stats on a 256px downscale of the textless artwork:
 * - Not blank or flat: luminance standard deviation >= 8.0
 * - Not clipped: mean luminance between 10 and 245
 * - Text zone calm enough: extracts the reserved third (top or bottom) and computes variance.
 *   - Moderate variance signals compositor to apply a stronger protective scrim
 *   - Extreme variance (> 95 stdev) fails the quality gate and triggers a single retry.
 */

import sharp from 'sharp';

export interface QualityGateResult {
  passed: boolean;
  reason?: string;
  meanLuminance: number;
  stdevLuminance: number;
  textZoneLuminance: number;
  needsStrongScrim: boolean;
}

export async function inspectArtworkQuality(
  imageBuffer: Buffer,
  textZone: 'bottom' | 'top' = 'bottom'
): Promise<QualityGateResult> {
  if (!imageBuffer || imageBuffer.length < 5000) {
    return {
      passed: false,
      reason: 'IMAGE_BUFFER_EMPTY_OR_TRUNCATED',
      meanLuminance: 0,
      stdevLuminance: 0,
      textZoneLuminance: 0,
      needsStrongScrim: true,
    };
  }

  try {
    // 1. Downscale to 256x256 for fast statistical analysis
    const downscaled = await sharp(imageBuffer)
      .resize(256, 256, { fit: 'cover' })
      .toBuffer();

    const fullStats = await sharp(downscaled).stats();
    const ch = fullStats.channels;
    if (!ch || ch.length < 3) {
      return {
        passed: false,
        reason: 'INVALID_IMAGE_CHANNELS',
        meanLuminance: 0,
        stdevLuminance: 0,
        textZoneLuminance: 0,
        needsStrongScrim: true,
      };
    }

    const meanLuminance = (ch[0].mean + ch[1].mean + ch[2].mean) / 3;
    const stdevLuminance = (ch[0].stdev + ch[1].stdev + ch[2].stdev) / 3;

    // Check not blank or flat
    if (stdevLuminance < 8.0) {
      return {
        passed: false,
        reason: `IMAGE_FLAT_OR_BLANK: standard deviation ${stdevLuminance.toFixed(1)} is below threshold`,
        meanLuminance,
        stdevLuminance,
        textZoneLuminance: meanLuminance,
        needsStrongScrim: true,
      };
    }

    // Check not clipped (black or white out)
    if (meanLuminance < 10.0) {
      return {
        passed: false,
        reason: `IMAGE_CLIPPED_BLACK: mean luminance ${meanLuminance.toFixed(1)} is too dark`,
        meanLuminance,
        stdevLuminance,
        textZoneLuminance: meanLuminance,
        needsStrongScrim: true,
      };
    }

    if (meanLuminance > 245.0) {
      return {
        passed: false,
        reason: `IMAGE_CLIPPED_WHITE: mean luminance ${meanLuminance.toFixed(1)} is blown out`,
        meanLuminance,
        stdevLuminance,
        textZoneLuminance: meanLuminance,
        needsStrongScrim: true,
      };
    }

    // 2. Inspect the reserved text zone third (top: y 0-85, bottom: y 170-256)
    const topOffset = textZone === 'top' ? 0 : 170;
    const zoneHeight = textZone === 'top' ? 85 : 86;

    const zoneCrop = await sharp(downscaled)
      .extract({ left: 0, top: topOffset, width: 256, height: zoneHeight })
      .toBuffer();

    const zoneStats = await sharp(zoneCrop).stats();
    const zch = zoneStats.channels;
    const textZoneLuminance = (zch[0].mean + zch[1].mean + zch[2].mean) / 3;
    const textZoneStdev = (zch[0].stdev + zch[1].stdev + zch[2].stdev) / 3;

    // A busy text zone (> 60 stdev) requests a stronger scrim
    const needsStrongScrim = textZoneStdev > 60.0;

    // Only an extremely cluttered, chaotic text zone fails the gate
    if (textZoneStdev > 98.0) {
      return {
        passed: false,
        reason: `TEXT_ZONE_TOO_CLUTTERED: text zone variance ${textZoneStdev.toFixed(1)} exceeds limit`,
        meanLuminance,
        stdevLuminance,
        textZoneLuminance,
        needsStrongScrim: true,
      };
    }

    return {
      passed: true,
      meanLuminance,
      stdevLuminance,
      textZoneLuminance,
      needsStrongScrim,
    };
  } catch (err: any) {
    return {
      passed: false,
      reason: `QUALITY_GATE_EXCEPTION: ${err?.message || 'Statistical inspection failed'}`,
      meanLuminance: 0,
      stdevLuminance: 0,
      textZoneLuminance: 0,
      needsStrongScrim: true,
    };
  }
}

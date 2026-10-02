import { computeTileSize, Ratio } from '../src/lib/tileLayout';

const RATIO_VALUES: Record<Ratio, number> = {
  '9:16': 9 / 16,
  '1:1': 1,
  '16:9': 16 / 9,
};

const ratios: Ratio[] = ['9:16', '1:1', '16:9'];
let testsRun = 0;

for (let w = 320; w <= 1920; w += 10) {
  for (const ratio of ratios) {
    for (let count = 1; count <= 4; count++) {
      const res = computeTileSize({
        ratio,
        count,
        containerWidth: w,
      });

      testsRun++;

      // 1. Check layout bounds: cols*width + (cols-1)*16 <= width_input - 1
      const totalWidth = res.cols * res.width + (res.cols - 1) * 16;
      if (totalWidth > w - 1) {
        console.error(`FAILED bounds at w=${w}, ratio=${ratio}, count=${count}: totalWidth=${totalWidth} > ${w - 1}`);
        process.exit(1);
      }

      // 2. Aspect ratio accuracy: Math.abs(height - width/ratio) <= 1
      const rNum = RATIO_VALUES[ratio];
      if (Math.abs(res.height - res.width / rNum) > 1) {
        console.error(`FAILED aspect ratio at w=${w}, ratio=${ratio}, count=${count}: height=${res.height}, width=${res.width}`);
        process.exit(1);
      }

      // 3. Count 4 never has 3 columns: count === 4 => cols !== 3
      if (count === 4 && res.cols === 3) {
        console.error(`FAILED 3+1 rule at w=${w}, ratio=${ratio}, count=4: cols was 3`);
        process.exit(1);
      }

      // 4. 1:1 x4 at >= 900 px => cols === 4
      if (ratio === '1:1' && count === 4 && w >= 900 && res.cols !== 4) {
        console.error(`FAILED 1:1 x4 at >=900px: w=${w}, cols=${res.cols} (expected 4)`);
        process.exit(1);
      }

      // 5. 16:9 x4 at >= 640 px => cols === 2
      if (ratio === '16:9' && count === 4 && w >= 640 && res.cols !== 2) {
        console.error(`FAILED 16:9 x4 at >=640px: w=${w}, cols=${res.cols} (expected 2)`);
        process.exit(1);
      }

      // 6. 1:1 x4 at < 640 px => cols <= 2
      if (ratio === '1:1' && count === 4 && w < 640 && res.cols > 2) {
        console.error(`FAILED 1:1 x4 at <640px: w=${w}, cols=${res.cols} (expected <= 2)`);
        process.exit(1);
      }
    }
  }
}

console.log(`✓ All ${testsRun} tile layout checks passed successfully.`);

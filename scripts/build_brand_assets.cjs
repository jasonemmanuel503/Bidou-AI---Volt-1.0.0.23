const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const brandDir = path.join(__dirname, 'public', 'brand');
if (!fs.existsSync(brandDir)) {
  fs.mkdirSync(brandDir, { recursive: true });
}

// 2048x2048 SVG generator matching the uploaded Bidou AI mark
function getSvg(isGradient, bgColor = null) {
  const bg = bgColor ? `<rect width="2048" height="2048" fill="${bgColor}" />` : '';
  const fill = isGradient ? 'url(#bidouGrad)' : '#FFFFFF';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="2048" height="2048">
  <defs>
    <linearGradient id="bidouGrad" x1="20%" y1="90%" x2="90%" y2="20%">
      <stop offset="0%" stop-color="#F85A00" />
      <stop offset="45%" stop-color="#FF7D00" />
      <stop offset="75%" stop-color="#FF9D0A" />
      <stop offset="100%" stop-color="#FFB326" />
    </linearGradient>
  </defs>
  ${bg}
  <g fill="${fill}">
    <!-- Main 'b' stem and lower sweeping bowl -->
    <path d="M 620 480
             C 540 480, 488 532, 488 612
             L 488 1220
             C 488 1380, 600 1560, 810 1560
             C 980 1560, 1120 1440, 1178 1290
             C 1198 1238, 1204 1180, 1196 1120
             C 1180 980, 1070 860, 930 830
             L 930 760
             C 1130 790, 1290 940, 1330 1140
             C 1348 1230, 1332 1330, 1282 1420
             C 1198 1572, 1020 1692, 810 1692
             C 520 1692, 356 1472, 356 1208
             L 356 612
             C 356 460, 474 348, 620 348
             C 700 348, 762 396, 786 456
             C 798 488, 782 522, 750 536
             C 724 546, 694 534, 680 508
             C 666 490, 644 480, 620 480
             Z" />

    <!-- Upper record/cinematic arch -->
    <path d="M 830 710
             C 910 634, 1020 578, 1140 558
             C 1310 530, 1490 592, 1600 722
             C 1700 840, 1738 1000, 1704 1150
             C 1692 1202, 1640 1234, 1588 1220
             C 1536 1208, 1504 1156, 1518 1104
             C 1540 994, 1512 876, 1438 788
             C 1354 688, 1214 640, 1084 662
             C 990 678, 902 722, 836 786
             C 798 824, 736 822, 698 784
             C 660 746, 662 684, 700 646
             C 738 608, 782 576, 830 550
             L 830 710
             Z" />

    <!-- Play triangle in center counter -->
    <path d="M 680 890
             C 680 864, 710 848, 732 862
             L 942 988
             C 962 1000, 962 1030, 942 1042
             L 732 1168
             C 710 1182, 680 1166, 680 1140
             Z" />

    <!-- Audio / frequency Wave 1 (top wave) -->
    <path d="M 1010 1220
             C 1070 1160, 1140 1130, 1220 1130
             C 1310 1130, 1380 1180, 1460 1190
             C 1530 1200, 1600 1170, 1660 1120
             C 1700 1086, 1762 1090, 1796 1130
             C 1830 1170, 1826 1232, 1786 1266
             C 1706 1332, 1606 1372, 1500 1362
             C 1400 1352, 1340 1292, 1250 1292
             C 1180 1292, 1120 1332, 1060 1382
             C 1024 1412, 970 1406, 940 1370
             C 910 1334, 916 1280, 952 1250
             L 1010 1220
             Z" />

    <!-- Audio / frequency Wave 2 (middle wave) -->
    <path d="M 1040 1380
             C 1100 1320, 1170 1290, 1250 1290
             C 1340 1290, 1410 1340, 1490 1350
             C 1560 1360, 1630 1330, 1690 1280
             C 1730 1246, 1792 1250, 1826 1290
             C 1860 1330, 1856 1392, 1816 1426
             C 1736 1492, 1636 1532, 1530 1522
             C 1430 1512, 1370 1452, 1280 1452
             C 1210 1452, 1150 1492, 1090 1542
             C 1054 1572, 1000 1566, 970 1530
             C 940 1494, 946 1440, 982 1410
             L 1040 1380
             Z" />

    <!-- Audio / frequency Wave 3 (bottom wave) -->
    <path d="M 1070 1540
             C 1130 1480, 1200 1450, 1280 1450
             C 1370 1450, 1440 1500, 1520 1510
             C 1590 1520, 1660 1490, 1720 1440
             C 1760 1406, 1822 1410, 1856 1450
             C 1890 1490, 1886 1552, 1846 1586
             C 1766 1652, 1666 1692, 1560 1682
             C 1460 1672, 1400 1612, 1310 1612
             C 1240 1612, 1180 1652, 1120 1702
             C 1084 1732, 1030 1726, 1000 1690
             C 970 1654, 976 1600, 1012 1570
             L 1070 1540
             Z" />
  </g>
</svg>`;
}

async function run() {
  console.log('Generating 2048x2048 assets with sharp...');

  // 1. Dark Transparent: White glyph, transparent background
  const darkTransSvg = Buffer.from(getSvg(false, null));
  await sharp(darkTransSvg)
    .resize(2048, 2048)
    .png()
    .toFile(path.join(brandDir, 'bidou-mark-dark-transparent.png'));
  console.log('Created bidou-mark-dark-transparent.png (2048x2048)');

  // 2. Gradient Transparent: Gradient glyph, transparent background
  const gradTransSvg = Buffer.from(getSvg(true, null));
  await sharp(gradTransSvg)
    .resize(2048, 2048)
    .png()
    .toFile(path.join(brandDir, 'bidou-mark-gradient-transparent.png'));
  console.log('Created bidou-mark-gradient-transparent.png (2048x2048)');

  // 3. Dark BG: White glyph on #121214
  const darkBgSvg = Buffer.from(getSvg(false, '#121214'));
  await sharp(darkBgSvg)
    .resize(2048, 2048)
    .jpeg({ quality: 95 })
    .toFile(path.join(brandDir, 'bidou-mark-dark-bg.jpeg'));
  console.log('Created bidou-mark-dark-bg.jpeg (2048x2048)');

  // 4. Light BG: Gradient glyph on #FFFFFF
  const lightBgSvg = Buffer.from(getSvg(true, '#FFFFFF'));
  await sharp(lightBgSvg)
    .resize(2048, 2048)
    .jpeg({ quality: 95 })
    .toFile(path.join(brandDir, 'bidou-mark-light-bg.jpeg'));
  console.log('Created bidou-mark-light-bg.jpeg (2048x2048)');

  // 5. Favicon set from the gradient transparent mark
  const publicDir = path.join(__dirname, 'public');
  await sharp(gradTransSvg)
    .resize(2048, 2048)
    .png()
    .toFile(path.join(publicDir, 'favicon.png'));
  console.log('Created favicon.png (2048x2048)');

  await sharp(gradTransSvg)
    .resize(180, 180)
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('Created apple-touch-icon.png (180x180)');

  await sharp(gradTransSvg)
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32x32.png'));
  console.log('Created favicon-32x32.png (32x32)');

  await sharp(gradTransSvg)
    .resize(16, 16)
    .png()
    .toFile(path.join(publicDir, 'favicon-16x16.png'));
  console.log('Created favicon-16x16.png (16x16)');

  // For favicon.ico, 32x32 PNG is supported by modern browsers
  await sharp(gradTransSvg)
    .resize(32, 32)
    .toFormat('png')
    .toFile(path.join(publicDir, 'favicon.ico'));
  console.log('Created favicon.ico');

  console.log('All brand and favicon assets created successfully!');
}

run().catch(console.error);

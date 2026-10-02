// Test Geometry Script
const sharp = require('sharp');
const fs = require('fs');

// We test constructing an ultra-faithful SVG matching the user uploaded Favicon.png and Bidou AI - Dark Mode Transparent.png
function generateBidouSvg(mode) {
  // mode: 'light' (gradient) or 'dark' (white)
  const isLight = mode === 'light';
  
  const defs = isLight ? `
    <defs>
      <linearGradient id="bidouGrad" x1="0%" y1="100%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#FF3E00" />
        <stop offset="35%" stop-color="#FF5C00" />
        <stop offset="70%" stop-color="#FF8A00" />
        <stop offset="100%" stop-color="#FFB500" />
      </linearGradient>
    </defs>
  ` : '';

  const fill = isLight ? 'url(#bidouGrad)' : '#FFFFFF';
  const stroke = isLight ? 'url(#bidouGrad)' : '#FFFFFF';

  // Coordinate space: 1000 x 1000
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
  ${defs}
  <g fill="${fill}">
    <!-- 1. Left Vertical Stem and Bottom Bowl of 'b' -->
    <path d="M 330 230
             C 278 230, 238 270, 238 322
             L 238 610
             C 238 715, 315 770, 420 770
             C 490 770, 560 740, 608 680
             C 555 700, 490 705, 425 690
             C 345 670, 332 605, 332 540
             L 332 322
             C 332 300, 340 285, 355 272
             C 370 258, 385 252, 385 240
             C 385 234, 375 230, 360 230
             Z" />

    <!-- 2. Upper Sweeping Arc (separated from stem by diagonal slit) -->
    <path d="M 450 380
             C 435 390, 430 405, 442 415
             C 455 425, 470 422, 482 410
             C 530 360, 600 340, 670 360
             C 755 385, 815 455, 825 545
             C 830 590, 810 635, 780 670
             C 768 682, 770 698, 785 708
             C 800 718, 818 715, 830 700
             C 872 650, 895 585, 890 520
             C 880 395, 795 295, 675 268
             C 575 245, 470 280, 405 350
             L 450 380
             Z" />
  </g>

  <!-- 3. Hollow Play Triangle inside counter (stroke with rounded caps/joins) -->
  <g fill="none" stroke="${stroke}" stroke-width="58" stroke-linejoin="round" stroke-linecap="round">
    <polygon points="380,440 380,580 505,510" />
  </g>

  <!-- 4. Three undulating sound/frequency waves flowing from bottom bowl -->
  <g fill="none" stroke="${stroke}" stroke-width="48" stroke-linecap="round" stroke-linejoin="round">
    <!-- Wave 1 (Top Wave) -->
    <path d="M 470 700
             C 525 650, 580 525, 660 550
             C 715 568, 730 635, 810 635
             C 830 635, 840 635, 850 635" />

    <!-- Wave 2 (Middle Wave) -->
    <path d="M 460 740
             C 525 700, 585 590, 665 615
             C 720 635, 735 700, 815 700
             C 830 700, 840 700, 850 700" />

    <!-- Wave 3 (Bottom Wave) -->
    <path d="M 450 780
             C 520 750, 585 660, 665 680
             C 720 700, 735 765, 815 765
             C 830 765, 840 765, 850 765" />
  </g>
</svg>`;
}

async function test() {
  const lightSvg = Buffer.from(generateBidouSvg('light'));
  await sharp(lightSvg).resize(1024, 1024).png().toFile('test_light.png');
  const darkSvg = Buffer.from(generateBidouSvg('dark'));
  await sharp(darkSvg).resize(1024, 1024).png().toFile('test_dark.png');
  console.log('Saved test images');
}

test();

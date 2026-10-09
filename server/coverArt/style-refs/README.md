# Style References Directory (`server/coverArt/style-refs/`)

This directory is reserved for proprietary, copyright-cleared visual style reference images used by the AI Cover Art v2 pipeline.

## Ownership & Compliance Requirements
1. **Strictly Owned or Cleared Assets**: All reference images placed in this folder must be original photography, 3D renders, or digital art created by Bidou AI or explicitly licensed by the founder.
2. **Never Use Existing Album Covers**: Never place copyrighted commercial album covers or third-party trademarked material in this directory.
3. **Format & Sizing**:
   - Format: JPEG or PNG
   - Target Resolution: Square 1024×1024 pixels (approx. 1 MP)
   - Quality: High dynamic range, distinct lighting and color grade.

## Pipeline Usage
- When this folder is empty, the pipeline operates in pure text-guided mode (relying on the style recipe art direction and prompt generator).
- When style reference files are present (named or linked in `recipes.ts`), the engine incorporates up to two reference images:
  - `input_image_0`: Style reference
  - `input_image_1`: Artist portrait photo
  - Prompt guidance: "Take the subject of image 1 and style it with the lighting, color grade, and atmosphere of image 0."

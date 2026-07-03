# Two-Character Source Crop Review

Generated source-frame scan:

- `tmp/voxel-scale-editor/two-character-crop-review/index.html`
- `tmp/voxel-scale-editor/two-character-crop-review/candidates.json`
- `tmp/voxel-scale-editor/two-character-crop-review/candidates.csv`
- individual candidate zooms: `tmp/voxel-scale-editor/two-character-crop-review/frames/`

## Fixed

These frames had real extra character/body cells inside the source PNG and were cropped to the intended single cell. HD voxels were rebuilt for each repaired frame.

| Character | Frame | Kept cell | Reason |
| --- | ---: | --- | --- |
| Dr. Mashirito | 174 | bottom | removed upper duplicate character cell |
| Ichigo Kurosaki | 409 | bottom | removed upper duplicate character cell |
| Jaguar Junichi | 185 | top | removed lower stray character cell |
| Jaguar Junichi | 190 | top | removed lower stray character cell |
| Kinnikuman | 271 | bottom | removed upper duplicate character cell |
| Piccolo | 154 | bottom | removed upper duplicate character cell |
| Taizo Momote | 006 | left | removed adjacent stray character cell |
| Taizo Momote | 009 | left | removed adjacent stray character cell |
| Taizo Momote | 014 | right | removed adjacent stray character cell |
| Taizo Momote | 017 | left | removed adjacent stray character cell |

## Verification

- Reran the source-frame connected-component scan.
- Reran used-animation filtering.
- Confirmed the 10 fixed frames are no longer flagged: `fixedStillFlagged=0`.
- Confirmed each repaired PNG matches its rebuilt HD voxel JSON source dimensions.
- Regenerated ghost proof sheets and `proof-all.html`.

## Remaining Used Scanner Candidates

The remaining used candidates are not treated as crop errors in this pass. They visually read as attack effects, weapons, projectiles, afterimages, motion streaks, or previously excluded/unplayable-style panel frames rather than two playable character bodies accidentally imported into one cell.

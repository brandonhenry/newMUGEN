# KORE Boxed Frame Review Report

Fresh pass started with the corrected per-frame black-box workflow.

Primary evidence: `tmp/voxel-scale-editor/character-review-sheets/<character>-black-boxes.png`.
Motion-flow evidence: `tmp/voxel-scale-editor/character-review-sheets/<character>-black-primary.png`.
Secondary evidence: `tmp/voxel-scale-editor/character-review-sheets/<character>-ghost-secondary.png`.

Required visual checklist for every individual black-boxed frame:

- Actual head height/size compared to idle first; standing/upright head top must align with idle top guide.
- Body volume compared to idle.
- Laying/prone/curled body mass is not oversized.
- Laying/prone frames break aspect ratio when needed: lower height, longer width, horizontal body length corresponding to idle standing height.
- Feet/body support makes sense for the pose.
- Weapons/effects do not drive body scale decisions.
- Large effect boxes do not mean the body is too large; actual head/torso/legs must match idle.
- Neighboring frames do not pop larger or smaller.

## Character Log

| # | Character | Status |
|---:|---|---|
| 1 | Allen Walker (`allen-walker`) | In progress. |

## Frame Decisions

| Character | Move | Frame | Decision | Verified |
|---|---|---:|---|---|
| Allen Walker | `cmd:f+1` | 253 | Restored larger body scale `1.31w/1.31h`; green effect box is ignored, actual body/head needed to match idle. | Individual black PNG checked. |
| Allen Walker | `cmd:f+1` | 254 | Reduced oversized body hidden by green effect to `1.06w/1.06h`. | Individual black PNG checked. |
| Allen Walker | `cmd:qcf+4` | 82 | Same source/body as `cmd:f+1` 253; restored larger body scale `1.31w/1.31h`. | Individual black PNG checked. |
| Allen Walker | `cmd:qcf+4` | 83 | Same source/body issue as `cmd:f+1` 254; reduced to `1.06w/1.06h`. | Individual black PNG checked. |
| Allen Walker | `getupStand` | 53 | Broke aspect ratio for laying recovery: `1.25w/0.48h`, low and long against idle. | Individual black PNG checked. |
| Allen Walker | `getupStand` | 54 | Broke aspect ratio for laying recovery: `1.25w/0.48h`, low and long against idle. | Individual black PNG checked. |
| Allen Walker | `getupStand` | 55 | Reduced kneeling recovery to `0.90w/0.90h` so it transitions below idle before standing. | Individual black PNG checked. |
| Allen Walker | `knockdown` | 33 | Reduced compact/folded body to `0.90w/0.90h`. | Individual black PNG checked. |
| Allen Walker | `knockdown` | 34 | Reduced compact/folded body to `0.85w/0.85h`. | Individual black PNG checked. |
| Allen Walker | `getupStand` | 33 | Same source as knockdown 33; reduced to `0.90w/0.90h`. | Individual black PNG checked. |
| Allen Walker | `getupStand` | 34 | Same source as knockdown 34; reduced to `0.85w/0.85h`. | Individual black PNG checked. |
| Allen Walker | `lose` | 30 | Broke aspect ratio for laying pose: `1.35w/0.42h`, low and long against idle. | Individual black PNG checked. |

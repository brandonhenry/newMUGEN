# KORE Boxed Frame Review Report

Fresh Allen restart with strict individual-PNG checklist.

Interpreter: severe animation-professor mode. Borderline frames are suspect; passes require a concrete visual reason.

Primary evidence: `tmp/voxel-scale-editor/individual-frame-proofs/<character>/<move>/*.png`.
Secondary evidence: ghost proof only after individual visual inspection.

Each individual PNG must mark every rule:

- `head-size`: height, width, face/head mass, and perceived volume against idle. Line alignment alone is not enough.
- `head-position`
- `body-volume`
- `laying-aspect`
- `ball-compact` including side-on folded or crouched-in-air bodies, classified by silhouette not move name
- `feet-ground`
- `effect-ignore`
- `neighbor-continuity`

Values: `pass`, `fail`, or `n/a: reason`.

## Character Log

| # | Character | Status |
|---:|---|---|
| 1 | Allen Walker (`allen-walker`) | Restarted from top after head-volume and ball-body skill updates. |

## Strict Frame Checklist

| Character | Move | Frame | head-size | head-position | body-volume | laying-aspect | ball-compact | feet-ground | effect-ignore | neighbor-continuity | Decision |
|---|---|---:|---|---|---|---|---|---|---|---|---|
| Allen Walker | `sprint` | 012 | fixed: head volume now closer to idle | n/a: forward-running lean | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Reduced to `0.52w/0.90h`; verified individual PNG. |
| Allen Walker | `sprint` | 013 | fixed: head volume now closer to idle | n/a: forward-running lean | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Reduced to `0.53w/0.90h`; verified individual PNG. |
| Allen Walker | `idle` | 000 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Reference frame; no edit. |
| Allen Walker | `idle` | 001 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `idle` | 002 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `idle` | 003 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `idle` | 002 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Repeated frame; no edit. |
| Allen Walker | `idle` | 001 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Repeated frame; no edit. |
| Allen Walker | `walkForward` | 004 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 005 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 006 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 007 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 008 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 009 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 010 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkForward` | 011 | pass | n/a: leaning walk pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `walkBack` | 014 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Slightly larger scale but head/body volume still acceptable; no edit. |
| Allen Walker | `backflip` | 045 | pass | n/a: inverted flip pose | pass | n/a: not laying | pass: folded flip not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `backflip` | 046 | pass | n/a: inverted flip pose | pass | n/a: not laying | pass: folded flip not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `backflip` | 047 | pass | n/a: rotated flip pose | pass | n/a: not laying | pass: compact flip not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `backflip` | 048 | pass | n/a: compact landing pose | pass | n/a: not laying | pass: compact landing not inflated | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `sidestepLeft` | 145 | pass | n/a: side-on folded pose | pass | n/a: not laying | pass: side-on folded body not inflated | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `sidestepRight` | 145 | pass | n/a: side-on folded pose | pass | n/a: not laying | pass: side-on folded body not inflated | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `jump` | 017 | pass | n/a: crouched-in-air pose | pass | n/a: not laying | pass: crouched-in-air body not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `jump` | 018 | pass | n/a: crouched-in-air pose | pass | n/a: not laying | pass: crouched-in-air body not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `jump` | 019 | pass | n/a: side-on folded jump pose | pass | n/a: not laying | pass: side-on folded body not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `jump` | 020 | pass | n/a: side-on folded jump pose | pass | n/a: not laying | pass: side-on folded body not inflated | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `jump` | 021 | pass | n/a: transition pose | pass | n/a: not laying | n/a: not ball | n/a: airborne | n/a: no effect | pass | No edit. |
| Allen Walker | `crouch` | 022 | pass | n/a: crouch lowers head | pass | n/a: not laying | pass: grounded compact pose not inflated | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `block` | 015 | pass | n/a: guard pose/hair covers top | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `chargeKi` | 060 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `chargeKi` | 061 | fixed: head/face mass no longer pops | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | Reduced to `1.03w/1.03h`; verified individual PNG. |
| Allen Walker | `chargeKi` | 062 | fixed: arm-over-head interference; head now tall enough while width stays controlled | pass: upright charge pose/head top matches idle band better | pass | n/a: not laying | n/a: not ball | pass | pass: raised arm ignored for body scale | pass | Non-uniform fix to `0.88w/1.04h`; verified individual PNG after strict head-height check. |
| Allen Walker | `chargeKi` | 063 | fixed: uniform shrink made head top too low; height restored separately from width | pass: upright charge pose/head top matches idle band better | pass | n/a: not laying | n/a: not ball | pass | pass: raised arm ignored for body scale | pass | Non-uniform fix to `0.88w/1.08h`; verified individual PNG after strict head-height check. |

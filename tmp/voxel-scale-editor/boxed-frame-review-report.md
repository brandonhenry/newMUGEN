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
| 1 | Allen Walker (`allen-walker`) | Restarted again under height-first/head-top lock rule; rechecking all 108 frames from the top. |
| 2 | Anna Kyoyama (`anna-kyoyama`) | In progress; restarted under strict head-top/head-width/head-volume rule after frame 086 correction. |

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
| Allen Walker | `chargeKi` | 062 | fixed: arm-over-head interference; ruler shows actual head now reaches idle guide while width stays controlled | pass: upright charge pose/head top matches ruler guide | pass | n/a: not laying | n/a: not ball | pass | pass: raised arm ignored for body scale | pass | Non-uniform ruler fix to `0.88w/1.08h`; verified individual PNG with foot-to-head ruler. |
| Allen Walker | `chargeKi` | 063 | fixed: uniform shrink made head top too low; ruler confirmed height needed to be restored separately from width | pass: upright charge pose/head top matches ruler guide | pass | n/a: not laying | n/a: not ball | pass | pass: raised arm ignored for body scale | pass | Non-uniform ruler fix to `0.88w/1.12h`; verified individual PNG with foot-to-head ruler. |
| Allen Walker | `jableft` | 074 | pass | n/a: forward attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | No edit; reused source checked against aliases. |
| Allen Walker | `jableft` | 075 | pass | n/a: attack lean/hair extension | pass | n/a: not laying | n/a: not ball | pass | pass: hair/claw ignored | pass | No edit; body core stays idle-sized. |
| Allen Walker | `jableft` | 076 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | No edit; width belongs to weapon/claw, not body. |
| Allen Walker | `jableft` | 077 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | No edit; same source behavior as 076. |
| Allen Walker | `jableft` | 078 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | No edit beyond existing `1.03w/1.03h`; also checked as win. |
| Allen Walker | `hitLight` | 026 | pass | n/a: hit recoil lean | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `juggle` | 028 | pass | n/a: airborne rotated body | pass | n/a: not laying | n/a: rotated airborne pose | n/a: airborne | n/a: no effect | pass | No edit; rotated body volume acceptable. |
| Allen Walker | `knockdown` | 031 | pass | n/a: falling rotated body | pass | n/a: not floor-laying yet | n/a: rotated fall | n/a: airborne/falling | n/a: no effect | pass | No edit. |
| Allen Walker | `knockdown` | 032 | pass | n/a: falling rotated body | pass | n/a: not floor-laying yet | n/a: rotated fall | n/a: airborne/falling | n/a: no effect | pass | No edit. |
| Allen Walker | `knockdown` | 033 | pass | n/a: compact impact pose | pass | n/a: not flat laying | pass: compact body not inflated | n/a: falling/impact | n/a: no effect | pass | Existing `0.90w/0.90h` verified. |
| Allen Walker | `knockdown` | 034 | pass | n/a: compact impact pose | pass | n/a: not flat laying | pass: compact body not inflated | n/a: falling/impact | n/a: no effect | pass | Existing `0.85w/0.85h` verified. |
| Allen Walker | `getupStand` | 032 | pass | n/a: rotated getup start | pass | n/a: not floor-laying yet | n/a: rotated getup | n/a: transition | n/a: no effect | pass | No edit. |
| Allen Walker | `getupStand` | 033 | pass | n/a: compact getup start | pass | n/a: not flat laying | pass: compact body not inflated | n/a: transition | n/a: no effect | pass | Existing `0.90w/0.90h` verified. |
| Allen Walker | `getupStand` | 034 | pass | n/a: compact getup start | pass | n/a: not flat laying | pass: compact body not inflated | n/a: transition | n/a: no effect | pass | Existing `0.85w/0.85h` verified. |
| Allen Walker | `getupStand` | 053 | pass | n/a: laying recovery lowers head | pass | pass: low and wide, width longer than height | n/a: not ball | pass: body support on ground | n/a: no effect | pass | Existing `1.25w/0.48h` verified. |
| Allen Walker | `getupStand` | 054 | pass | n/a: laying recovery lowers head | pass | pass: low and wide, width longer than height | n/a: not ball | pass: body support on ground | n/a: no effect | pass | Existing `1.25w/0.48h` verified. |
| Allen Walker | `getupStand` | 055 | pass | n/a: kneeling recovery lowers head | pass | n/a: no longer laying | pass: compact kneel not inflated | pass: grounded hand/knee | n/a: no effect | pass | Existing `0.90w/0.90h` verified. |
| Allen Walker | `getupStand` | 056 | pass | n/a: rising recovery pose | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit. |
| Allen Walker | `getupStand` | 057 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | n/a: no effect | pass | No edit; returns to idle-sized body. |
| Allen Walker | `win` | 078 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source as jableft 078; no additional edit. |
| Allen Walker | `lose` | 030 | pass | n/a: prone body lowers head | pass | pass: low and wide floor pose | n/a: not ball | pass: floor support | n/a: no effect | pass | Existing `1.35w/0.42h` verified. |
| Allen Walker | `cmd:f+1` | 251 | pass | n/a: side attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: green weapon ignored | pass | No edit. |
| Allen Walker | `cmd:f+1` | 252 | pass | n/a: crouched attack lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: green weapon ignored | pass | No edit. |
| Allen Walker | `cmd:f+1` | 253 | pass | n/a: crouched attack lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: large weapon box ignored | pass | Existing `1.31w/1.31h` preserved; actual body needs this size. |
| Allen Walker | `cmd:f+1` | 254 | pass | n/a: side attack lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: weapon ignored | pass | Existing `1.06w/1.06h` verified. |
| Allen Walker | `cmd:f+1` | 255 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: red arm ignored | pass | No edit. |
| Allen Walker | `cmd:f+1` | 256 | fixed: transformed extension no longer hides skinny body core | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: hair/extension ignored after body fix | pass | Increased to `1.25w/1.10h`; verified. |
| Allen Walker | `cmd:f+1` | 257 | fixed: side-on body core widened | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: extension ignored after body fix | pass | Increased to `1.25w/1.10h`; verified. |
| Allen Walker | `cmd:f+1` | 258 | fixed: side-on body core widened | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: extension ignored after body fix | pass | Increased to `1.25w/1.10h`; verified. |
| Allen Walker | `cmd:f+1` | 259 | fixed: line-thin body core widened hard | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: hair/extension ignored after body fix | pass | Increased to `1.65w/1.10h`; verified. |
| Allen Walker | `cmd:f+1` | 260 | fixed: line-thin body core widened hard | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: weapon/extension ignored after body fix | pass | Increased to `1.65w/1.10h`; verified. |
| Allen Walker | `cmd:qcf+4` | 080 | pass | n/a: side attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: green weapon ignored | pass | Same behavior as `cmd:f+1` 251; no edit. |
| Allen Walker | `cmd:qcf+4` | 081 | pass | n/a: crouched attack lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: green weapon ignored | pass | Same behavior as `cmd:f+1` 252; no edit. |
| Allen Walker | `cmd:qcf+4` | 082 | pass | n/a: crouched attack lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: large weapon box ignored | pass | Existing `1.31w/1.31h` preserved; actual body needs this size. |
| Allen Walker | `cmd:qcf+4` | 083 | pass | n/a: side attack lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: weapon ignored | pass | Existing `1.06w/1.06h` verified. |
| Allen Walker | `cmd:qcf+4` | 084 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: red arm ignored | pass | No edit. |
| Allen Walker | `cmd:qcf+4` | 085 | fixed: transformed extension no longer hides skinny body core | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: hair/extension ignored after body fix | pass | Increased to `1.25w/1.10h`; verified. |
| Allen Walker | `cmd:qcf+4` | 086 | fixed: side-on body core widened | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: extension ignored after body fix | pass | Increased to `1.25w/1.10h`; verified. |
| Allen Walker | `cmd:qcf+4` | 087 | fixed: side-on body core widened | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: extension ignored after body fix | pass | Increased to `1.25w/1.10h`; verified. |
| Allen Walker | `cmd:qcf+4` | 088 | fixed: line-thin body core widened hard | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: hair/extension ignored after body fix | pass | Increased to `1.65w/1.10h`; verified. |
| Allen Walker | `cmd:qcf+4` | 089 | fixed: line-thin body core widened hard | n/a: side/back attack pose | pass | n/a: not laying | n/a: not ball | pass | pass: weapon/extension ignored after body fix | pass | Increased to `1.65w/1.10h`; verified. |
| Allen Walker | `cmd:1+2` | 091 | fixed: standing body was slightly too small | pass | pass | n/a: not laying | n/a: not ball | pass | pass: red arm ignored | pass | Increased to `1.05w/1.05h`; verified. |
| Allen Walker | `cmd:1+2` | 092 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: red arm ignored | pass | Existing `1.02w/1.02h` verified. |
| Allen Walker | `cmd:1+2` | 093 | fixed: body core slightly too small beside idle | pass | pass | n/a: not laying | n/a: not ball | pass | pass: red arm ignored | pass | Increased to `1.04w/1.04h`; verified. |
| Allen Walker | `cmd:1+2` | 094 | pass | n/a: forward attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored | pass | No edit. |
| Allen Walker | `cmd:1+2` | 095 | fixed: extension hid skinny/short side-on body; multi-line ruler tuned height to idle head guide | pass: side-on attack head now sits on guide | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored after body fix | pass | Final `1.25w/1.16h`; verified with multi-line ruler. |
| Allen Walker | `cmd:1+2` | 096 | fixed: extension hid skinny/short side-on body; multi-line ruler tuned height to idle head guide | pass: side-on attack head now sits on guide | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored after body fix | pass | Final `1.25w/1.16h`; verified with multi-line ruler. |
| Allen Walker | `cmd:1+2` | 097 | fixed: extension hid skinny/short side-on body; multi-line ruler tuned height to idle head guide | pass: side-on attack head now reaches guide | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored after body fix | pass | Final `1.25w/1.18h`; verified with multi-line ruler. |
| Allen Walker | `cmd:1+2` | 098 | fixed: extension hid skinny/short side-on body; multi-line ruler tuned height to idle head guide | pass: side-on attack head now reaches guide | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored after body fix | pass | Final `1.25w/1.18h`; verified with multi-line ruler. |
| Allen Walker | `cmd:1+2` | 099 | pass | n/a: low lunge lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored | pass | Existing `0.99w/0.99h` verified. |
| Allen Walker | `cmd:1+2` | 100 | pass | n/a: low lunge lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored | pass | Existing `0.99w/0.99h` verified. |
| Allen Walker | `cmd:1+2` | 101 | pass | n/a: low lunge lowers head | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored | pass | Existing `0.99w/0.99h` verified. |
| Allen Walker | `cmd:1+2` | 102 | pass | n/a: attack recovery lean | pass | n/a: not laying | n/a: not ball | pass | pass: gray arm ignored | pass | No edit. |
| Allen Walker | `cmd:1+2` | 103 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: red arm ignored | pass | No edit. |
| Allen Walker | `cmd:FC+1` | 074 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:FC+1` | 075 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:FC+1` | 076 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:FC+1` | 077 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:FC+1` | 078 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft/win; verified by reuse check. |
| Allen Walker | `cmd:d+1` | 074 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:d+1` | 075 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:d+1` | 076 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:d+1` | 077 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:d+1` | 078 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft/win; verified by reuse check. |
| Allen Walker | `cmd:qcf+1` | 074 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:qcf+1` | 075 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:qcf+1` | 076 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:qcf+1` | 077 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:qcf+1` | 078 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft/win; verified by reuse check. |
| Allen Walker | `cmd:O+1` | 074 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:O+1` | 075 | pass | n/a: reused attack lean | pass | n/a: not laying | n/a: not ball | pass | pass: claw/hair ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:O+1` | 076 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:O+1` | 077 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft; verified by reuse check. |
| Allen Walker | `cmd:O+1` | 078 | pass | pass | pass | n/a: not laying | n/a: not ball | pass | pass: claw ignored | pass | Same source/scale as jableft/win; verified by reuse check. |

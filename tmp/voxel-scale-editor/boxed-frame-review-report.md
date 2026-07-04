# KORE Boxed Frame Review Report

Fresh restart requested July 3, 2026. Prior notes/logs cleared.

Strict interpreter: every playable character is reviewed from the top of the roster using individual black-background proof PNGs with idle reference, ruler, orange idle head-height line, target box line, and magenta head-color candidate line as visual evidence. Scripts generate proofs only; final pass/fail decisions are visual.

## Character Log

| Character | Status | Notes |
| --- | --- | --- |
| Allen Walker | Completed 108/108 | Fresh individual-proof pass complete. No new edits needed. Sprint frames 012/013 rechecked with strict head-volume rule; accepted as leaned sprint with correct body volume. ChargeKi 062/063 rechecked with arm/head separation; accepted after current tall-over-wide correction. `cmd:f+1` and `cmd:qcf+4` accepted as reach/weapon-extension rows while judging the actual body core only. Low getup/lose frames accepted as laying/compact with width preserved. |
| Anna Kyoyama | Completed 119/119 | Fresh individual-proof pass complete. No new edits needed. Movement/sprint rows checked for tallness and red-head scale; prone/getup/lose rows accepted as low-wide laying poses with preserved horizontal length; command chain/slash rows accepted only after separating Anna body core from chain/effect/summon art. Alias rows using frames 084-090 rechecked with no hidden scale drift. |
| Arale Norimaki | Completed 111/111 | Fresh individual-proof pass complete. Fixed `juggle` frame 030 from 1.00/1.00 to 0.75/0.75 after strict low-wide/ball-body check showed oversized curled body and head mass. Regenerated proofs and verified frame 030 against juggle 029 and knockdown 039. All command aliases rechecked; no additional scale drift. |
| Astra | Completed 0/0 | Playable manifest entry has no animation-backed frames/idle proof queue. No visual frames to inspect. |
| Bobobo-bo Bo-bobo | Completed 165/165 | Fresh individual-proof pass complete. No new edits needed. Hair/head mass used as character-specific scale anchor. Prone/getup frames accepted as low-wide; transformed `cmd:O+2` and alternate-character `cmd:qcf+4` rows accepted by internal row consistency; repeated jab/kick alias families rechecked with no scale drift. |
| Caramelman-J | Skipped | `unplayable=true`; playable-only pass. |
| Cygnus Hyoga | Skipped | `unplayable=true`; playable-only pass. |
| Dax | Completed 0/0 | Playable manifest entry has no animation-backed frames/idle proof queue. No visual frames to inspect. |
| Dio | Completed 93/93 | Fresh individual-proof pass complete. Added width-only corrections for side-profile frames that still read thread-thin: `backflip` 041/042/043, `sidestepLeft` 042, `sidestepRight` 042, and `jump` 021. Regenerated proofs and verified head height remained locked while body volume improved. Walk/sprint prior width fixes also rechecked clean. |
| Don Patch Poppa Rocks | Completed 189/189 | Fresh individual-proof pass complete. Fixed inflated backflip compact/body frames 040 and 048, then tightened 040 again after regen. Found alias-scale drift where command aliases reused jableft/jabright/kickright source frames without the verified per-frame scales; copied those scales to `cmd:f+1`, `cmd:FC+1`, `cmd:d+1`, `cmd:qcf+1`, `cmd:O+1`, `cmd:d/f+2`, `cmd:FC+2`, `cmd:f+2`, `cmd:WS+2`, `cmd:qcf+4`, `cmd:WS+4`, `cmd:2+4`, `cmd:1+4`, `cmd:SS+4`, and `cmd:O+4`. Regenerated proofs and verified representative aliases. |

## Frame Checklist

| Character | Move | Frame | Head Size | Head Position | Body Volume | Laying Aspect | Ball Compact | Feet Ground | Effect Ignore | Neighbor Continuity | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Allen Walker | all animation-backed rows | 108 frames | pass | pass/n/a by pose | pass | pass/n/a by pose | pass/n/a by pose | pass/n/a by pose | pass/n/a by frame | pass | completed: every individual proof reviewed visually; no new manifest edits |
| Anna Kyoyama | all animation-backed rows | 119 frames | pass | pass/n/a by pose | pass | pass/n/a by pose | pass/n/a by pose | pass/n/a by pose | pass/n/a by frame | pass | completed: every individual proof reviewed visually; no new manifest edits |
| Arale Norimaki | juggle | 030 | fail -> pass | n/a: curled/horizontal | fail -> pass | fail -> pass | pass after shrink | n/a: airborne/curled | n/a: no scale-driving effect | pass after regen | fixed: 1.00/1.00 -> 0.75/0.75 |
| Arale Norimaki | all remaining animation-backed rows | 110 frames | pass | pass/n/a by pose | pass | pass/n/a by pose | pass/n/a by pose | pass/n/a by pose | pass/n/a by frame | pass | completed: every remaining individual proof reviewed visually |
| Bobobo-bo Bo-bobo | all animation-backed rows | 165 frames | pass | pass/n/a by pose | pass | pass/n/a by pose | pass/n/a by transformed row | pass/n/a by pose | pass/n/a by frame | pass | completed: every individual proof reviewed visually; no new manifest edits |
| Dio | backflip/sidestep/jump | 041/042/043/021 | fail -> pass | pass | fail -> pass | n/a: not laying | n/a: not ball | pass/n/a by pose | n/a: no scale-driving effect | pass after regen | fixed width-only side-profile frames |
| Dio | all remaining animation-backed rows | 87 frames | pass | pass/n/a by pose | pass | pass/n/a by pose | pass/n/a by pose | pass/n/a by pose | pass/n/a by frame | pass | completed: every remaining individual proof reviewed visually |
| Don Patch Poppa Rocks | backflip | 040/048 | pass after shrink | n/a: compact/rotating | fail -> pass | n/a: not laying | pass after shrink | n/a: airborne/rotating | n/a: no scale-driving effect | pass after regen | fixed: 040 1.09/1.09 -> 0.94/0.94; 048 1.09/1.09 -> 1.00/1.00 |
| Don Patch Poppa Rocks | command aliases | 076-080/090-094/192-200 | fail -> pass | pass/n/a by pose | fail -> pass | pass/n/a by pose | pass/n/a by pose | pass/n/a by pose | pass: reach/smear ignored | pass after regen | fixed: copied verified base-row frame scales to repeated command aliases |
| Don Patch Poppa Rocks | all remaining animation-backed rows | 181 frames | pass | pass/n/a by pose | pass | pass/n/a by pose | pass/n/a by pose | pass/n/a by pose | pass/n/a by frame | pass | completed: every remaining individual proof reviewed visually |

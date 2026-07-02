# All-State Voxel Scale Visual QA

Reviewed playable, idle-backed characters only. Excluded Near, unplayable characters, and no-idle characters.

Sheets:

- `state-review/defense-core.png`: crouch, block, crouchBlock, hitLight, hitHeavy, juggle
- `state-review/ground-recovery.png`: knockdown, getupStand, getupRollUp, lose
- `state-review/movement-core.png`: walkForward, walkBack, sprint, backflip, sidesteps, jump, chargeKi, win
- `pages/page-01.png` through `pages/page-04.png`: all animation-backed states and moves

Visual result:

- Blocks and crouch blocks read consistently against each character's idle volume.
- Crouches remain intentionally shorter but not tiny or stretched.
- Knockdown/getup frames with small numeric scale values are visually correct: their horizontal body footprint stays comparable to idle height, which is the right reference for prone bodies.
- Sprint/lose frames that reuse prone art also read correctly after the existing per-frame scale overrides.
- Gon, Sanji, Ichigo, Gohan Super Saiyan 2, Rukia, Sakura, Killua, and Kyubi Naruto were spot-checked individually because they contained the highest-risk small scale values. No additional hand-picked scale edits were needed.

No manifest scale changes were applied in this all-state pass.

# KORE Roster Projectile Pass Log

Started: 2026-07-05

Scope:
- Audit all playable character manifests under `public/characters/*/character.json`.
- Apply only projectile bindings that are high-confidence by animation evidence plus lore/series fit.
- Keep ambiguous or melee-only candidates out of manifests.
- Validate with focused engine checks, typecheck/build, and an in-game visual smoke pass.

Progress:
- Skill loaded: `/Users/brandonhenry/.codex/skills/kore-projectile-generator/SKILL.md`
- Rubric loaded: `/Users/brandonhenry/.codex/skills/kore-projectile-generator/references/projectile-rubric.md`
- Found 73 playable character manifests.
- Audit run: 739 candidates; review set included all medium/high lore-ranged characters.
- Visual review sheets generated:
  - `tmp/projectile-audit/high-candidates.png`
  - `tmp/projectile-audit/lore-review-01.png` through `tmp/projectile-audit/lore-review-09.png`
  - `tmp/projectile-audit/sven-review.png`
- Applied 19 visually approved projectile bindings:
  - `kiro`: `kickright` -> `chakra-or-tool-projectile`
  - `majin-buu`: `kickleft`, `cmd:qcf+4`, `cmd:1+3` -> `ki-energy-projectile`
  - `nami-perfect-clima-tact`: `cmd:qcf+4`, `cmd:O+2` -> `weather-lightning-projectile`
  - `piccolo`: `jabright`, `cmd:f+1`, `cmd:O+2` -> `ki-energy-projectile`
  - `toshiro-hitsugaya`: `cmd:qcf+4`, `cmd:O+2` -> `ice-energy-projectile`
  - `train-heartnet`: `kickleft`, `kickright`, `cmd:WS+4`, `cmd:1+3`, `cmd:O+2` -> `firearm-bullet-projectile`
  - `yugi-mutou`: `cmd:O+2` -> `card-magic-projectile`
  - `yusuke-urameshi`: `cmd:qcf+4`, `cmd:O+2` -> `spirit-energy-projectile`
- Skipped visually ambiguous or attached-effect candidates:
  - Generic `Aura Drive` body/aura/rush sequences on Dragon Ball characters unless the frames showed a distinct shot.
  - Staff/fan/weapon swipes where the effect stayed attached to the fighter.
  - Franky/Dr. Mashirito/Arale mechanical poses where the frames did not show a projectile leaving the weapon.
  - Riven/Sasuke fireball-labeled slash frames that visually read as attached sword/fire slashes.
  - Sven Vollfied candidates because mapped frames were suitcase poses or comic/text panels; removed the earlier non-confident Sven sample binding/assets.
- Regenerated applied assets after lore palette pass:
  - Naruto/Kiro Rasenshuriken: cyan wind/tool.
  - Majin Buu: pink ki/magic.
  - Piccolo: green Namekian ki.
  - Toshiro: ice wave.
  - Train: warm firearm bullet.
  - Yugi: card magic.
  - Yusuke: spirit shot.
- Validation:
  - `npm run typecheck`: passed.
  - `npx vitest run src/engine/fightEngine.test.ts`: passed, 283 tests.
  - `npm run build`: passed; Vite emitted existing large chunk warnings.
  - Temporary roster smoke test: passed, 19/19 approved bindings spawned runtime projectiles and had valid frame assets.
  - Browser smoke on `http://localhost:5174/`: main menu rendered with canvas; Training screen rendered with roster canvases; live Naruto/Sasuke training fight rendered and accepted `p1:special`.
  - `npm test`: failed only on existing unrelated `allen-walker:jableft.onComboHitFrames` contextual frame-data assertion.

Continuation:
- Generated full all-candidate review set: `tmp/projectile-audit/all-candidate-review/batch-01.png` through `batch-42.png`, index at `tmp/projectile-audit/all-candidate-review/index.json`.
- These 42 sheets cover all 739 audit candidates sorted by character/move key. Review cursor starts at batch 01.
- Full-sheet review cursor:
  - Batches 01-04: no new approvals. Skipped attached weapon/body/aura motion and unclear mechanical poses.
  - Batch 05: approved `franky|kickleft` and `franky|kickright`; clear cyborg arm-cannon/blaster discharge frames matching Franky's One Piece identity.
  - Batches 06-18: no new approvals. Skipped Frieza/Goku/Gohan/Gotenks/Hiei/Kakashi/Kazuki/Kenshin/Kenshiro/Killua/Kinnikuman and similar entries where effects were attached slashes, rush trails, power-ups, or body movement.
  - Batch 19: no new approvals beyond already-applied `kiro|kickright`; skipped Kiro rush/attached chakra, Lenalee movement, and ambiguous tiny Buu effect.
  - Batch 20: no new approvals beyond already-applied Buu moves; skipped Buu/Luffy/Momotaro rushes, elastic body motion, and attached effects.
  - Batches 21-23: no new approvals beyond already-applied Nami Perfect moves; skipped route aliases of staff/fan spins and regular Nami attached staff effects.
- Pending continuation approvals not yet applied:
  - `franky`: `kickleft`, `kickright` -> expected `mechanical-blaster-projectile`.
- Batches 24-31: no new approvals. Skipped regular Nami staff effects, Kyubi Naruto cloak/tail rushes, Neuro hand energy, Nico Robin limb extensions, Pegasus Seiya wing/body rushes, Renji/Zoro/Rukia/Sakura/Sanji attached weapon arcs, Seto Kaiba card poses without a released card/bolt, and Sven suitcase/comic-panel mappings.
- Batch 32: approved `toshiro-hitsugaya|cmd:1+3`; clear horizontal ice/dragon beam leaving the sword and matching Toshiro's Bleach ice identity.
- Batch 33: approved Train pistol-shot aliases `cmd:d/f+2`, `cmd:f+2`, `cmd:FC+2`, and `cmd:WS+2`; each shows a warm muzzle flash/tracer leaving the gun.
- Batch 34: approved `train-heartnet|jabright`; clear pistol muzzle flash/tracer. Skipped Train neutral route aliases that show aim/draw poses without visible release.
- Batches 35-42: no new approvals. Skipped Train aim-only neutral aliases, Vegeta/Vegito attached ki rush arcs, Yoh weapon/summon slashes, Yugi non-release card poses, and Yusuke body-rush/kick frames.
- Full all-candidate sheet review completed through batch 42.
- Applied continuation approvals:
  - `franky`: `kickleft`, `kickright` -> `mechanical-blaster-projectile`.
  - `toshiro-hitsugaya`: `cmd:1+3` -> `ice-energy-projectile`.
  - `train-heartnet`: `jabright`, `cmd:d/f+2`, `cmd:f+2`, `cmd:FC+2`, `cmd:WS+2` -> `firearm-bullet-projectile`.
- Continuation assets generated:
  - `public/characters/franky/projectiles/mechanical-blaster-projectile/frames/frame-000.png` through `frame-002.png`.
  - Existing `toshiro-hitsugaya` and `train-heartnet` projectile asset families were regenerated/reused for the added bindings.
- Continuation validation:
  - Refreshed `tmp/projectile-audit/approved-candidates.json` to include all 27 projectile bindings.
  - `npm run typecheck`: passed.
  - `npx vitest run src/engine/fightEngine.test.ts`: passed, 283 tests.
  - Temporary roster smoke under `src/engine/projectileRosterSmoke.test.ts`: passed, 27/27 approved bindings spawned runtime projectiles and resolved frame assets; temporary file removed afterward.
  - `npm run build`: passed; Vite emitted existing large chunk warnings.
  - Browser/in-game smoke on `http://127.0.0.1:5174/`: selected Train Heartnet in Training, fired `p1:heavy`/`jabright`, hit registered, dummy HP changed 200 -> 191, canvas rendered nonblank, no browser console errors. Evidence saved under `tmp/projectile-audit/in-game-smoke/`.
  - `npm test`: still fails only on existing unrelated `allen-walker:jableft.onComboHitFrames` contextual combo frame-data assertion.

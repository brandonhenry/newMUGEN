# Granular Fix Planning Queue

This is a planning queue generated from the proof pass. It is not an edit script. Each item must be visually reviewed against the sheet/video before changing manifests.

## Rules For The Fix Pass

- Do not broad-normalize or auto-apply thresholds.
- Fix only frames that visibly break character body volume, centering, or crop correctness.
- Leave intentional reach, swords, projectiles, wide sprint poses, and effects alone when body size is stable.
- Use explicit `animationFrameScales[moveKey][frameIndex]` for isolated scale issues.
- Use uniform width/height unless an existing offset needs to be preserved.
- For bad crop / two-character frames, inspect source sheet and fix frame metadata/PNG/voxel before scale tuning.

## Kakashi Hatake (kakashi-hatake)
- `crouchBlock` frames 089, 090, 091, 092, 094, 095, 096, 097: tall-crouch-vs-idle. Visual review; likely false positive if body volume is stable.
- `getupStand` frames 034, 035, 036, 037, 052, 053, 054, 055: huge-prone-footprint-vs-idle-height, tiny-frame-vs-animation. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `knockdown` frames 034, 035, 036, 037: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `lose` frames 033: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.

## Jaguar Junichi (jaguar-junichi)
- `cmd:qcf+4` frames 184, 185, 186, 187, 188, 189, 190, 191, 192, 193: tiny-height-vs-idle, huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `getupStand` frames 052, 053, 054: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 031, 032, 033, 034, 037, 038: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Monkey D. Luffy (2nd Gear) (monkey-d-luffy-2nd-gear)
- `cmd:1+2` frames 081, 085: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `cmd:1+3` frames 093: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `cmd:3+4` frames 101, 102: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `cmd:f+1` frames 196: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `crouchBlock` frames 093: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 034: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `jableft` frames 078: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 031, 032, 033, 034, 037, 038: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Killua Zoldyck (killua-zoldyck)
- `getupStand` frames 053, 054, 055: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `jabright` frames 147, 148, 149: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 031, 032, 033, 034, 037, 038: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Train Heartnet (train-heartnet)
- `getupStand` frames 037: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `jabright` frames 083, 084: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `lose` frames 032: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 031, 032, 033, 034, 035, 036, 037, 038: wide-body-vs-idle, tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Sanji Vinsmoke (sanji-vinsmoke)
- `cmd:1+4` frames 143: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `cmd:2+4` frames 116: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 038: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 032, 033, 034, 035, 036, 037, 038: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation, possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Fuusuke (fuusuke)
- `crouchBlock` frames 096: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 032, 034: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sidestepLeft` frames 112: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `sidestepRight` frames 112: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `sprint` frames 030, 032, 034, 037, 038: tiny-height-vs-idle, wide-body-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Gon Freecss (gon-freecss)
- `getupStand` frames 033, 034, 036: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `jabright` frames 111: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `lose` frames 032: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 032, 034, 036, 037, 038: wide-body-vs-idle, tiny-height-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Nami (Perfect Clima-Tact) (nami-perfect-clima-tact)
- `cmd:1+2` frames 059: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 030, 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `jableft` frames 074: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 035, 036: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Vegeta (Super Saiyan) (vegeta-super-saiyan)
- `cmd:qcf+4` frames 174: low-color-frame. Visual review; likely false positive if body volume is stable.
- `getupStand` frames 030, 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `jabright` frames 082: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `kickright` frames 076: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 039: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Nico Robin (nico-robin)
- `backflip` frames 043: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 052, 053: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `jableft` frames 077, 078, 079: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `sprint` frames 033, 034, 035, 036: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Sakura Haruno (sakura-haruno)
- `getupStand` frames 030, 031, 032, 033: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 033, 036, 037: wide-body-vs-idle, tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Yugi Mutou (yugi-mutou)
- `getupStand` frames 035, 037: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 033, 034, 035, 036, 037, 038: tiny-height-vs-idle, wide-body-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Gohan (Super Saiyan 2) (gohan-super-saiyan-2)
- `getupStand` frames 030, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `kickleft` frames 081, 082: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 039: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Kenshiro (kenshiro)
- `cmd:f+1` frames 172, 175: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 038, 039: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `kickleft` frames 108, 111: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `knockdown` frames 039: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 035: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 035: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Monkey D. Luffy (monkey-d-luffy)
- `cmd:1+2` frames 070: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `cmd:2+4` frames 171, 165: possible-two-character-crop, low-color-frame. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `jableft` frames 074, 075, 078: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `sprint` frames 031, 032, 033: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Naruto Uzumaki (Nine-Tails_Kyubi) (naruto-uzumaki-nine-tails-kyubi)
- `cmd:f+1` frames 131, 132: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `hitHeavy` frames 169: low-color-frame. Visual review; likely false positive if body volume is stable.
- `knockdown` frames 034, 035: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 033: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 033, 034, 035: tiny-height-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Vegito (vegito)
- `getupStand` frames 030, 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `kickleft` frames 075: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 039: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## DIO (dio)
- `getupStand` frames 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 035, 036: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Goku (Super Saiyan) (goku-super-saiyan)
- `cmd:qcf+4` frames 183, 186: low-color-frame. Visual review; likely false positive if body volume is stable.
- `getupStand` frames 030, 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `kickright` frames 101: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 032: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Gotenks (Super Saiyan) (gotenks-super-saiyan)
- `getupStand` frames 030, 031, 032, 033: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 033: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Rukia Kuchiki (rukia-kuchiki)
- `getupStand` frames 031, 032, 033, 034: tiny-frame-vs-animation, possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `knockdown` frames 033: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `sprint` frames 030, 032, 033: tiny-height-vs-idle, possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Franky (franky)
- `cmd:1+2` frames 100, 101, 102: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `cmd:1+4` frames 100, 101, 102: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Frieza (frieza)
- `getupStand` frames 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 035, 036: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Gintoki Sakata (gintoki-sakata)
- `getupStand` frames 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 031, 032, 033, 036, 037: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Kenshin Himura (kenshin-himura)
- `getupStand` frames 052, 053, 054: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 031, 033, 037, 038: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Heihachi Edajima (heihachi-edajima)
- `jableft` frames 086: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 035, 036, 038: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Hiei (hiei)
- `getupStand` frames 032, 034: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 032, 034: tiny-height-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Kurama (kurama)
- `lose` frames 031: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 031, 032, 033, 034, 035: tiny-height-vs-idle, wide-body-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Pegasus Seiya (pegasus-seiya)
- `getupStand` frames 033: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030, 032, 034, 037: tiny-height-vs-idle, tiny-frame-vs-animation, wide-body-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Renji Abarai (renji-abarai)
- `cmd:qcf+4` frames 145, 146: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 032, 033, 034: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 032: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Ryotsu Kankichi (ryotsu-kankichi)
- `cmd:2+3` frames 113: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 030, 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 030, 035: wide-body-vs-idle, possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Taikoubou (taikoubou)
- `getupStand` frames 032, 033, 034, 035: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 031: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 031: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Yoh Asakura (yoh-asakura)
- `getupStand` frames 053, 054, 055: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `hitLight` frames 026: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `sprint` frames 035, 036: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Anna Kyoyama (anna-kyoyama)
- `cmd:qcf+4` frames 160, 161, 163: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `sprint` frames 030, 033: possible-two-character-crop, tiny-height-vs-idle, tiny-frame-vs-animation. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Arale Norimaki (arale-norimaki)
- `getupStand` frames 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 031: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 035, 036, 037: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Dr. Mashirito (dr-mashirito)
- `getupStand` frames 030: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 031, 034, 035: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `walkForward` frames 007: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Eve (eve)
- `lose` frames 031: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 031, 036, 038, 039: tiny-height-vs-idle, tiny-frame-vs-animation, wide-body-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Kazuki Muto (kazuki-muto)
- `getupStand` frames 038, 039: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 033: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 033, 038: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Kinnikuman (kinnikuman)
- `getupStand` frames 052, 053, 054: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 032: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 032: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Lenalee Lee (lenalee-lee)
- `getupStand` frames 033, 034, 035: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 031: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 031: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Momotaro Tsurugi (momotaro-tsurugi)
- `getupStand` frames 036, 037: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 038: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Bobobo-bo Bo-bobo (bobobo-bo-bo-bobo)
- `cmd:O+2` frames 168: low-color-frame. Visual review; likely false positive if body volume is stable.
- `getupStand` frames 032, 033, 034: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Ichigo Kurosaki (ichigo-kurosaki)
- `cmd:qcf+4` frames 162, 164: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `lose` frames 031: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 031: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Jotaro Kujo (jotaro-kujo)
- `getupStand` frames 035: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `sprint` frames 032, 033, 034: tiny-height-vs-idle, tiny-frame-vs-animation, wide-body-vs-idle. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Kagura (kagura)
- `getupStand` frames 032, 034: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `lose` frames 030: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.
- `sprint` frames 030: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Nami (nami)
- `getupStand` frames 030, 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Neuro Nogami (neuro-nogami)
- `cmd:f+1` frames 188: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `getupStand` frames 037, 038, 039: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Vegeta (vegeta)
- `getupStand` frames 030, 031, 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 029: huge-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Allen Walker (allen-walker)
- `cmd:1+2` frames 094: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `sprint` frames 012, 013: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Sasuke (riven)
- `jabright` frames 087: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.
- `sprint` frames 012, 013: wide-body-vs-idle. Visual review; likely false positive if body volume is stable.

## Gohan (Super Saiyan) (gohan-super-saiyan)
- `getupStand` frames 030, 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Goku (goku)
- `cmd:f+1` frames 160: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.
- `kickright` frames 105: possible-two-character-crop. Inspect crop first; if two characters/unrelated art are visible, repair frame crop and rebuild HD voxel.

## Gotenks (gotenks)
- `getupStand` frames 030, 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Yusuke Urameshi (yusuke-urameshi)
- `getupStand` frames 030: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.
- `knockdown` frames 030: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Don Patch _ Poppa Rocks (don-patch-poppa-rocks)
- `lose` frames 034: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.

## Raoh (raoh)
- `getupStand` frames 032: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Roronoa Zoro (roronoa-zoro)
- `getupStand` frames 031: tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Tōshirō Hitsugaya (toshiro-hitsugaya)
- `sprint` frames 030: tiny-height-vs-idle, tiny-frame-vs-animation. Compare against idle and neighboring frames; apply per-frame uniform scale only for visible body pop.

## Yoh Asakura (Power Sword) (yoh-asakura-power-sword)
- `lose` frames 027: huge-prone-footprint-vs-idle-height. Review prone/getup/lose footprint against idle height; apply per-frame uniform scale only if body reads too large/small.

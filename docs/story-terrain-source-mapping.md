# Story terrain source-cell mapping

Story terrain is rendered as 32×32 nearest-neighbor runtime tiles. Most sources use 16×16 cells; Kings and Pigs and Moon Graveyard use native 32×32 cells. Coordinates below are zero-based `(column,row)` cells in each source atlas. The generated machine-readable expansion for every runtime role is in [`public/story/worlds/terrain-kits/source-mapping.json`](../public/story/worlds/terrain-kits/source-mapping.json).

## Reviewed biome cells

| Biome / theme | Source atlas | Fill variants | Top variants | Left | Right | Top-left | Top-right | Bottom variants | Bottom-left | Bottom-right |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Greenhollow / village | `gothic-town/tileset.png` | `(3,2)`, `(4,2)`, `(6,2)` | `(3,10)`, `(4,10)`, `(5,10)` | `(1,2)`, `(1,3)`, `(1,4)` | `(8,2)`, `(8,3)`, `(8,4)` | `(1,10)` | `(5,10)` | `(3,4)`, `(4,4)`, `(6,4)` | `(1,4)` | `(9,4)` |
| Thornwood / forest | `thornwood/tileset.png` | `(4,4)`, `(5,4)`, `(6,4)` | `(4,2)`, `(5,2)`, `(6,2)` | `(3,3)`, `(3,4)`, `(3,3)` | `(8,2)` | `(3,2)` | `(8,2)` | `(4,5)`, `(5,5)`, `(6,5)` | `(4,5)` | `(6,5)` |
| Ironroot / mine | `warped-caves/tileset.png` | `(3,4)`, `(5,4)`, `(3,4)` | `(3,3)`, `(5,3)`, `(3,3)` | `(2,4)` | `(6,4)` | `(2,3)` | `(6,3)` | `(3,4)`, `(5,4)`, `(3,4)` | `(2,4)` | `(6,4)` |
| Bonevault / crypt | `gothic-cemetery/tileset.png` | `(20,6)`, `(21,6)`, `(23,6)` | `(20,5)`, `(21,5)`, `(23,5)` | `(18,6)` | `(24,6)` | `(18,5)` | `(24,5)` | `(20,7)`, `(21,7)`, `(23,7)` | `(18,7)` | `(24,7)` |
| Emberdeep / underworld | `emberdeep/tileset.png` | `(3,4)`, `(5,4)`, `(3,4)` | `(3,3)`, `(5,3)`, `(3,3)` | `(2,4)` | `(6,4)` | `(2,3)` | `(6,3)` | `(3,4)`, `(5,4)`, `(3,4)` | `(2,4)` | `(6,4)` |
| Frostpeak / snow | `sunnyland-winter/tileset.png` | `(2,2)`, `(3,2)`, `(7,2)` | `(2,1)`, `(3,1)`, `(7,1)` | `(1,2)` | `(4,2)` | `(1,1)` | `(4,1)` | `(2,3)`, `(3,3)`, `(7,3)` | `(1,3)` | `(4,3)` |
| Sunscar / desert | `yeehaw/tileset.png` | `(1,5)`, `(2,5)`, `(3,5)` | `(1,4)`, `(2,4)`, `(3,4)` | `(0,5)` | `(4,5)` | `(0,4)` | `(4,4)` | `(1,6)`, `(2,6)`, `(3,6)` | `(0,6)` | `(4,6)` |
| Skyglass / ruins | `skyglass/tileset.png` | `(3,3)`, `(4,3)`, `(3,4)` | `(3,1)`, `(4,1)`, `(3,1)` | `(1,2)`, `(1,3)`, `(1,4)` | `(6,2)`, `(6,3)`, `(6,4)` | `(1,1)` | `(6,1)` | `(3,4)`, `(4,4)`, `(3,4)` | `(1,5)` | `(6,5)` |

Repeated coordinates are deliberate. Some packs expose two painted interior/cap variants rather than three; repeating a reviewed material cell is safer than sampling a decorative or transparent neighbor.

## Reviewed alternate-set cells

| Biome / visual set | Cell size | Source atlas | Fill variants | Top variants | Left | Right | Top-left | Top-right | Bottom variants | Bottom-left | Bottom-right |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Greenhollow / Kings and Pigs | 32 | `kings-pigs/terrain.png` | `(7,1)`, `(8,1)`, `(7,2)` | `(1,1)`, `(2,1)`, `(3,1)` | `(1,2)` | `(3,2)` | `(1,1)` | `(3,1)` | `(1,3)`, `(2,3)`, `(3,3)` | `(1,3)` | `(3,3)` |
| Thornwood / Pixel Adventure | 16 | `pixel-thornwood/terrain.png` | `(6,1)`, `(7,1)`, `(8,1)` | `(6,0)`, `(7,0)`, `(8,0)` | `(6,1)` | `(10,1)` | `(6,0)` | `(8,0)` | `(6,2)`, `(7,2)`, `(8,2)` | `(6,2)` | `(8,2)` |
| Ironroot / Grafx Cave | 16 | `grafx-cave/gray-terrain.png` | `(10,7)`, `(11,7)`, `(12,7)` | `(10,6)`, `(11,6)`, `(12,6)` | `(6,7)` | `(15,7)` | `(6,6)` | `(15,6)` | `(12,8)`, `(13,8)`, `(12,8)` | `(12,8)` | `(13,8)` |
| Bonevault / Moon Graveyard | 32 | `moon-graveyard/tiles.png` | `(1,3)`, `(3,3)`, `(1,4)` | `(1,0)`, `(2,0)`, `(3,0)` | `(0,3)`, `(0,4)`, `(0,5)` | `(4,3)`, `(4,4)`, `(4,5)` | `(0,2)` | `(4,2)` | `(1,6)`, `(2,6)`, `(3,6)` | `(1,6)` | `(3,6)` |
| Emberdeep / Grafx Ember | 16 | `grafx-ember/gray-terrain.png` | `(10,7)`, `(11,7)`, `(12,7)` | `(10,6)`, `(11,6)`, `(12,6)` | `(6,7)` | `(15,7)` | `(6,6)` | `(15,6)` | `(12,8)`, `(13,8)`, `(12,8)` | `(12,8)` | `(13,8)` |
| Frostpeak / Seasonal | 16 | `seasonal/snow-terrain.png` | `(3,3)`, `(4,3)`, `(5,3)` | `(3,1)`, `(4,1)`, `(5,1)` | `(1,3)`, `(1,4)`, `(1,3)` | `(7,3)`, `(7,4)`, `(7,3)` | `(3,1)` | `(5,1)` | `(3,6)`, `(4,6)`, `(5,6)` | `(3,6)` | `(5,6)` |
| Sunscar / Pixel Adventure | 16 | `pixel-sunscar/terrain.png` | `(6,5)`, `(7,5)`, `(8,5)` | `(6,4)`, `(7,4)`, `(8,4)` | `(6,5)` | `(10,5)` | `(6,4)` | `(8,4)` | `(6,6)`, `(7,6)`, `(8,6)` | `(6,6)` | `(8,6)` |
| Skyglass / Space Cave | 16 | `space-skyglass/tileset.png` | `(3,9)`, `(0,9)`, `(3,9)` | `(0,3)`, `(1,3)`, `(2,3)` | `(0,4)`, `(0,5)`, `(0,4)` | `(2,4)`, `(2,5)`, `(2,4)` | `(0,3)` | `(2,3)` | `(0,5)`, `(1,5)`, `(2,5)` | `(0,5)` | `(2,5)` |

The generator selects one visual-set ID once per floor. That ID fixes the terrain kit, environment layers, surface atlas, and permitted semantic-prop family for every room on the floor. Adjacent depths alternate primary and backup sets, with the run seed determining which set appears first. No per-room asset-family roll occurs.

## Runtime role mapping

| Runtime role | Source semantic | Additional treatment |
| --- | --- | --- |
| `fill` | fill | Hidden edges sealed to the matching fill variant |
| `top` | top | Source-painted walkable cap |
| `neutral-top` | fill | Inferred top seam for enclosed solid boundaries |
| `neutral-top-left`, `neutral-top-right` | left / right | Inferred top seam |
| `underside` | bottom | Source-painted underside cell where supplied |
| `left-wall`, `right-wall` | left / right | Source-painted wall edge |
| `outer-top-left`, `outer-top-right` | top-left / top-right | Source-painted outer corner |
| `outer-bottom-left`, `outer-bottom-right` | bottom-left / bottom-right | Source-painted lower corner |
| `inner-top-left`, `inner-top-right`, `inner-bottom-left`, `inner-bottom-right` | fill | Inferred concave seams over the matching material cell |
| `connector-lip` | top | Source cap plus left/right connector seams |
| `background-rock` | fill | Darkened cavity treatment |
| `sky-window-edge` | fill | Biome sky fill plus material edge |
| `secret-overlay`, `damage-overlay` | fill | Semantic marker or crack over the matching material cell |

Every generated frame also records `sourceCell`, pixel `sourceFrame`, `sourceSemantic`, and `mappingTreatment` in `src/story/storyTerrainKitManifest.json`. The build fails if a coordinate is out of bounds, fully transparent, or does not match its declared 16×16 or 32×32 source frame.

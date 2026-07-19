# Story terrain source-cell mapping

Story terrain is built on a 16×16 source grid and rendered as 32×32 nearest-neighbor runtime tiles. Coordinates below are zero-based `(column,row)` cells in each source atlas. The generated machine-readable expansion for every runtime role is in [`public/story/worlds/terrain-kits/source-mapping.json`](../public/story/worlds/terrain-kits/source-mapping.json).

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

Every generated frame also records `sourceCell`, pixel `sourceFrame`, `sourceSemantic`, and `mappingTreatment` in `src/story/storyTerrainKitManifest.json`. The build fails if a coordinate is out of bounds, fully transparent, or does not match its declared 16×16 source frame.

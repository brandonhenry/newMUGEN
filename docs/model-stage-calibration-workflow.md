# Model Stage Calibration Workflow

## Reference

Use `Karakura Town Intersection` as the first visual reference for model-stage sizing and lane placement.

- Stage id: `bleach-bleach-soul-reaper-karakura-town-intersection`
- Model transform: `position [0, -1.85, 0]`, `scale [8, 8, 8]`, `rotation [0, 0, 0]`
- Fight lane: `center [0.25, 0, -3.1]`, `width 10`, `depth 7`, `rotationY 0`
- Spawns derive from the fight lane and should not be hand-edited unless the lane derivation is wrong.

## Calibration Loop

1. Start local dev with `npm run dev` and open `http://localhost:5173/`.
2. From the title screen, enter the main menu, then open `Stages`.
3. Select the stage from the `Stage` dropdown.
4. Turn on `Show Controls`, select `Stage Model`, and inspect model X/Y/Z and scale.
5. Switch to `Play`, enable `Test Fighters`, and judge the actual fight view.
6. If the stage is too small, increase model scale first. Use Karakura/Hidden Leaf as the target feel.
7. If fighter feet do not sit on the intended floor, adjust model Y and use `Bottom To Feet` only as a starting point.
8. Open `Change Center Lane` and adjust center X/Z/Y so the fighters stand on the best playable flat area.
9. Adjust yaw toward the clearest straight road, bridge, seam, arena axis, or floor grid. Leave yaw at `0` when there is no clear visual axis.
10. Keep lane width/depth at `10 x 7` unless the map clearly needs a wider or narrower playable strip.
11. Click `Save Stage`, then reload/reselect the stage and confirm `stage.json` and `manifest.json` still match.

## Status Labels

- `pass`: characters stand on the intended floor, the map reads at good scale, and yaw/center are usable.
- `needs yaw review`: scale and feet are acceptable, but the map has a visible straight line that should be aligned better.
- `bad floor`: model loads, but the current fight lane is not on a believable walkable surface.
- `too small`: model loads, but the world scale makes characters look too large for the stage.
- `source/model issue`: the model is blank, mostly sky/background, missing important geometry, or cannot be fixed with manifest transforms alone.

## First Batch Result

- `Karakura Town Intersection`: `pass`; reference transform preserved.
- `Seireitei Bridge`: `pass`; scale and yaw already put fighters on the bridge tiles.
- `Other World Tournament`: `pass`; playable view is usable at current scale.
- `Hospital Room`: `source/model issue`; Play view shows no visible room geometry, only the sky/background color.
- `West City`: `bad floor`; model loads, but the current fight lane is not centered on a clear street or walkable surface.

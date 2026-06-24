# newMUGEN Character Standard

Characters live in `public/characters/{characterId}/` and are discovered from `public/characters/index.json`.

## Required Files

- `character.json`: Manifest for stats, model loading, moves, hitboxes, colors, and AI.
- `sprite-sheet.svg`, `sprite-sheet.png`, or `source.png`: Local 2D source art for `spriteVoxel` fighters.
- `model.glb` or `model.gltf`: Optional external character model for `glb` fighters. Characters may also use `builtin://{id}` for the bundled low-poly renderer.
- Portrait/select images are optional for v1. If missing, the character select screen renders a styled initials plate.

## Manifest Shape

```json
{
  "id": "myfighter",
  "displayName": "My Fighter",
  "renderMode": "spriteVoxel",
  "modelPath": "spritevoxel://myfighter",
  "spriteSheetPath": "/characters/myfighter/sprite-sheet.svg",
  "voxelProfile": "shinobi-orange",
  "scale": 1,
  "cameraOffset": [0, 1.2, 0],
  "stats": {
    "health": 100,
    "speed": 5,
    "sidestepSpeed": 4,
    "jumpForce": 8,
    "gravity": 18
  },
  "animations": {
    "idle": "idle",
    "walkForward": "walkForward",
    "walkBack": "walkBack",
    "sidestepLeft": "sidestepLeft",
    "sidestepRight": "sidestepRight",
    "crouch": "crouch",
    "jump": "jump",
    "block": "block",
    "jab": "jab",
    "kick": "kick",
    "heavy": "heavy",
    "special": "special",
    "hitLight": "hitLight",
    "hitHeavy": "hitHeavy",
    "knockdown": "knockdown",
    "win": "win",
    "lose": "lose"
  },
  "moves": [],
  "hurtboxes": [],
  "inputMap": {},
  "colors": {
    "primary": "#ffffff",
    "secondary": "#222222",
    "accent": "#ffcc00"
  },
  "aiProfile": {
    "aggression": 0.6,
    "guard": 0.4,
    "spacing": 1.5,
    "specialChance": 0.2
  }
}
```

`renderMode` can be:

- `spriteVoxel`: Uses local 2D source art and renders a chunky voxelized 3D fighter in the browser. Use `modelPath: "spritevoxel://{id}"`, `spriteSheetPath`, and `voxelProfile`.
- `glb`: Loads `model.glb` or `model.gltf`.
- `procedural`: Uses the built-in low-poly fallback renderer.

`voxelProfile` can be:

- `shinobi-orange` or `shinobi-blue`: Uses the built-in articulated voxel body with a fixed palette.
- `image-source`: Loads `spriteSheetPath`, removes blue-screen/background pixels, downsamples the remaining silhouette into voxel boxes, and groups the extracted pixels into head, torso, arms, and legs for procedural combat animation. This works best with a full-body T-pose or wide stance on a flat, high-contrast background.

## Move Timing

Move timing is in seconds. Total animation lock is `startup + active + recovery`.

- `startup`: Wind-up before a move can hit.
- `active`: Time window where the hitbox can connect.
- `recovery`: Time before the fighter can act again.
- `damage`: Health removed on hit.
- `blockDamage`: Chip damage when blocked.
- `range`: Distance helper used by AI.
- `push`: Knockback distance.
- `hitstun`: How long the opponent is locked after impact.
- `knockdown`: Whether the opponent enters the knockdown state.

Hitboxes are authored in character-local coordinates:

```json
{
  "offset": [0, 1.1, 0.65],
  "size": [0.75, 0.5, 0.6]
}
```

`z` points toward the opponent, `y` is vertical, and `x` is sidestep/lane width.

## Animation Requirements

External GLB/GLTF characters should include clips named:

`idle`, `walkForward`, `walkBack`, `sidestepLeft`, `sidestepRight`, `crouch`, `jump`, `block`, `jab`, `kick`, `heavy`, `special`, `hitLight`, `hitHeavy`, `knockdown`, `win`, `lose`.

If a clip is missing, the game falls back to a safe default pose and the character viewer reports a loader warning. This lets roster work continue before every animation is final.

Sprite-voxel characters do not require authored GLB clips. Built-in palette profiles map combat states to procedural voxel limb animation. `image-source` profiles derive the visible voxel silhouette and colors directly from the character source image, then animate extracted body-part groups.

## Adding A Character

1. Create `public/characters/{id}/`.
2. Add `character.json` plus either a sprite sheet for `spriteVoxel` or a GLB/GLTF model for `glb`.
3. Add the id to `public/characters/index.json`.
4. Launch the app, open Character Viewer, and check loader warnings, scale, colors, hurtboxes, and moves.

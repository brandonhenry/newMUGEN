# Adventure entrance generation record

The existing `biome-doors.png` atlas was the sole visual reference. It supplied only pixel density, outline weight, readable side-view silhouette, and biome palette language; no reference pixels were copied. The built-in OpenAI image generation mode was used, followed by `remove_chroma_key.py` with a flat `#ff00ff` key, soft matte, despill, and nearest-neighbor frame normalization.

## Normal biome doors

Create a production-ready 1536×1024 pixel-art atlas on flat `#ff00ff`, with exactly 24 isolated ordinary doors in a strict 6×4 grid of 256×256 cells. The doors must be visibly smaller and simpler than hero gates, consistently scaled, hard-edged, side-view, functional, and free of labels, characters, scenery, or cast shadows.

The requested order was: Greenhollow timber cottage, mill service, and brick waterworks doors; Thornwood rootkeeper hut, herbalist cellar, and rope-lashed canopy doors; Ironroot mine shed, lift maintenance, and riveted bulkhead doors; Bonevault keeper chamber, ossuary side, and bell stair doors; Emberdeep ash camp, forge service, and heat vent doors; Frostpeak insulated shelter, ice cave, and frozen watch doors; Sunscar caravan storage, oasis cellar, and half-buried ruin doors; Skyglass landing kiosk, broken tower, and bridge maintenance doors.

## Shifting Depth entrances

Create a production-ready 1536×1024 pixel-art atlas on flat `#ff00ff`, with exactly eight isolated dangerous subterranean entrances in a strict 4×2 grid of 384×512 cells. The requested order was: Greenhollow storm drain, Thornwood root tunnel, Ironroot mine adit, Bonevault ossuary stair, Emberdeep heat vent, Frostpeak ice crevasse, Sunscar excavation, and Skyglass crystal maintenance hatch. Every entrance needed a dark walkable opening and biome-functional construction details.

## Mount sanctuary entrances

Create a production-ready 1536×1024 pixel-art atlas on flat `#ff00ff`, with exactly eight isolated peaceful ceremonial thresholds in a strict 4×2 grid of 384×512 cells. The requested order was: Greenhollow mill garden, Thornwood willow circle, Ironroot brass lift-house, Bonevault memorial cloister, Emberdeep master-smith sanctuary, Frostpeak warm trail shelter, Sunscar oasis pavilion, and Skyglass crystal observatory. Every entrance needed a calm readable opening and a safe, occupation-aware silhouette rather than dungeon language.

All prompts additionally required original side-view 2D anime-adventure pixel art, restrained biome palettes, strong dark outlines, nearest-neighbor pixels, no antialiasing or photorealism, no text or logos, and no objects crossing cell boundaries.

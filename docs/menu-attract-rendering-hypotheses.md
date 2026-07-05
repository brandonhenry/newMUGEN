# Menu Attract Rendering Hypotheses

Goal: keep the main menu attract fight visually faithful while preserving smooth local and live performance.

| # | Hypothesis | Evidence | Decision |
| --- | --- | --- | --- |
| 1 | The menu looked wrong because it used procedural placeholder fighters. | `MenuAttractScene` passed `preferProcedural` to both fighters. | Removed `preferProcedural`; menu uses normal voxel fighter rendering. |
| 2 | The menu looked wrong because it used a fake flat arena. | `MenuAttractScene` rendered `MenuAttractArenaLite`. | Removed the lite arena; menu uses real `Arena`. |
| 3 | The menu avoided real 3D stages. | `pickMenuAttractStage` filtered out model stages. | Menu now prefers visible real GLB stages. |
| 4 | The first real model stage was too heavy for background use. | Konohagakure entrance GLB is about 21 MB and failed menu p95 pacing. | Prefer smaller visible model stages first. |
| 5 | Voxel holes came from runtime LOD, not missing HD assets. | HD JSON loaded, but `getImageVoxelLodStep` rendered every third voxel. | Restored HD voxel density with `lodStep = 1`. |
| 6 | Full HD voxel density was expensive because the renderer merged thousands of cloned box geometries. | `buildInstancedVoxelMesh` name hid a merge-geometry implementation. | Replaced with true `THREE.InstancedMesh`. |
| 7 | Optional smoke effects could blank the menu. | Missing `/effects/shadow-clone-smoke.png` crashed hidden menu capture. | Removed transform/shadow-clone smoke layers from menu attract. |
| 8 | Cosmetic passes can be reduced without losing core visual identity. | Contact shadows/postprocessing were not required to prove real stage + HD voxels. | Menu keeps real assets but uses lower DPR and no heavy post pass. |
| 9 | React publish frequency can cause avoidable work. | Menu simulation published snapshots at 20 Hz. | Reduced menu snapshot publishing to 12 Hz while Canvas still renders continuously. |
| 10 | Tests must fail if visual fidelity regresses. | Speed-only tests allowed fake arena/procedural fighters. | Perf test now requires a stage GLB request and voxel JSON requests. |

# Recovery / Juggle Footprint Audit

Scope:

- Playable characters with idle animations.
- Excluded `unplayable: true`, no-idle characters, and `near` per the prior normalization scope.
- Audited keys: `juggle`, `knockdown`, `getupStand`, `getupRollUp`, `getupRollDown`, `getupRollBack`, `lose`, `hitLight`, `hitHeavy`.

Rule:

- Prone/lying frames use idle height as the footprint reference.
- The prone width should land near the character's idle height.
- Upright recovery/juggle/reaction frames should stay near idle height.
- Frame scale should remain uniform (`width === height`) so the original sprite aspect is not distorted.

Result:

- Initial audit found 221 outlier frame uses across 41 characters.
- Applied explicit uniform `animationFrameScales` for those outliers.
- Reran the same audit and got 0 remaining candidates.
- Verified 0 non-uniform scale entries remain on used audited-frame keys.

Proof:

- Candidate audit: `tmp/voxel-scale-editor/recovery-footprint-audit/index.html`
- Refreshed ghost sheets:
  - `tmp/voxel-scale-editor/family-ghost-sheets/airborne.html`
  - `tmp/voxel-scale-editor/family-ghost-sheets/proneRecovery.html`
  - `tmp/voxel-scale-editor/family-ghost-sheets/reactions.html`
  - `tmp/voxel-scale-editor/family-ghost-sheets/proof-all.html`

export type Vec3Tuple = [number, number, number];

export const ROUNDS_TO_WIN = 3;

export type ActionName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'dashForward'
  | 'dashBack'
  | 'sidestepUp'
  | 'sidestepDown'
  | 'sidewalkUp'
  | 'sidewalkDown'
  | 'jump'
  | 'jab'
  | 'kick'
  | 'heavy'
  | 'special'
  | 'charge'
  | 'block'
  | 'confirm'
  | 'back'
  | 'pause'
  | 'lockTarget'
  | 'cycleTargetUp'
  | 'cycleTargetDown';

export type FighterState =
  | 'idle'
  | 'walk'
  | 'sidestep'
  | 'crouch'
  | 'crouchBlock'
  | 'jump'
  | 'block'
  | 'chargeKi'
  | 'transform'
  | 'attack'
  | 'throwHold'
  | 'throwHeld'
  | 'hit'
  | 'juggle'
  | 'knockdown'
  | 'getup'
  | 'entry'
  | 'win'
  | 'lose';

export type MoveInput = 'jab' | 'kick' | 'heavy' | 'special';
export type GetupAction = 'none' | 'stand' | 'rollUp' | 'rollDown' | 'rollBack';
export type GetupFrameOverrides = Partial<Record<Exclude<GetupAction, 'none'>, number>>;
export type HitLevel = 'high' | 'mid' | 'low' | 'throw' | 'special';
export type MoveTracking = 'none' | 'weakLeft' | 'weakRight' | 'medium' | 'strong' | 'homing';
export type CombatPopupKind = 'combo' | 'punish' | 'whiffPunish' | 'counterHit' | 'clashWin' | 'clashDraw' | 'clashPerfect';
export type ImpactSparkKind = 'hit' | 'block' | 'punish' | 'whiffPunish' | 'counterHit' | 'clash';
export type ImpactSparkShape = 'voxel-burst' | 'sharp-spark' | 'heavy-burst' | 'white-ink' | 'burst' | 'ring' | 'shards';
export type MovementSmokeStyle = 'speed-trail' | 'soft-puff' | 'burst-puff' | 'dust-ring';

export type ClashParticipantState = {
  progress: number;
  inputs: MoveInput[];
  completedFrame: number | null;
  failed: boolean;
  mistakes: number;
  lastInput: MoveInput | null;
};

export type ClashState = {
  id: number;
  status: 'none' | 'intro' | 'input' | 'result';
  sequence: MoveInput[];
  elapsedFrames: number;
  introFrames: number;
  inputFrames: number;
  resultFrames: number;
  winnerSlot: 1 | 2 | null;
  damage: number;
  contactPoint: Vec3Tuple;
  p1: ClashParticipantState;
  p2: ClashParticipantState;
};

export type BoxSpec = {
  offset: Vec3Tuple;
  size: Vec3Tuple;
};

export type MoveDefinition = {
  id: string;
  label: string;
  description?: string;
  input: MoveInput;
  command?: string;
  notation?: string;
  animationKey?: string;
  comboKey?: string;
  comboStep?: number;
  route?: string;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  startup?: number;
  active?: number;
  recovery?: number;
  damage: number;
  blockDamage: number;
  hitLevel: HitLevel;
  onBlockFrames: number;
  onHitFrames: number;
  onCounterHitFrames: number;
  onComboHitFrames?: number;
  onJuggleHitFrames?: number;
  comboRepeatPenaltyFrames?: number;
  juggleRepeatPenaltyFrames?: number;
  counterHit?: boolean;
  counterHitStunBonusFrames?: number;
  whiffRecoveryFrames?: number;
  range: number;
  forwardForce?: number;
  forwardForceStartFrame?: number;
  forwardForceEndFrame?: number;
  jumpBeforeMove?: boolean;
  moveJumpForce?: number;
  moveJumpGravity?: number;
  homingSpeed?: number;
  pushback: number;
  blockPushback: number;
  push?: number;
  hitstun?: number;
  launchHeight?: number;
  launchVelocity?: number;
  juggleRefloatVelocity?: number;
  juggleGravityScale?: number;
  tornado?: boolean;
  throwCapture?: boolean;
  throwSideSwap?: boolean;
  lotusCaptureStarter?: boolean;
  lotusCaptureFinisher?: boolean;
  endsInCrouch?: boolean;
  holdable?: boolean;
  cancelable?: boolean;
  tracking: MoveTracking;
  armorStartFrame?: number | null;
  armorEndFrame?: number | null;
  cancelWindows?: Array<{ startFrame: number; endFrame: number; into?: MoveInput[] }>;
  knockdown: boolean;
  hitbox: BoxSpec;
  hurtboxes?: BoxSpec[];
  hurtboxOffset?: Vec3Tuple;
  usesKi?: boolean;
  kiCost?: number;
  kiBurst?: boolean;
  healsHp?: boolean;
  healAmount?: number;
  /** Utility activation: stop the non-owner simulation for this many owner-action frames. */
  timeStopFrames?: number;
  soundCues?: EffectSoundCue[];
};

export type CombatPopupEvent = {
  id: number;
  slot: 1 | 2;
  kind: CombatPopupKind;
  hits: number;
  damage: number;
  moveLabel: string;
  moveInput?: MoveInput;
  moveCommand?: string;
  hitLevel?: HitLevel;
  launched?: boolean;
  juggled?: boolean;
  tornado?: boolean;
  kiBurst?: boolean;
};

export type ImpactSparkEvent = {
  id: number;
  kind: ImpactSparkKind;
  position: Vec3Tuple;
  attackerSlot: 1 | 2;
  defenderSlot: 1 | 2;
  direction?: 1 | -1;
  hitLevel: HitLevel;
  damage: number;
  moveLabel: string;
  moveInput?: MoveInput;
  moveCommand?: string;
  comboHits?: number;
  launched?: boolean;
  juggled?: boolean;
  tornado?: boolean;
  kiBurst?: boolean;
};

export type RoundFinisherState = {
  attackerSlot: 1 | 2;
  defenderSlot: 1 | 2;
  impactId: number;
  impactPosition: Vec3Tuple;
  duration: number;
  elapsed: number;
  cameraZoomScale: number;
};

export type MatchTimeStopRuntime = {
  ownerSlot: 1 | 2;
  framesRemaining: number;
  totalFrames: number;
};

export type MoveOverride = Partial<Omit<MoveDefinition, 'id' | 'input' | 'hitbox'>> & {
  id?: string;
  input?: MoveInput;
  hitbox?: Partial<BoxSpec>;
};

export type SpriteFrameEdit = {
  index: number;
  path?: string;
  sourceMode?: 'sheet' | 'replacement';
  sheetId?: string;
  sheetPath?: string;
  sourceName?: string;
  replacementName?: string;
  replacementWidth?: number;
  replacementHeight?: number;
  box: [number, number, number, number];
  width: number;
  height: number;
  row?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  offset?: [number, number];
  scale?: number;
  hidden?: boolean;
  revision?: number;
};

export type CharacterSpriteSheet = {
  id: string;
  name: string;
  path: string;
  frameStart: number;
  frameCount: number;
};

export type EffectBlendMode = 'normal' | 'additive' | 'screen';
export type EffectAnchor = 'body' | 'head' | 'hands' | 'feet' | 'hitbox' | 'world';
export type ProceduralEffectKind = 'lightning' | 'wind' | 'ring' | 'glow' | 'trail' | 'shards';

export type EffectTransform = {
  position: Vec3Tuple;
  scale: Vec3Tuple;
  rotation: Vec3Tuple;
  opacity: number;
  color: string;
};

export type EffectKeyframe = Partial<EffectTransform> & {
  frame: number;
  endFrame?: number;
};

export type EffectSoundCue = {
  id: string;
  name: string;
  path: string;
  frame: number;
  volume: number;
  pitch: number;
  pan: number;
  retrigger?: boolean;
};

export type CharacterVoiceDefinition = {
  hit?: string[];
  attackLand?: string[];
  launcher?: string[];
  tornado?: string[];
  win?: string[];
  stageIntro?: string[];
  shadowClone?: string[];
};

export type ProceduralEffectLayer = {
  id: string;
  kind: ProceduralEffectKind;
  color: string;
  intensity: number;
  size: number;
  count?: number;
};

export type CharacterEffectDefinition = {
  id: string;
  name: string;
  spriteSheetPath?: string;
  frames?: string[];
  effectFrameEdits?: Record<string, SpriteFrameEdit>;
  fps: number;
  loop: boolean;
  billboard: boolean;
  blendMode: EffectBlendMode;
  anchor: EffectAnchor;
  defaultTransform: EffectTransform;
  proceduralLayers?: ProceduralEffectLayer[];
  soundCues?: EffectSoundCue[];
};

export type MoveEffectInstance = {
  id: string;
  effectId: string;
  label?: string;
  hitbox?: BoxSpec;
  startFrame: number;
  endFrame?: number;
  layer: number;
  mirrorWithFacing: boolean;
  anchor?: EffectAnchor;
  loop?: boolean;
  keyframes: EffectKeyframe[];
  soundCues?: EffectSoundCue[];
};

export type ProjectileAnimationPhase = 'startup' | 'active' | 'recovery';

export type ProjectileAnimationFrames = Partial<Record<ProjectileAnimationPhase, string[]>>;
export type ProjectileKind = 'projectile' | 'blast';

export type BlastVisualDefinition = {
  coreColor?: string;
  glowColor?: string;
  outerColor?: string;
  impactColor?: string;
  radius?: number;
  growFrames?: number;
  fadeFrames?: number;
  shake?: number;
};

export type CharacterProjectileDefinition = {
  id: string;
  name: string;
  kind?: ProjectileKind;
  spriteSheetPath?: string;
  sourcePath?: string;
  frames?: string[];
  animationFrames?: ProjectileAnimationFrames;
  fps: number;
  loop: boolean;
  billboard: boolean;
  blendMode: EffectBlendMode;
  voxelProfile?: 'image-source' | 'hd-image-source';
  voxelFidelity?: VoxelFidelitySettings;
  defaultScale: Vec3Tuple;
  defaultRotation: Vec3Tuple;
  alignToVelocity?: boolean;
  color?: string;
  blastVisual?: BlastVisualDefinition;
  soundCues?: EffectSoundCue[];
  proceduralLayers?: ProceduralEffectLayer[];
};

export type ProjectileHomingMode = 'none' | 'limited';
export type ProjectileTargetMode = 'forward' | 'targetLocation';
export type ProjectileDeliveryMode = 'additional' | 'replaceMoveHit';

export type MoveProjectileInstance = {
  id: string;
  projectileId: string;
  kind?: ProjectileKind;
  label?: string;
  spawnFrame?: number;
  spawnOffset: Vec3Tuple;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  lifetimeFrames: number;
  speed: number;
  forwardVelocity: number;
  verticalVelocity?: number;
  gravity?: number;
  repeatStartFrame?: number;
  repeatEveryFrames?: number;
  repeatLimit?: number;
  blastRange?: number;
  homingMode: ProjectileHomingMode;
  homingStrength: number;
  homingTurnRate: number;
  homingEndFrame?: number;
  nearMissRadius: number;
  targetMode?: ProjectileTargetMode;
  hitbox: BoxSpec;
  damageScale: number;
  blockDamageScale: number;
  pushbackScale: number;
  blockPushbackScale: number;
  mirrorWithFacing: boolean;
  delivery?: ProjectileDeliveryMode;
  pierce?: boolean;
  clash?: boolean;
  kiBurst?: boolean;
  releaseGated?: boolean;
  chargeFramesMax?: number;
  minDamageScale?: number;
  maxDamageScale?: number;
};

export type VoxelFidelitySettings = {
  resolutionScale?: number;
  maxRows?: number;
  depth?: number;
  alphaThreshold?: number;
  paletteSnap?: number;
  mergeRuns?: boolean;
  normalization?: {
    enabled?: boolean;
    referenceFrame?: number;
    minScale?: number;
    maxScale?: number;
  };
  lod?: {
    mobileStep?: number;
    farStep?: number;
  };
};

export type AnimationScale = {
  width?: number;
  height?: number;
  /** Prone-only correction for legacy HD voxels shared with non-prone animations. */
  voxelScaleX?: number;
  /** Prone-only correction for legacy HD voxels shared with non-prone animations. */
  voxelScaleY?: number;
  offsetX?: number;
  flipX?: boolean;
  flipY?: boolean;
};

export type CharacterModelScale = {
  width?: number;
  height?: number;
};

export type AttackCompanionDefinition = {
  id: string;
  displayName: string;
  animations: Record<string, string[]>;
  moveAnimations: Record<string, string>;
  inputFallbacks?: Partial<Record<MoveInput, string>>;
  animationFrameRates?: Record<string, number>;
  modelScale?: CharacterModelScale;
  forwardOffset: number;
  verticalOffset?: number;
};

export type CharacterDefinition = {
  id: string;
  displayName: string;
  locked?: boolean;
  unplayable?: boolean;
  variant?: boolean;
  variantOf?: string;
  hasTransform?: boolean;
  transformCharacterId?: string;
  faceCardPath?: string;
  renderMode?: 'glb' | 'spriteVoxel' | 'procedural';
  modelPath: string;
  spriteSheetPath?: string;
  spriteSheets?: CharacterSpriteSheet[];
  spriteFrameCount?: number;
  spriteFrameEdits?: Record<string, SpriteFrameEdit>;
  voxelProfile?: 'shinobi-orange' | 'shinobi-blue' | 'image-source' | 'hd-image-source';
  voxelFidelity?: VoxelFidelitySettings;
  animationFrames?: Record<string, string[]>;
  animationFrameRates?: Record<string, number>;
  animationScales?: Record<string, AnimationScale>;
  animationFrameScales?: Record<string, Record<string, AnimationScale>>;
  animationFps?: number;
  attackCompanion?: AttackCompanionDefinition;
  scale: number;
  modelScale?: CharacterModelScale;
  cameraOffset: Vec3Tuple;
  stats: {
    health: number;
    speed: number;
    sidestepSpeed: number;
    dashDistance?: number;
    jumpForce: number;
    gravity: number;
    kiChargeRate?: number;
  };
  animations: Record<string, string>;
  moves: MoveDefinition[];
  moveOverrides?: Record<string, MoveOverride>;
  getupFrameOverrides?: GetupFrameOverrides;
  effects?: CharacterEffectDefinition[];
  moveEffects?: Record<string, MoveEffectInstance[]>;
  projectiles?: CharacterProjectileDefinition[];
  moveProjectiles?: Record<string, MoveProjectileInstance[]>;
  voice?: CharacterVoiceDefinition;
  hurtboxes: BoxSpec[];
  inputMap: Record<string, string>;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
  aiProfile: {
    aggression: number;
    guard: number;
    spacing: number;
    specialChance: number;
  };
};

export type StagePlayableBoundsDefinition = {
  shape: 'box' | 'ellipse';
  width: number;
  depth: number;
};

export type StageDefinition = {
  id: string;
  name: string;
  subtitle: string;
  renderMode?: 'procedural' | 'spriteCutout' | 'model';
  visualStylePreset?: StageVisualStylePreset;
  visualStyle?: StageVisualStyle;
  hidden?: boolean;
  tournamentEligible?: boolean;
  music?: {
    path?: string;
    trackIndex?: number;
    title?: string;
  };
  floor: string;
  floorAssetId?: string;
  floorTexturePath?: string;
  floorTextureRepeat?: [number, number];
  safePlatform?: StageSafePlatformDefinition;
  floorSounds?: StageFloorSoundSet;
  floorEffects?: StageFloorEffects;
  rail: string;
  light: string;
  skyboxAssetId?: string;
  skyboxPath?: string;
  sourcePath?: string;
  thumbnailPath?: string;
  world?: {
    width: number;
    depth: number;
    floorY?: number;
    backgroundColor?: string;
  };
  camera?: {
    previewPosition?: Vec3Tuple;
    previewTarget?: Vec3Tuple;
    target?: Vec3Tuple;
    distance?: number;
    height?: number;
    fov?: number;
  };
  lighting?: {
    ambient?: string;
    sky?: string;
  };
  type?: 'model-stage';
  fightPlane?: {
    center: Vec3Tuple;
    width: number;
    depth: number;
    y: number;
    rotationY?: number;
  };
  spawns?: {
    p1: Vec3Tuple;
    p2: Vec3Tuple;
  };
  collision?: {
    mode: 'box' | 'mesh' | 'none';
  };
  playableBounds?: StagePlayableBoundsDefinition;
  model?: StageModelDefinition;
  mugen?: MugenStageMetadata;
  backgroundLayers?: StageLayerDefinition[];
  props?: StagePropDefinition[];
};

export type StageVisualStylePreset =
  | 'anime-daylight'
  | 'anime-night'
  | 'dojo-sunset'
  | 'storm-temple'
  | 'void-boss'
  | 'training-clean';

export type StageVisualStyle = {
  lighting: {
    backgroundColor: string;
    fogColor: string;
    fogNear: number;
    fogFar: number;
    ambientMode: 'hemisphere' | 'ambient';
    skyColor: string;
    groundColor: string;
    hemiIntensity: number;
    ambientIntensity: number;
    keyColor: string;
    keyIntensity: number;
    keyPosition: Vec3Tuple;
    fillColor: string;
    fillIntensity: number;
    fillPosition: Vec3Tuple;
    rimColor: string;
    rimIntensity: number;
    rimPosition: Vec3Tuple;
    accentIntensity: number;
    accentDistance: number;
    shadowStrength: number;
    shadowSoftness: number;
  };
  toon: {
    enabled: boolean;
    steps: number;
    shadowStrength: number;
    highlightStrength: number;
    rimStrength: number;
    saturation: number;
    stagePropIntensity: number;
  };
  outline: {
    enabled: boolean;
    fighterThickness: number;
    fighterStrength: number;
    effectThickness: number;
    effectStrength: number;
    propThickness: number;
    propStrength: number;
    visibleColor: string;
    hiddenColor: string;
  };
  post: {
    enabled: boolean;
    bloomEnabled: boolean;
    bloomThreshold: number;
    bloomStrength: number;
    bloomRadius: number;
    saturation: number;
    contrast: number;
    brightness: number;
    warmth: number;
    vignetteStrength: number;
    vignetteRadius: number;
  };
  camera: {
    impactShake: number;
    impactZoom: number;
    clashZoom: number;
  };
  combatFx: {
    hitBloom: number;
    blockBloom: number;
    punishBloom: number;
    launchBloom: number;
    rimPulse: number;
    shockwaveStrength: number;
    reducedMotionScale: number;
  };
};

export type StageSafePlatformDefinition = {
  enabled?: boolean;
  shape?: 'octagon';
  texturePath?: string;
  textureRepeat?: [number, number];
  radius?: number;
  height?: number;
  yOffset?: number;
  color?: string;
  edgeColor?: string;
  edgeOpacity?: number;
};

export type StageModelDefinition = {
  path?: string;
  url?: string;
  format?: 'glb' | 'gltf' | 'fbx';
  position?: Vec3Tuple;
  scale?: Vec3Tuple;
  rotation?: Vec3Tuple;
  focus?: Vec3Tuple;
  bounds?: {
    center?: Vec3Tuple;
    size?: Vec3Tuple;
    radius?: number;
  };
  castShadow?: boolean;
  receiveShadow?: boolean;
  decorativeProps?: StagePropDefinition[];
};

export type StageLayerDefinition = {
  id: string;
  imagePath: string;
  position: Vec3Tuple;
  scale: Vec3Tuple;
  rotation?: Vec3Tuple;
  opacity?: number;
  followCamera?: boolean;
  parallax?: [number, number];
  tile?: [number, number];
  tileSpacing?: [number, number];
  sourceSprite?: [number, number];
};

export type MugenStageMetadata = {
  sourceDef: string;
  sourceSff?: string;
  localcoord?: [number, number];
  zoffset?: number;
  camera?: Record<string, number>;
  playerInfo?: Record<string, number>;
  bgm?: string;
  layers?: MugenStageLayerMetadata[];
  warnings?: string[];
};

export type MugenStageLayerMetadata = {
  id: string;
  name: string;
  type: string;
  sprite?: [number, number];
  action?: number;
  start: [number, number];
  delta: [number, number];
  tile: [number, number];
  tileSpacing: [number, number];
  mask: boolean;
  raw: Record<string, string>;
};

export type StagePropDefinition = {
  id: string;
  name: string;
  imagePath: string;
  position: Vec3Tuple;
  scale: Vec3Tuple;
  rotation?: Vec3Tuple;
  opacity?: number;
  billboard?: boolean;
  renderMode?: 'plane' | 'voxel';
  voxelDepth?: number;
  voxelScale?: number;
  hidden?: boolean;
  locked?: boolean;
};

export type StagePropAssetDefinition = {
  id: string;
  name: string;
  imagePath: string;
  thumbnailPath?: string;
  width?: number;
  height?: number;
  sourcePackId?: string;
  sourceName?: string;
  sourceKind?: 'mugen' | 'spritesheet' | 'manual';
  sourceSprite?: [number, number];
  tags?: string[];
  defaultScale?: Vec3Tuple;
  defaultRenderMode?: 'plane' | 'voxel';
  defaultVoxelDepth?: number;
  defaultVoxelScale?: number;
};

export type StageFloorSoundKey = 'run' | 'jump' | 'land' | 'sprint';

export type StageFloorSoundSet = Partial<Record<StageFloorSoundKey, string>>;

export type StageFloorGrassEffect = {
  enabled: boolean;
  density?: number;
  height?: number;
  patchWidth?: number;
  patchDepth?: number;
  bladeCount?: number;
  bladeWidth?: number;
  segments?: number;
  coverageScale?: number;
  colorVariation?: number;
  windDirection?: [number, number];
  windNoiseScale?: number;
  quality?: 'low' | 'medium' | 'high';
  windStrength?: number;
  windSpeed?: number;
  colorBottom?: string;
  colorTop?: string;
};

export type StageFloorSimpleEffect = {
  enabled: boolean;
  intensity?: number;
  density?: number;
  size?: number;
  speed?: number;
  opacity?: number;
  radius?: number;
  strength?: number;
  lifetime?: number;
  amount?: number;
  maxParticles?: number;
  maxDecals?: number;
  spread?: number;
  coverageScale?: number;
  decay?: number;
  atlasPath?: string;
  frameCount?: number;
  reactive?: boolean;
  quality?: 'low' | 'medium' | 'high';
  windStrength?: number;
  fallSpeed?: number;
  pulseSpeed?: number;
  color?: string;
  colorA?: string;
  colorB?: string;
};

export type StageFloorEffects = {
  grass?: StageFloorGrassEffect;
  dust?: StageFloorSimpleEffect;
  footsteps?: StageFloorSimpleEffect;
  impact?: StageFloorSimpleEffect;
  petals?: StageFloorSimpleEffect;
  snow?: StageFloorSimpleEffect;
  rain?: StageFloorSimpleEffect;
  rainPuddles?: StageFloorSimpleEffect;
  ripples?: StageFloorSimpleEffect;
  energy?: StageFloorSimpleEffect;
  fog?: StageFloorSimpleEffect;
  heat?: StageFloorSimpleEffect;
  glowTrails?: StageFloorSimpleEffect;
  windStreaks?: StageFloorSimpleEffect;
  cherryBurst?: StageFloorSimpleEffect;
  tileShimmer?: StageFloorSimpleEffect;
  debris?: StageFloorSimpleEffect;
};

export type StageFloorAssetDefinition = {
  id: string;
  name: string;
  texturePath: string;
  thumbnailPath?: string;
  repeat?: [number, number];
  sounds?: StageFloorSoundSet;
  effects?: StageFloorEffects;
};

export type StageSkyboxAssetDefinition = {
  id: string;
  name: string;
  imagePath: string;
  thumbnailPath?: string;
};

export type StageAssetLibraryManifest = {
  floors: StageFloorAssetDefinition[];
  skies: StageSkyboxAssetDefinition[];
};

export type StagePropLibraryManifest = {
  props: StagePropAssetDefinition[];
};

export type InputFrame = Record<ActionName, boolean>;

export type InputFrameMetadata = {
  __horizontalDashDirection?: 'left' | 'right';
  __pressedActions?: ActionName[];
  __pressSequences?: Partial<Record<ActionName, number>>;
};

export type InputFrameWithMetadata = InputFrame & InputFrameMetadata;

export type MiniGameKind = 'break-target' | 'enemy-rush' | 'fighter-rush' | 'tag';
export type TagRole = 'player-it' | 'cpu-it';
export type TagCompletedReason = 'tagged-player' | 'tagged-cpu' | 'survived' | 'escaped';
export type BreakTargetTier = 10 | 20 | 30;

export type MiniGameHighScoreKey = {
  gameId: MiniGameKind;
  stageId: string;
  tagRole?: TagRole;
};

export type BreakTargetRuntime = {
  id: string;
  tier: BreakTargetTier;
  hp: number;
  maxHp: number;
  position: { x: number; y: number; z: number };
  radius: number;
  height: number;
  points: number;
  destroyed: boolean;
  hitFlash: number;
};

export type BreakTargetExplosionRuntime = {
  id: string;
  position: { x: number; y: number; z: number };
  age: number;
  duration: number;
};

export type BreakTargetMiniGameSnapshot = {
  kind: 'break-target';
  gameId: MiniGameKind;
  stage: StageDefinition;
  player: FighterRuntime;
  seed: number;
  roundTime: number;
  timer: number;
  score: number;
  targets: BreakTargetRuntime[];
  explosions: BreakTargetExplosionRuntime[];
  phase: 'playing' | 'complete';
  completedReason: 'all-clear' | 'time-up' | null;
};

export type EnemyRushEnemyKind =
  | 'zombie-small'
  | 'skeleton-small'
  | 'pig-small'
  | 'orc-small'
  | 'zombie-big'
  | 'skeleton-big'
  | 'samurai'
  | 'pig-big'
  | 'orc-big'
  | 'wizzart-a'
  | 'wizzart-b'
  | 'wizzart-c'
  | 'dark-knight';

export type EnemyRushLaneIndex = 0 | 1 | 2 | 3 | 4;

export type EnemyRushLaneTransition = {
  from: EnemyRushLaneIndex;
  to: EnemyRushLaneIndex;
  progress: number;
  duration: number;
};

export type EnemyRushRuntime = {
  id: string;
  kind: EnemyRushEnemyKind;
  rosterCharacter?: CharacterDefinition;
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  points: number;
  radius: number;
  height: number;
  position: { x: number; y: number; z: number };
  laneIndex: EnemyRushLaneIndex;
  laneTransition: EnemyRushLaneTransition | null;
  facing: 1 | -1;
  attackCooldown: number;
  hitFlash: number;
  defeated: boolean;
  elite: boolean;
  behavior: 'chaser' | 'bruiser' | 'ambusher' | 'sentry' | 'caster';
  awareness: number;
  attackRange: number;
  projectileKind?: string;
};

export type EnemyRushCoinRuntime = {
  id: string;
  value: number;
  position: { x: number; y: number; z: number };
  laneIndex: EnemyRushLaneIndex;
  radius: number;
  collected: boolean;
};

export type EnemyRushProjectileRuntime = {
  id: string;
  ownerId: string;
  kind: string;
  damage: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; z: number };
  laneIndex: EnemyRushLaneIndex;
  radius: number;
  age: number;
};

export type EnemyRushMiniGameSnapshot = {
  kind: 'enemy-rush' | 'fighter-rush';
  gameId: MiniGameKind;
  stage: StageDefinition;
  player: FighterRuntime;
  seed: number;
  level: number;
  score: number;
  laneIndex: EnemyRushLaneIndex;
  laneTargetIndex: EnemyRushLaneIndex;
  laneTransition: EnemyRushLaneTransition | null;
  queuedLaneStep: -1 | 0 | 1;
  enemies: EnemyRushRuntime[];
  coins: EnemyRushCoinRuntime[];
  projectiles: EnemyRushProjectileRuntime[];
  explosions: BreakTargetExplosionRuntime[];
  lockedEnemyId: string | null;
  phase: 'playing' | 'complete';
  completedReason: 'all-clear' | 'player-death' | null;
};

export type TagMiniGameSnapshot = {
  kind: 'tag';
  gameId: 'tag';
  stage: StageDefinition;
  match: MatchSnapshot;
  seed: number;
  role: TagRole;
  level: number;
  difficulty: CpuDifficulty;
  roundTime: number;
  timer: number;
  elapsed: number;
  score: number;
  introTimer: number;
  outcomeTimer: number;
  phase: 'intro-role' | 'intro-objective' | 'playing' | 'tagged' | 'victory' | 'complete';
  completedReason: TagCompletedReason | null;
  lastProcessedImpactId: number;
};

export type ArcadeRunState = {
  score: number;
  livesRemaining: number;
  wins: number;
  level: number;
  status: 'idle' | 'running' | 'game-over';
  startedAt: number;
  lastAward: number;
  unlockedThisRun: string[];
  miniGameTotals: Record<MiniGameKind, number>;
};

export type MiniGameResult = {
  kind: MiniGameKind;
  gameId: MiniGameKind;
  stageId: string;
  stageName: string;
  score: number;
  previousHighScore: number;
  highScore: number;
  newHighScore: boolean;
  cleared: boolean;
  arcadeScoreAward?: number;
  targetsDestroyed: number;
  totalTargets: number;
  enemiesDefeated?: number;
  totalEnemies?: number;
  coinsCollected?: number;
  timeRemaining: number;
  allClear: boolean;
  completedReason: 'all-clear' | 'time-up' | 'player-death' | TagCompletedReason;
  tagRole?: TagRole;
  survivalTime?: number;
  timeToTag?: number;
};

export type BufferedMoveIntent = {
  moveInput: MoveInput;
  inputSnapshot: InputFrame;
  framesRemaining: number;
  sequence: number;
  beginnerDamageScale?: number;
  beginnerForcedCommand?: string;
};

export type MatchMode = 'ai' | 'cpuArcade' | 'versusCpu' | 'local2p' | 'cpu' | 'training' | 'trainingOnline' | 'online' | 'ranked' | 'private' | 'custom' | 'tournamentLocal' | 'tournamentOnline' | 'tournamentInfinite';
export type CpuDifficulty = 1 | 2 | 3 | 4 | 5;
export type ControlScheme = 'kore' | 'beginner';
export type MenuAttractPerformanceMode = 'full' | 'snappy';
export type MenuMotionPerformanceMode = 'full' | 'snappy';

export type PlayerControlBindings = Record<ActionName, string[]>;
export type PlayerGamepadBindings = Partial<Record<ActionName, number[]>>;
export type ButtonComboId =
  | '1+2'
  | '1+3'
  | '1+4'
  | '2+3'
  | '2+4'
  | '3+4'
  | '1+2+3'
  | '1+2+4'
  | '1+3+4'
  | '2+3+4'
  | '1+2+3+4';
export type PlayerKeyboardComboBindings = Partial<Record<ButtonComboId, string[]>>;
export type PlayerGamepadComboBindings = Partial<Record<ButtonComboId, number[]>>;
export type ControlBindingMap = {
  keyboard: [PlayerControlBindings, PlayerControlBindings];
  gamepad: [PlayerGamepadBindings, PlayerGamepadBindings];
  keyboardCombos: [PlayerKeyboardComboBindings, PlayerKeyboardComboBindings];
  gamepadCombos: [PlayerGamepadComboBindings, PlayerGamepadComboBindings];
  upHoldJumps: boolean;
};

export type GameSettings = {
  game: {
    roundTimer: number;
    maxHealth: number;
    trainingInfiniteHealth: boolean;
    inputAssist: boolean;
    controlScheme: ControlScheme;
  };
  controls: ControlBindingMap;
  camera: {
    distance: number;
    height: number;
    smoothing: number;
    zoomBias: number;
  };
  display: {
    hudScale: number;
    cursorId: string;
    touchControls: 'auto' | 'on' | 'off';
    reducedMotion: boolean;
    debugOverlay: boolean;
    movementSmokeStyle: MovementSmokeStyle;
    impactSparks: {
      enabled: boolean;
      cinematic: boolean;
      shape: ImpactSparkShape;
      hitColor: string;
      hitAccentColor: string;
      blockColor: string;
      size: number;
      intensity: number;
    };
  };
  performance: {
    autoDetectMenuLag: boolean;
    menuAttractMode: MenuAttractPerformanceMode;
    menuMotionMode: MenuMotionPerformanceMode;
  };
  audio: {
    master: number;
    music: number;
    sfx: number;
    voices: number;
    hitSfx: number;
    muted: boolean;
    menuMusic: boolean;
    bgmTrackIndex: number;
  };
};

export type ShadowCloneRuntime = {
  phase: 'active' | 'vanishing';
  position: { x: number; y: number; z: number };
  velocityY: number;
  facing: 1 | -1;
  facingYaw: number;
  state: FighterState;
  currentMove: MoveDefinition | null;
  moveInstanceId: number;
  moveFrame: number;
  actionFramesRemaining: number;
  hitConnected: boolean;
  attackConsumed: boolean;
  vanishOnLanding: boolean;
  visualHitstop: VisualHitstopRuntime;
  spawnSmokeFrames: number;
  vanishSmokeFrames: number;
};

export type VisualHitstopRuntime = {
  framesRemaining: number;
  animationKey: string | null;
  progress: number;
};

export type ProjectileRuntime = {
  id: number;
  ownerSlot: 1 | 2;
  projectileId: string;
  kind: ProjectileKind;
  instanceId: string;
  moveInstanceId: number;
  move: MoveDefinition;
  position: { x: number; y: number; z: number };
  previousPosition: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  gravity?: number;
  facing: 1 | -1;
  phase: ProjectileAnimationPhase;
  ageFrames: number;
  startupFrames: number;
  activeFrames: number;
  recoveryFrames: number;
  lifetimeFrames: number;
  homingMode: ProjectileHomingMode;
  homingStrength: number;
  homingTurnRate: number;
  homingEndFrame?: number;
  nearMissRadius: number;
  targetMode?: ProjectileTargetMode;
  targetPoint?: { x: number; y: number; z: number };
  hitbox: BoxSpec;
  damageScale: number;
  blockDamageScale: number;
  pushbackScale: number;
  blockPushbackScale: number;
  mirrorWithFacing: boolean;
  pierce: boolean;
  clash: boolean;
  hitConnected: boolean;
  expired: boolean;
  trailSeed: number;
  chargeFrames?: number;
  chargeDamageScale?: number;
};

export type AiObjective = 'standard' | 'tagger' | 'runner';

export type MatchOptions = {
  roundTime?: number;
  roundsToWin?: number;
  maxHealth?: number;
  trainingInfiniteHealth?: boolean;
  controlScheme?: ControlScheme;
  playIntro?: boolean;
  aiSeed?: number;
  roster?: CharacterDefinition[];
  cpuSlots?: Array<1 | 2>;
  aiObjective?: AiObjective;
};

export type FighterRuntime = {
  slot: 1 | 2;
  character: CharacterDefinition;
  baseCharacter: CharacterDefinition;
  hp: number;
  maxHp: number;
  tookDamageThisRound: boolean;
  recoverableHp: number;
  displayRecoverableHp: number;
  recoverableRecoveryDelayFrames: number;
  recoverableFlashFrames: number;
  ki: number;
  displayKi: number;
  transformOvercharge: number;
  displayTransformOvercharge: number;
  transformReadyTimer: number;
  transformStartupFrames: number;
  transformTargetId: string | null;
  transformSmokeFrames: number;
  position: { x: number; y: number; z: number };
  velocityY: number;
  facing: 1 | -1;
  facingYaw: number;
  controlSideSign: 1 | -1;
  horizontalHoldDirection: 'left' | 'right' | null;
  horizontalHoldIntent: 'forward' | 'back' | null;
  horizontalHoldControlSideSign: 1 | -1;
  state: FighterState;
  sidestepTimer: number;
  sidestepDirection: -1 | 0 | 1;
  sidestepOrbitSign: 1 | -1;
  laneOrbitControlLocked: boolean;
  sidestepRepeatGraceFrames: number;
  dashForwardFrames: number;
  dashForwardCooldownFrames: number;
  backHopFrames: number;
  backHopTotalFrames: number;
  backHopCooldownFrames: number;
  walkDirection: -1 | 0 | 1;
  jumpInputHeld: boolean;
  currentMove: MoveDefinition | null;
  moveInstanceId: number;
  projectileAimDirection?: { x: number; z: number };
  actionTimer: number;
  actionFramesRemaining: number;
  moveFrame: number;
  idleFlourishFramesRemaining: number;
  idleFlourishTotalFrames: number;
  chargePhase: 'none' | 'startup' | 'active' | 'hold' | 'recovery';
  chargeFrame: number;
  chargeCommitted: boolean;
  hitConnected: boolean;
  hitConfirmed: boolean;
  whiffRecoveryApplied: boolean;
  previewAnimationKey?: string;
  commandHistory: Array<{ token: string; age: number }>;
  previousDirectionToken: string;
  comboTimer: number;
  comboStep: number;
  comboSequence: MoveInput[];
  comboIdentitySequence: string[];
  comboFamilySequence: string[];
  comboVisualFamilySequence: string[];
  comboUsedKeys: string[];
  comboHits: number;
  comboDamage: number;
  bufferedMoveInput: MoveInput | null;
  bufferedMoveFrames: number;
  bufferedMoveIntent: BufferedMoveIntent | null;
  aiRecentComboKeys: string[];
  aiRecentComboFamilies: string[];
  aiRecentComboVisualFamilies: string[];
  aiActiveComboRouteId: string | null;
  aiJuggleLockoutFrames: number;
  aiActionableIdleFrames: number;
  previousAttackInputs: Record<MoveInput, boolean>;
  wasCrouching: boolean;
  roundsWon: number;
  stunTimer: number;
  stunFramesRemaining: number;
  blockstunFramesRemaining: number;
  blockPunishWindowFrames: number;
  forcedCrouchFrames: number;
  getupInvulnerableFrames: number;
  getupForward: -1 | 0 | 1;
  getupLane: -1 | 0 | 1;
  getupStarted: boolean;
  getupAction: GetupAction;
  getupTotalFrames: number;
  juggleDamage: number;
  juggleSequenceDamage: number;
  juggleHitCount: number;
  juggleTornadoCount: number;
  juggleGravityScale: number;
  tornadoReactionFrames: number;
  throwOpponentSlot: 1 | 2 | null;
  throwCaptorSlot: 1 | 2 | null;
  throwAnchorMove: MoveDefinition | null;
  throwHoldFrames: number;
  throwMaxHoldFrames: number;
  throwJabActive: boolean;
  throwJabCooldownFrames: number;
  throwJabHitConnected: boolean;
  throwEscapeProgress: number;
  throwEscapeGoal: number;
  throwShakeFrames: number;
  lotusFinisherDefenderSlot: 1 | 2 | null;
  lotusCinematicFrames: number;
  blockFlash: number;
  hitFlash: number;
  visualHitstop: VisualHitstopRuntime;
  shadowClone: ShadowCloneRuntime | null;
  shadowCloneChargeConsumed: boolean;
};

export type MatchSnapshot = {
  fighters: [FighterRuntime, FighterRuntime];
  roster: CharacterDefinition[];
  stage: StageDefinition;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  cpuSlots?: Array<1 | 2>;
  aiObjective: AiObjective;
  aiSeed: number;
  roundAiSeed: number;
  roundTime: number;
  roundsToWin: number;
  maxHealth?: number;
  trainingInfiniteHealth: boolean;
  controlScheme: ControlScheme;
  trainingDummyInput?: InputFrame | null;
  introEnabled: boolean;
  timer: number;
  round: number;
  countdown: number;
  winnerSlot: 1 | 2 | null;
  phase: 'intro' | 'fighting' | 'roundFinisher' | 'roundOver' | 'matchOver';
  message: string;
  lastHitId: number;
  projectiles: ProjectileRuntime[];
  combatEvents: CombatPopupEvent[];
  impactEvents: ImpactSparkEvent[];
  clashState: ClashState;
  roundFinisher: RoundFinisherState | null;
  timeStop: MatchTimeStopRuntime | null;
  visualTimeScale: number;
  cameraShake: number;
  idleQuietFrames: number;
  idleQuietLockFrames: number;
};

export const emptyInputFrame = (): InputFrame => ({
  up: false,
  down: false,
  left: false,
  right: false,
  dashForward: false,
  dashBack: false,
  sidestepUp: false,
  sidestepDown: false,
  sidewalkUp: false,
  sidewalkDown: false,
  jump: false,
  jab: false,
  kick: false,
  heavy: false,
  special: false,
  charge: false,
  block: false,
  confirm: false,
  back: false,
  pause: false,
  lockTarget: false,
  cycleTargetUp: false,
  cycleTargetDown: false
});

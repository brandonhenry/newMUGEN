export type Vec3Tuple = [number, number, number];

export const ROUNDS_TO_WIN = 3;

export type ActionName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'dashForward'
  | 'sidestepUp'
  | 'sidestepDown'
  | 'sidewalkUp'
  | 'sidewalkDown'
  | 'jab'
  | 'kick'
  | 'heavy'
  | 'special'
  | 'charge'
  | 'block'
  | 'confirm'
  | 'back'
  | 'pause';

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
export type CombatPopupKind = 'combo' | 'punish' | 'whiffPunish' | 'clashWin' | 'clashDraw' | 'clashPerfect';
export type ImpactSparkKind = 'hit' | 'block' | 'punish' | 'whiffPunish' | 'clash';
export type ImpactSparkShape = 'burst' | 'ring' | 'shards';

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
  endsInCrouch?: boolean;
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
  hitLevel: HitLevel;
  damage: number;
  moveLabel: string;
  moveInput?: MoveInput;
  comboHits?: number;
  launched?: boolean;
  juggled?: boolean;
  tornado?: boolean;
  kiBurst?: boolean;
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

export type VoxelFidelitySettings = {
  resolutionScale?: number;
  maxRows?: number;
  depth?: number;
  alphaThreshold?: number;
  paletteSnap?: number;
  mergeRuns?: boolean;
  lod?: {
    mobileStep?: number;
    farStep?: number;
  };
};

export type AnimationScale = {
  width?: number;
  height?: number;
  offsetX?: number;
};

export type CharacterModelScale = {
  width?: number;
  height?: number;
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
  };
  animations: Record<string, string>;
  moves: MoveDefinition[];
  moveOverrides?: Record<string, MoveOverride>;
  getupFrameOverrides?: GetupFrameOverrides;
  effects?: CharacterEffectDefinition[];
  moveEffects?: Record<string, MoveEffectInstance[]>;
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

export type StageDefinition = {
  id: string;
  name: string;
  subtitle: string;
  renderMode?: 'procedural' | 'spriteCutout';
  visualStylePreset?: StageVisualStylePreset;
  visualStyle?: StageVisualStyle;
  hidden?: boolean;
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
  };
  lighting?: {
    ambient?: string;
    sky?: string;
  };
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

export type MatchMode = 'ai' | 'versusCpu' | 'local2p' | 'cpu' | 'training' | 'online' | 'private';
export type CpuDifficulty = 1 | 2 | 3 | 4 | 5;

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
};

export type GameSettings = {
  game: {
    roundTimer: number;
    maxHealth: number;
    trainingInfiniteHealth: boolean;
    inputAssist: boolean;
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
    impactSparks: {
      enabled: boolean;
      shape: ImpactSparkShape;
      hitColor: string;
      blockColor: string;
      size: number;
      intensity: number;
    };
  };
  audio: {
    master: number;
    music: number;
    sfx: number;
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
  spawnSmokeFrames: number;
  vanishSmokeFrames: number;
};

export type MatchOptions = {
  roundTime?: number;
  maxHealth?: number;
  trainingInfiniteHealth?: boolean;
  playIntro?: boolean;
  aiSeed?: number;
  roster?: CharacterDefinition[];
};

export type FighterRuntime = {
  slot: 1 | 2;
  character: CharacterDefinition;
  baseCharacter: CharacterDefinition;
  hp: number;
  maxHp: number;
  ki: number;
  transformOvercharge: number;
  transformReadyTimer: number;
  transformStartupFrames: number;
  transformTargetId: string | null;
  transformSmokeFrames: number;
  position: { x: number; y: number; z: number };
  velocityY: number;
  facing: 1 | -1;
  facingYaw: number;
  state: FighterState;
  sidestepTimer: number;
  sidestepDirection: -1 | 0 | 1;
  sidestepOrbitSign: 1 | -1;
  dashForwardFrames: number;
  dashForwardCooldownFrames: number;
  walkDirection: -1 | 0 | 1;
  jumpInputHeld: boolean;
  currentMove: MoveDefinition | null;
  moveInstanceId: number;
  actionTimer: number;
  actionFramesRemaining: number;
  moveFrame: number;
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
  comboUsedKeys: string[];
  comboHits: number;
  comboDamage: number;
  bufferedMoveInput: MoveInput | null;
  bufferedMoveFrames: number;
  aiRecentComboKeys: string[];
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
  juggleTornadoCount: number;
  juggleGravityScale: number;
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
  blockFlash: number;
  hitFlash: number;
  shadowClone: ShadowCloneRuntime | null;
  shadowCloneChargeConsumed: boolean;
};

export type MatchSnapshot = {
  fighters: [FighterRuntime, FighterRuntime];
  roster: CharacterDefinition[];
  stage: StageDefinition;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  aiSeed: number;
  roundAiSeed: number;
  roundTime: number;
  maxHealth?: number;
  trainingInfiniteHealth: boolean;
  introEnabled: boolean;
  timer: number;
  round: number;
  countdown: number;
  winnerSlot: 1 | 2 | null;
  phase: 'intro' | 'fighting' | 'roundOver' | 'matchOver';
  message: string;
  lastHitId: number;
  combatEvents: CombatPopupEvent[];
  impactEvents: ImpactSparkEvent[];
  clashState: ClashState;
  visualTimeScale: number;
  cameraShake: number;
};

export const emptyInputFrame = (): InputFrame => ({
  up: false,
  down: false,
  left: false,
  right: false,
  dashForward: false,
  sidestepUp: false,
  sidestepDown: false,
  sidewalkUp: false,
  sidewalkDown: false,
  jab: false,
  kick: false,
  heavy: false,
  special: false,
  charge: false,
  block: false,
  confirm: false,
  back: false,
  pause: false
});

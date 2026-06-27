export type Vec3Tuple = [number, number, number];

export const ROUNDS_TO_WIN = 3;

export type ActionName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
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
  | 'attack'
  | 'hit'
  | 'juggle'
  | 'knockdown'
  | 'entry'
  | 'win'
  | 'lose';

export type MoveInput = 'jab' | 'kick' | 'heavy' | 'special';
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
  pushback: number;
  blockPushback: number;
  push?: number;
  hitstun?: number;
  launchHeight?: number;
  launchVelocity?: number;
  juggleRefloatVelocity?: number;
  juggleGravityScale?: number;
  tornado?: boolean;
  tracking: MoveTracking;
  armorStartFrame?: number | null;
  armorEndFrame?: number | null;
  cancelWindows?: Array<{ startFrame: number; endFrame: number; into?: MoveInput[] }>;
  knockdown: boolean;
  hitbox: BoxSpec;
  hurtboxes?: BoxSpec[];
  hurtboxOffset?: Vec3Tuple;
  kiCost?: number;
  kiBurst?: boolean;
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

export type CharacterDefinition = {
  id: string;
  displayName: string;
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
  animationFps?: number;
  scale: number;
  cameraOffset: Vec3Tuple;
  stats: {
    health: number;
    speed: number;
    sidestepSpeed: number;
    jumpForce: number;
    gravity: number;
  };
  animations: Record<string, string>;
  moves: MoveDefinition[];
  moveOverrides?: Record<string, MoveOverride>;
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
  hidden?: boolean;
  music?: {
    path?: string;
    trackIndex?: number;
    title?: string;
  };
  floor: string;
  floorTexturePath?: string;
  floorTextureRepeat?: [number, number];
  rail: string;
  light: string;
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
  backgroundLayers?: StageLayerDefinition[];
  props?: StagePropDefinition[];
};

export type StageLayerDefinition = {
  id: string;
  imagePath: string;
  position: Vec3Tuple;
  scale: Vec3Tuple;
  rotation?: Vec3Tuple;
  opacity?: number;
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

export type InputFrame = Record<ActionName, boolean>;

export type MatchMode = 'ai' | 'local2p' | 'cpu' | 'training' | 'online' | 'private';
export type CpuDifficulty = 1 | 2 | 3 | 4 | 5;

export type PlayerControlBindings = Record<ActionName, string[]>;
export type PlayerGamepadBindings = Partial<Record<ActionName, number[]>>;
export type ControlBindingMap = {
  keyboard: [PlayerControlBindings, PlayerControlBindings];
  gamepad: [PlayerGamepadBindings, PlayerGamepadBindings];
};

export type GameSettings = {
  game: {
    roundTimer: number;
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
  trainingInfiniteHealth?: boolean;
  playIntro?: boolean;
  aiSeed?: number;
};

export type FighterRuntime = {
  slot: 1 | 2;
  character: CharacterDefinition;
  hp: number;
  ki: number;
  position: { x: number; y: number; z: number };
  velocityY: number;
  facing: 1 | -1;
  facingYaw: number;
  state: FighterState;
  sidestepTimer: number;
  sidestepDirection: -1 | 0 | 1;
  sidestepOrbitSign: 1 | -1;
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
  getupInvulnerableFrames: number;
  getupForward: -1 | 0 | 1;
  getupLane: -1 | 0 | 1;
  getupStarted: boolean;
  juggleDamage: number;
  juggleSequenceDamage: number;
  juggleTornadoCount: number;
  juggleGravityScale: number;
  blockFlash: number;
  hitFlash: number;
  shadowClone: ShadowCloneRuntime | null;
  shadowCloneChargeConsumed: boolean;
};

export type MatchSnapshot = {
  fighters: [FighterRuntime, FighterRuntime];
  stage: StageDefinition;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  aiSeed: number;
  roundAiSeed: number;
  roundTime: number;
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

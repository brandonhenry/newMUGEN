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
  | 'jump'
  | 'block'
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
export type CombatPopupKind = 'combo' | 'punish' | 'whiffPunish';
export type ImpactSparkKind = 'hit' | 'block' | 'punish' | 'whiffPunish';
export type ImpactSparkShape = 'burst' | 'ring' | 'shards';

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
  pushback: number;
  blockPushback: number;
  push?: number;
  hitstun?: number;
  launchHeight?: number;
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
};

export type MoveOverride = Partial<Omit<MoveDefinition, 'id' | 'input' | 'hitbox'>> & {
  id?: string;
  input?: MoveInput;
  hitbox?: Partial<BoxSpec>;
};

export type SpriteFrameEdit = {
  index: number;
  path?: string;
  box: [number, number, number, number];
  width: number;
  height: number;
  row?: number;
  rotation?: number;
  offset?: [number, number];
  scale?: number;
  hidden?: boolean;
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
  floor: string;
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

export type MatchMode = 'ai' | 'local2p' | 'cpu' | 'training' | 'online';
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
  };
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
  jumpInputHeld: boolean;
  currentMove: MoveDefinition | null;
  actionTimer: number;
  actionFramesRemaining: number;
  moveFrame: number;
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
  blockFlash: number;
  hitFlash: number;
};

export type MatchSnapshot = {
  fighters: [FighterRuntime, FighterRuntime];
  stage: StageDefinition;
  mode: MatchMode;
  cpuDifficulty: CpuDifficulty;
  aiSeed: number;
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

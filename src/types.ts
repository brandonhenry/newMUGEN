export type Vec3Tuple = [number, number, number];

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
  | 'knockdown'
  | 'win'
  | 'lose';

export type MoveInput = 'jab' | 'kick' | 'heavy' | 'special';
export type HitLevel = 'high' | 'mid' | 'low' | 'throw' | 'special';
export type MoveTracking = 'none' | 'weakLeft' | 'weakRight' | 'medium' | 'strong' | 'homing';

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
};

export type MoveOverride = Partial<Omit<MoveDefinition, 'id' | 'input' | 'hitbox'>> & {
  id?: string;
  input?: MoveInput;
  hitbox?: Partial<BoxSpec>;
};

export type CharacterDefinition = {
  id: string;
  displayName: string;
  renderMode?: 'glb' | 'spriteVoxel' | 'procedural';
  modelPath: string;
  spriteSheetPath?: string;
  spriteFrameCount?: number;
  voxelProfile?: 'shinobi-orange' | 'shinobi-blue' | 'image-source';
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
  floor: string;
  rail: string;
  light: string;
};

export type InputFrame = Record<ActionName, boolean>;

export type MatchMode = 'ai' | 'local2p' | 'cpu';
export type CpuDifficulty = 1 | 2 | 3 | 4 | 5;

export type FighterRuntime = {
  slot: 1 | 2;
  character: CharacterDefinition;
  hp: number;
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
  previewAnimationKey?: string;
  commandHistory: Array<{ token: string; age: number }>;
  previousDirectionToken: string;
  comboTimer: number;
  comboStep: number;
  comboSequence: MoveInput[];
  previousAttackInputs: Record<MoveInput, boolean>;
  wasCrouching: boolean;
  roundsWon: number;
  stunTimer: number;
  stunFramesRemaining: number;
  blockstunFramesRemaining: number;
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
  timer: number;
  round: number;
  countdown: number;
  winnerSlot: 1 | 2 | null;
  phase: 'intro' | 'fighting' | 'roundOver' | 'matchOver';
  message: string;
  lastHitId: number;
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
  block: false,
  confirm: false,
  back: false,
  pause: false
});

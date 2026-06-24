import type { StageDefinition } from '../types';

export const stages: StageDefinition[] = [
  {
    id: 'metro-ring',
    name: 'Dungeon Core',
    subtitle: 'Large 3D world with a centered fight ring',
    floor: '#20242a',
    rail: '#2ee6ff',
    light: '#f6fbff',
    worldModelPath: '/stages/dungeon-world/dungeon_warkarma.glb',
    worldModelScale: 0.32,
    worldModelPosition: [0, -0.32, -3.8],
    worldModelRotation: [0, 0, 0]
  },
  {
    id: 'forge-yard',
    name: 'Forge Yard',
    subtitle: 'Warm steel courtyard',
    floor: '#2a2520',
    rail: '#ffb01f',
    light: '#ffe2ad'
  }
];

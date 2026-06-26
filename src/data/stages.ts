import type { StageDefinition } from '../types';

export const stages: StageDefinition[] = [
  {
    id: 'metro-ring',
    name: 'Infinite Grid',
    subtitle: 'Wide procedural arena for movement testing',
    music: {
      playlistId: 'PLpaYu1T8cvjatSQ8InN0shnKO44xoHfN2',
      videoId: 'yy4D-0QnvQ8',
      trackIndex: 1,
      title: 'Infinite Grid Theme'
    },
    floor: '#07182c',
    rail: '#2ee6ff',
    light: '#dbe8ff'
  },
  {
    id: 'forge-yard',
    name: 'Forge Yard',
    subtitle: 'Warm steel courtyard',
    music: {
      playlistId: 'PLpaYu1T8cvjatSQ8InN0shnKO44xoHfN2',
      videoId: 'yy4D-0QnvQ8',
      trackIndex: 2,
      title: 'Forge Yard Theme'
    },
    floor: '#2a2520',
    rail: '#ffb01f',
    light: '#ffe2ad'
  }
];

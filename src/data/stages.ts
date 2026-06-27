import type { StageDefinition } from '../types';

export const stages: StageDefinition[] = [
  {
    id: 'the-chamber',
    name: 'The Chamber (Silver)',
    subtitle: 'Infinite white simulation room',
    renderMode: 'procedural',
    music: {
      playlistId: 'PLpaYu1T8cvjatSQ8InN0shnKO44xoHfN2',
      videoId: 'yy4D-0QnvQ8',
      trackIndex: 1,
      title: 'The Chamber Theme'
    },
    floor: '#f7fff6',
    floorTexturePath: '/stages/chamber/floor-silver.png',
    floorTextureRepeat: [28, 28],
    rail: '#dce6ec',
    light: '#ffffff',
    skyboxPath: '/stages/chamber/skybox.png',
    world: {
      width: 220,
      depth: 220,
      backgroundColor: '#f8fbff'
    }
  },
  {
    id: 'the-chamber-green',
    name: 'The Chamber (Green)',
    subtitle: 'Infinite green simulation room',
    renderMode: 'procedural',
    music: {
      playlistId: 'PLpaYu1T8cvjatSQ8InN0shnKO44xoHfN2',
      videoId: 'yy4D-0QnvQ8',
      trackIndex: 1,
      title: 'The Chamber Theme'
    },
    floor: '#f7fff6',
    floorTexturePath: '/stages/chamber/floor-text.png',
    floorTextureRepeat: [28, 28],
    rail: '#9cff73',
    light: '#ffffff',
    skyboxPath: '/stages/chamber/skybox.png',
    world: {
      width: 220,
      depth: 220,
      backgroundColor: '#f8fbff'
    }
  },
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

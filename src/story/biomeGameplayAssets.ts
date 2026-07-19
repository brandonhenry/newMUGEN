import { worldPackAsset } from './adventureAssets';
import type { StoryAdventureTraversalPieceKind, StoryWorldAssetId } from './types';

export type StoryGameplayVisualDefinition = {
  id: string;
  asset: StoryWorldAssetId;
  pixelSize: [number, number];
  footprint: [number, number];
  sourcePack: string;
};

export type StoryTraversalGameplayVisualDefinition = StoryGameplayVisualDefinition & {
  kinds: StoryAdventureTraversalPieceKind[];
};

export type StoryBiomeGameplayAssetContract = {
  visualSetId: string;
  containers: StoryGameplayVisualDefinition[];
  pickups: StoryGameplayVisualDefinition[];
  traversal: StoryTraversalGameplayVisualDefinition[];
};

const visual = (id: string, file: string, pixelSize: [number, number], footprint: [number, number]): StoryGameplayVisualDefinition => ({
  id, asset: worldPackAsset(file), pixelSize, footprint, sourcePack: file.split('/')[0]
});

const CONTRACTS: StoryBiomeGameplayAssetContract[] = [
  {
    visualSetId: 'greenhollow-backup-kings',
    containers: [visual('kings-supply-box', 'kings-pigs/box.png', [22, 16], [2.4, 1.75])],
    pickups: [visual('kings-route-diamond', 'kings-pigs/diamond.png', [18, 14], [1.6, 1.25])],
    traversal: []
  },
  {
    visualSetId: 'thornwood-backup-pixel',
    containers: [
      visual('thorn-pixel-cache-a', 'pixel-thornwood/box-1.png', [28, 24], [2.5, 2.15]),
      visual('thorn-pixel-cache-b', 'pixel-thornwood/box-2.png', [28, 24], [2.5, 2.15]),
      visual('thorn-pixel-cache-c', 'pixel-thornwood/box-3.png', [28, 24], [2.5, 2.15])
    ],
    pickups: [
      visual('thorn-pixel-apple', 'pixel-thornwood/apple.png', [32, 32], [1.5, 1.5]),
      visual('thorn-pixel-cherries', 'pixel-thornwood/cherries.png', [32, 32], [1.5, 1.5])
    ],
    traversal: []
  },
  {
    visualSetId: 'ironroot-backup-grafx',
    containers: [visual('grafx-mine-supply-barrels', 'grafx-cave/barrel.png', [32, 16], [3.2, 1.6])],
    pickups: [],
    traversal: [{ ...visual('grafx-mine-lift-frame', 'grafx-cave/support.png', [32, 48], [3.2, 4.8]), kinds: ['lift'] }]
  },
  {
    visualSetId: 'emberdeep-backup-grafx',
    containers: [visual('grafx-ember-supply-barrels', 'grafx-ember/barrel.png', [32, 16], [3.2, 1.6])],
    pickups: [],
    traversal: []
  },
  {
    visualSetId: 'sunscar-backup-pixel',
    containers: [
      visual('sun-pixel-cache-a', 'pixel-sunscar/box-1.png', [28, 24], [2.5, 2.15]),
      visual('sun-pixel-cache-b', 'pixel-sunscar/box-2.png', [28, 24], [2.5, 2.15]),
      visual('sun-pixel-cache-c', 'pixel-sunscar/box-3.png', [28, 24], [2.5, 2.15])
    ],
    pickups: [visual('sun-pixel-orange', 'pixel-sunscar/orange.png', [32, 32], [1.5, 1.5])],
    traversal: []
  }
];

export const STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS = Object.fromEntries(CONTRACTS.map((contract) => [contract.visualSetId, contract])) as Record<string, StoryBiomeGameplayAssetContract>;

export function storyBiomeGameplayAssetContract(visualSetId: string | undefined) {
  return visualSetId ? STORY_BIOME_GAMEPLAY_ASSET_CONTRACTS[visualSetId] : undefined;
}

export function storyGameplayVisual(visualSetId: string | undefined, visualId: string | undefined) {
  const contract = storyBiomeGameplayAssetContract(visualSetId);
  return contract && visualId ? [...contract.containers, ...contract.pickups, ...contract.traversal].find((candidate) => candidate.id === visualId) : undefined;
}

export function storyTraversalGameplayVisual(visualSetId: string | undefined, kind: StoryAdventureTraversalPieceKind) {
  return storyBiomeGameplayAssetContract(visualSetId)?.traversal.find((candidate) => candidate.kinds.includes(kind));
}

import { Canvas } from '@react-three/fiber';
import { ChevronLeft, ChevronRight, Save, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  makeDefaultStoryAvatar,
  sanitizeStoryName,
  STORY_AVATAR_SET_LABELS,
  STORY_AVATAR_SETS
} from './avatarCatalog';
import { readOrCreateStoryHubGuestIdentity } from './hubMultiplayer';
import { StoryAvatarRig } from './StoryAvatarRig';
import type { StoryAvatarDefinition, StoryProfileV4 } from './types';

function nextAvatarSet(current: StoryAvatarDefinition['avatarSet'], direction: -1 | 1) {
  const currentIndex = STORY_AVATAR_SETS.indexOf(current);
  return STORY_AVATAR_SETS[(currentIndex + direction + STORY_AVATAR_SETS.length) % STORY_AVATAR_SETS.length];
}

export default function StoryAvatarCreatorScreen({ profile, preferredName, reducedMotion, onSave, onBack }: {
  profile: StoryProfileV4 | null;
  preferredName?: string;
  reducedMotion: boolean;
  onSave: (avatar: StoryAvatarDefinition) => void;
  onBack: () => void;
}) {
  const assignedName = useMemo(() => preferredName || readOrCreateStoryHubGuestIdentity().displayName, [preferredName]);
  const initialAvatar = useMemo(() => profile?.avatar ?? makeDefaultStoryAvatar(assignedName), [assignedName, profile]);
  const [draft, setDraft] = useState<StoryAvatarDefinition>(initialAvatar);
  const cleanName = sanitizeStoryName(draft.name);
  const update = <K extends keyof StoryAvatarDefinition>(key: K, value: StoryAvatarDefinition[K]) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <div className="story-creator-screen" data-testid="story-avatar-creator">
      <header className="story-creator-header story-enter-1">
        <div>
          <span><UserRound size={16} /> K.O.R.E. Citizen Registry</span>
          <h1>{profile ? 'Avatar Studio' : 'Create Your Story Avatar'}</h1>
          <p>Your existing player name is reused automatically, or K.O.R.E. assigns one for you.</p>
        </div>
        <button type="button" className="story-creator-back" onClick={onBack}><ChevronLeft size={20} /> Back</button>
      </header>

      <main className="story-creator-layout">
        <section className="story-avatar-preview story-enter-2" aria-label="Avatar preview">
          <Canvas orthographic camera={{ position: [0, 1.25, 7], zoom: 110 }} dpr={[0.75, 1.4]}>
            <color attach="background" args={['#071120']} />
            <ambientLight intensity={1.4} />
            <directionalLight position={[4, 7, 5]} intensity={2.3} castShadow />
            <pointLight position={[-3, 2, 3]} color="#2ee6ff" intensity={7} distance={8} />
            <group position={[0, 0.15, 0]} scale={1.15}>
              <StoryAvatarRig avatar={draft} reducedMotion={reducedMotion} />
            </group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.82, 0]} receiveShadow>
              <circleGeometry args={[1.45, 64]} />
              <meshStandardMaterial color="#122a45" roughness={0.8} />
            </mesh>
          </Canvas>
          <div className="story-avatar-preview-name">
            <strong>{cleanName || 'PLAYER'}</strong>
            <span>Central Citizen</span>
          </div>
        </section>

        <section className="story-creator-controls story-enter-3" aria-label="Avatar options">
          <label className="story-name-field">
            <span>Hub name</span>
            <input value={draft.name} maxLength={12} onChange={(event) => update('name', event.target.value)} onBlur={() => update('name', cleanName)} autoFocus={!profile} />
            <small>Automatically assigned · {cleanName.length}/12</small>
          </label>

          <div className="story-creator-choice">
            <span>Avatar</span>
            <div>
              <button type="button" aria-label="Previous avatar" onClick={() => update('avatarSet', nextAvatarSet(draft.avatarSet, -1))}>
                <ChevronLeft size={20} />
              </button>
              <strong>{STORY_AVATAR_SET_LABELS[draft.avatarSet]}</strong>
              <button type="button" aria-label="Next avatar" onClick={() => update('avatarSet', nextAvatarSet(draft.avatarSet, 1))}>
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="story-directional-note">
            <strong>Fourteen complete animated presets</strong>
            <span>The four supplied characters and ten original nub-foot K.O.R.E. chibis use fixed authored frames. No runtime recoloring, redraw, or procedural body layers are applied.</span>
          </div>
        </section>
      </main>

      <footer className="story-creator-footer story-enter-4">
        <p>{profile ? 'Save your changes and return to K.O.R.E. Central.' : 'Your avatar will be stored on this device and included in memory-card exports.'}</p>
        <button type="button" className="story-primary-button" onClick={() => onSave({ ...draft, name: cleanName || assignedName })}><Save size={20} /> Save &amp; Enter Hub</button>
      </footer>
    </div>
  );
}

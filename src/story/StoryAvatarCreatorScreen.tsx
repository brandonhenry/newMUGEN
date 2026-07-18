import { Canvas } from '@react-three/fiber';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Plus, Save, Star, Trash2, UserRound, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  makeDefaultStoryAvatar,
  sanitizeStoryName,
  STORY_AVATAR_SELECTION_PROFILES,
  STORY_AVATAR_SET_LABELS,
  STORY_AVATAR_SETS
} from './avatarCatalog';
import { readOrCreateStoryHubGuestIdentity } from './hubMultiplayer';
import { createStoryAvatar, removeStoryAvatar, setActiveStoryAvatar, setEquippedStoryAvatars, updateStoryAvatar, writeStoryProfile } from './profile';
import { StoryAvatarRig } from './StoryAvatarRig';
import type { StoryAvatarDefinition, StoryProfileV4 } from './types';

function nextAvatarSet(current: StoryAvatarDefinition['avatarSet'], direction: -1 | 1) {
  const currentIndex = STORY_AVATAR_SETS.indexOf(current);
  return STORY_AVATAR_SETS[(currentIndex + direction + STORY_AVATAR_SETS.length) % STORY_AVATAR_SETS.length];
}

export default function StoryAvatarCreatorScreen({ profile, partySize, preferredName, reducedMotion, onSave, onBack }: {
  profile: StoryProfileV4 | null;
  partySize: number;
  preferredName?: string;
  reducedMotion: boolean;
  onSave: (profile: StoryProfileV4) => void;
  onBack: () => void;
}) {
  const assignedName = useMemo(() => preferredName || readOrCreateStoryHubGuestIdentity().displayName, [preferredName]);
  const initialAvatar = useMemo(() => profile?.avatar ?? makeDefaultStoryAvatar(assignedName), [assignedName, profile]);
  const [workingProfile, setWorkingProfile] = useState(profile);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(profile?.activeAvatarId ?? null);
  const [draft, setDraft] = useState<StoryAvatarDefinition>(initialAvatar);
  const cleanName = sanitizeStoryName(draft.name);
  const selectionProfile = STORY_AVATAR_SELECTION_PROFILES[draft.avatarSet];
  const update = <K extends keyof StoryAvatarDefinition>(key: K, value: StoryAvatarDefinition[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const selectSlot = (avatarId: string) => {
    const slot = workingProfile?.avatars.find((candidate) => candidate.id === avatarId);
    if (!slot) return;
    setSelectedAvatarId(avatarId);
    setDraft(slot.avatar);
  };
  const beginCreate = () => {
    setSelectedAvatarId(null);
    setDraft(makeDefaultStoryAvatar(`ALLY ${(workingProfile?.avatars.length ?? 0) + 1}`));
  };
  const save = () => {
    const avatar = { ...draft, name: cleanName || assignedName };
    if (!workingProfile) {
      onSave(writeStoryProfile(avatar));
      return;
    }
    const saved = selectedAvatarId
      ? updateStoryAvatar(workingProfile, selectedAvatarId, avatar)
      : createStoryAvatar(workingProfile, avatar, partySize);
    onSave(saved);
  };
  const toggleEquipped = (avatarId: string) => {
    if (!workingProfile) return;
    const equipped = workingProfile.equippedAvatarIds.includes(avatarId);
    const nextIds = equipped ? workingProfile.equippedAvatarIds.filter((id) => id !== avatarId) : [...workingProfile.equippedAvatarIds, avatarId];
    setWorkingProfile(setEquippedStoryAvatars(workingProfile, nextIds, partySize));
  };
  const makeActive = (avatarId: string) => {
    if (!workingProfile) return;
    let next = workingProfile;
    if (!next.equippedAvatarIds.includes(avatarId)) next = setEquippedStoryAvatars(next, [...next.equippedAvatarIds, avatarId], partySize);
    next = setActiveStoryAvatar(next, avatarId);
    setWorkingProfile(next);
    selectSlot(avatarId);
  };
  const moveEquipped = (avatarId: string, direction: -1 | 1) => {
    if (!workingProfile) return;
    const ids = [...workingProfile.equippedAvatarIds];
    const index = ids.indexOf(avatarId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setWorkingProfile(setEquippedStoryAvatars(workingProfile, ids, partySize));
  };
  const removeSelected = () => {
    if (!workingProfile || !selectedAvatarId) return;
    const next = removeStoryAvatar(workingProfile, selectedAvatarId);
    setWorkingProfile(next);
    setSelectedAvatarId(next.activeAvatarId);
    setDraft(next.avatar);
  };

  return (
    <div className="story-creator-screen" data-testid="story-avatar-creator">
      <header className="story-creator-header story-enter-1">
        <div>
          <span><UserRound size={16} /> Adventure Party</span>
          <h1>{profile ? 'Choose Your Adventure Party' : 'Choose Your Adventurer'}</h1>
          <p>{profile ? `Choose up to ${partySize} heroes to travel with you. Anyone resting at camp will be ready when you need them.` : 'Choose the hero who will take the first step into Adventure Mode.'}</p>
        </div>
        <button type="button" className="story-creator-back" onClick={onBack}><ChevronLeft size={20} /> Back</button>
      </header>

      {workingProfile && <nav className="story-avatar-roster story-enter-2" aria-label="Adventure party">
        <div className="story-avatar-roster-summary"><UsersRound size={17} /><strong>{workingProfile.equippedAvatarIds.length}/{partySize}</strong><span>In Party</span></div>
        {workingProfile.avatars.map((slot, index) => {
          const active = workingProfile.activeAvatarId === slot.id;
          const equipped = workingProfile.equippedAvatarIds.includes(slot.id);
          return <button key={slot.id} type="button" className={`${selectedAvatarId === slot.id ? 'is-selected' : ''} ${active ? 'is-active' : ''} ${equipped ? 'is-equipped' : ''}`} onClick={() => selectSlot(slot.id)}>
            <span>{index + 1}</span><strong>{slot.avatar.name}</strong><small>{active ? 'Leader' : equipped ? 'In Party' : 'At Camp'}</small>
          </button>;
        })}
        <button type="button" className="story-avatar-roster-add" disabled={workingProfile.avatars.length >= partySize || workingProfile.avatars.length >= 5} onClick={beginCreate}><Plus size={18} /><span>Add Hero</span></button>
      </nav>}

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
            <span>{selectionProfile.role}</span>
          </div>
        </section>

        <section className="story-creator-controls story-enter-3" aria-label="Avatar options">
          {workingProfile && selectedAvatarId && <div className="story-avatar-roster-actions">
            <button type="button" className={workingProfile.activeAvatarId === selectedAvatarId ? 'is-active' : ''} onClick={() => makeActive(selectedAvatarId)}><Star size={16} /> {workingProfile.activeAvatarId === selectedAvatarId ? 'Party Leader' : 'Make Leader'}</button>
            <button type="button" className={workingProfile.equippedAvatarIds.includes(selectedAvatarId) ? 'is-active' : ''} disabled={workingProfile.equippedAvatarIds.includes(selectedAvatarId) && workingProfile.equippedAvatarIds.length === 1} onClick={() => toggleEquipped(selectedAvatarId)}><Check size={16} /> {workingProfile.equippedAvatarIds.includes(selectedAvatarId) ? 'In Party' : 'Join Party'}</button>
            {workingProfile.equippedAvatarIds.includes(selectedAvatarId) && <button type="button" aria-label="Move hero earlier in party order" disabled={workingProfile.equippedAvatarIds[0] === selectedAvatarId} onClick={() => moveEquipped(selectedAvatarId, -1)}><ArrowUp size={16} /> Earlier</button>}
            {workingProfile.equippedAvatarIds.includes(selectedAvatarId) && <button type="button" aria-label="Move hero later in party order" disabled={workingProfile.equippedAvatarIds[workingProfile.equippedAvatarIds.length - 1] === selectedAvatarId} onClick={() => moveEquipped(selectedAvatarId, 1)}><ArrowDown size={16} /> Later</button>}
            <button type="button" disabled={workingProfile.avatars.length === 1} onClick={removeSelected}><Trash2 size={16} /> Remove Hero</button>
          </div>}
          <label className="story-name-field">
            <span>Hero Name</span>
            <input value={draft.name} maxLength={12} onChange={(event) => update('name', event.target.value)} onBlur={() => update('name', cleanName)} autoFocus={!profile} />
            <small>What should everyone call you? · {cleanName.length}/12</small>
          </label>

          <div className="story-creator-choice">
            <span>Choose Your Hero</span>
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
            <strong>{selectionProfile.role}</strong>
            <span>{selectionProfile.description}</span>
            <dl className="story-avatar-strengths">
              <div><dt>Strengths</dt><dd>{selectionProfile.strengths}</dd></div>
              <div><dt>Special Move</dt><dd>{selectionProfile.special}</dd></div>
            </dl>
            <small>Every hero can grow stronger as you level up, so choose the fighting style you enjoy.</small>
          </div>
        </section>
      </main>

      <footer className="story-creator-footer story-enter-4">
        <p>{profile ? 'Gather your party and return to K.O.R.E. Central.' : 'Your chosen hero will be waiting whenever you return to your adventure.'}</p>
        <button type="button" className="story-primary-button" onClick={save}><Save size={20} /> {profile ? 'Return to Adventure' : 'Begin Adventure'}</button>
      </footer>
    </div>
  );
}

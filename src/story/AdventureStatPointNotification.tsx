import { ArrowUp, BarChart3, Sparkles, X } from 'lucide-react';

export type AdventureStatPointNotice = { id: number; gained: number; available: number; level: number };

export function AdventureStatPointNotification({ notice, reducedMotion, onUpgrade, onDismiss }: {
  notice: AdventureStatPointNotice;
  reducedMotion: boolean;
  onUpgrade: () => void;
  onDismiss: () => void;
}) {
  const pointLabel = notice.gained === 1 ? 'Stat Point' : 'Stat Points';
  return <aside className={`story-stat-point-notice ${reducedMotion ? 'is-reduced-motion' : ''}`} aria-live="polite" data-testid="story-stat-point-notice">
    <span className="story-stat-point-notice-icon" aria-hidden="true"><Sparkles size={23} /></span>
    <div className="story-stat-point-notice-copy">
      <small><ArrowUp size={12} /> Level {notice.level} reached</small>
      <strong>+{notice.gained} {pointLabel}</strong>
      <p><b>{notice.available}</b> available to shape your Adventure build.</p>
    </div>
    <button type="button" className="story-stat-point-notice-upgrade" onClick={onUpgrade} aria-label={`Open Adventure Stats. ${notice.available} stat points available.`}><BarChart3 size={17} /><span>Upgrade</span><kbd>P</kbd></button>
    <button type="button" className="story-stat-point-notice-dismiss" onClick={onDismiss} aria-label="Dismiss stat point notification"><X size={16} /></button>
  </aside>;
}

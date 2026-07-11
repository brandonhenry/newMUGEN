export function addFrameRangeToSelection(
  selectedFrames: string[],
  frameBank: string[],
  anchorIndex: number,
  targetIndex: number
) {
  const rangeStart = Math.max(0, Math.min(anchorIndex, targetIndex));
  const rangeEnd = Math.min(frameBank.length - 1, Math.max(anchorIndex, targetIndex));
  const nextFrames = [...selectedFrames];
  const selectedFrameSet = new Set(selectedFrames);

  for (const frame of frameBank.slice(rangeStart, rangeEnd + 1)) {
    if (selectedFrameSet.has(frame)) continue;
    selectedFrameSet.add(frame);
    nextFrames.push(frame);
  }

  return nextFrames;
}

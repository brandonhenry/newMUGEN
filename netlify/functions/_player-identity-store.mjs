export function cleanPlayerId(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 96);
}

export function cleanDisplayName(value) {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

export function cleanPostHogDeviceId(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9:_.$-]/g, '').slice(0, 160);
}

export function cleanCharacterId(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
}

export function publicPlayerKey(playerId) {
  return `players/${playerId}.json`;
}

export function deviceMapKey(posthogDeviceId) {
  return `devices/${posthogDeviceId}.json`;
}

export function makePublicPlayerId() {
  return `kore-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

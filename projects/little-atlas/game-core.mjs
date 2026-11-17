export const STORAGE_KEY = 'little-atlas.us.v1';
export const normalizeLongitude = longitude => ((longitude + 180) % 360 + 360) % 360 - 180;
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function readProgress(raw, validIds) {
  try {
    const value = JSON.parse(raw);
    return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string' && validIds.has(id)) : []);
  } catch { return new Set(); }
}
export function checkPlacement(selectedId, targetId, placed) {
  if (!selectedId || !targetId) return 'empty';
  if (placed.has(selectedId)) return 'already';
  return selectedId === targetId ? 'correct' : 'incorrect';
}
export function movePosition(position, x, y, seconds, zoom) {
  const speed = 34 / Math.max(1, zoom);
  // Compensate east/west travel for latitude while keeping polar control bounded.
  const longitudeFactor = Math.max(.25, Math.cos(position[1] * Math.PI / 180));
  return [normalizeLongitude(position[0] + x * speed * seconds / longitudeFactor), clamp(position[1] - y * speed * seconds, -85, 85)];
}

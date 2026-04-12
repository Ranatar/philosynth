export function parseVersion(_v: string) {
  return { base: 1, sub: 0, modes: 0, modeRegen: 0 };
}
export function formatVersion(v: { base: number; sub: number; modes: number; modeRegen: number }) {
  return `${v.base}.${v.sub}.${v.modes}.${v.modeRegen}`;
}

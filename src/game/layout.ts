/**
 * Screen layout, chosen once at start-up: a tall phone held upright gets the portrait
 * layout (450 wide, height follows the screen), everything else the 960×720 landscape one.
 */
const isPortrait = () => window.innerHeight > window.innerWidth;

export const PORTRAIT = isPortrait();
export const GW = PORTRAIT ? 450 : 960;
export const GH = PORTRAIT ? Math.max(760, Math.min(1000, Math.round((450 * window.innerHeight) / window.innerWidth))) : 720;

/** True when the device was rotated since start-up, so the layout no longer matches. */
export function layoutStale() {
  return isPortrait() !== PORTRAIT;
}

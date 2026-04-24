export const THEME_ACCENT_KEY = 'eurobot-theme-accent';
export const BMS_HOSTNAME_KEY = 'bms-hostname';
export const SIM_INSTANCE_NAMES_KEY = 'sima-instance-names';
export const PLAYMAT_BG_ID_KEY = 'playmat-background-id';
export const SPONSOR_ANIMATION_KEY = 'eurobot-sponsor-animation';
export const ROBOT_GLB_ACTIVE_ID_KEY = 'robot-glb-active-id';
/** Saved playmat plan sequences (JSON) — see `playmat.tsx` */
export const SAVED_PLANS_KEY = 'savedPlans';

/** Local storage keys for layout / app chrome (backed up with data bundle) */
export const APP_LAYOUT_ACTIVE_PANEL_KEY = 'activePanel';
export const APP_LAYOUT_VERTICAL_PANEL_KEY = 'verticalPanel';
export const APP_LAYOUT_IS_HALF_SCREEN_KEY = 'isHalfScreen';

export const EUROBOT_GLB_ID_LIST_KEY = 'eurobot-glb-id-list';

/**
 * localStorage keys included in full backup/restore. Values are strings; missing keys on restore are removed
 * (except for optional keys you may want to keep — we remove all listed keys from manifest, then re-apply from manifest + defaults).
 */
export const CONFIG_BACKUP_STORAGE_KEYS: readonly string[] = [
  THEME_ACCENT_KEY,
  BMS_HOSTNAME_KEY,
  SIM_INSTANCE_NAMES_KEY,
  PLAYMAT_BG_ID_KEY,
  SPONSOR_ANIMATION_KEY,
  ROBOT_GLB_ACTIVE_ID_KEY,
  SAVED_PLANS_KEY,
  EUROBOT_GLB_ID_LIST_KEY,
  APP_LAYOUT_ACTIVE_PANEL_KEY,
  APP_LAYOUT_VERTICAL_PANEL_KEY,
  APP_LAYOUT_IS_HALF_SCREEN_KEY,
] as const;

import final from './playmat_2026_FINAL.png';
import darkRog from './playmat_2026_dark_rog.png';
import lightBlue from './playmat_2026_light_blue.png';
import darkRed from './playmat_2026_dark_red.png';
import lightYellow from './playmat_2026_light_yellow.png';
import darkBlue from './playmat_2026_dark_blue.png';

export interface PlaymatBackgroundDef {
  id: string;
  label: string;
  src: string;
}

export const PLAYMAT_BACKGROUNDS: PlaymatBackgroundDef[] = [
  { id: '2026_final', label: '2026 Final', src: final },
  { id: 'dark_rog', label: 'Dark (ROG)', src: darkRog },
  { id: 'light_blue', label: 'Light Blue', src: lightBlue },
  { id: 'dark_red', label: 'Dark Red', src: darkRed },
  { id: 'light_yellow', label: 'Light Yellow', src: lightYellow },
  { id: 'dark_blue', label: 'Dark Blue', src: darkBlue },
];

export const DEFAULT_PLAYMAT_BG_ID = '2026_final';

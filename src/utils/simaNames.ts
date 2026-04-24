import { SIM_INSTANCE_NAMES_KEY } from './storageKeys';

const DEFAULT_NAMES = [
  'sima_01',
  'sima_02',
  'sima_03',
  'sima_04',
  'sima_05',
  'sima_06',
  'sima_07',
  'sima_08',
];

/**
 * ROS 2 / graph-style names (resource names, namespace segments, and typical topic
 * name parts): one letter, then [a-zA-Z0-9_]*, max length 128.
 * https://docs.ros.org/en/rolling/Concepts/About-Name-Types.html#ros-2-name-types
 */
const ROS2_NAME = /^[a-zA][a-zA-Z0-9_]*$/;

export function isValidSimaName(name: string): boolean {
  return name.length > 0 && name.length <= 128 && ROS2_NAME.test(name);
}

export function parseSimaNamesFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(SIM_INSTANCE_NAMES_KEY);
    if (!raw) return [...DEFAULT_NAMES];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [...DEFAULT_NAMES];
    const names = arr.filter((n): n is string => typeof n === 'string').map((n) => n.trim()).filter(Boolean);
    const valid = names.filter(isValidSimaName);
    return valid.length > 0 ? valid : [...DEFAULT_NAMES];
  } catch {
    return [...DEFAULT_NAMES];
  }
}

export function saveSimaNames(names: string[]): void {
  const v = names.filter((n) => isValidSimaName(n));
  if (v.length === 0) return;
  localStorage.setItem(SIM_INSTANCE_NAMES_KEY, JSON.stringify(v));
  window.dispatchEvent(new Event('eurobot-sima-names-updated'));
}

export function getDefaultSimaNames(): string[] {
  return [...DEFAULT_NAMES];
}

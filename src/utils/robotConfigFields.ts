/**
 * Robot config fields (UI grouped under Pantry / Collection / General). Ranges: issue #2
 * @see https://github.com/DIT-ROBOTICS/Eurobot-Web/issues/2
 */
export type RobotConfigFields = {
  pantry_aggressiveness: number;
  pantry_sensitivity: number;
  pantry_rival_sigma: number;
  pantry_rival_distance_threshold: number;
  collection_aggressiveness: number;
  collection_sensitivity: number;
  collection_rival_sigma: number;
  collection_rival_distance_threshold: number;
  flip_distance_threshold: number;
  cursor_tolerance: number;
};

export const DEFAULT_ROBOT_CONFIG: RobotConfigFields = {
  pantry_aggressiveness: 0,
  pantry_sensitivity: 2,
  pantry_rival_sigma: 0.3,
  pantry_rival_distance_threshold: 0.3,
  collection_aggressiveness: 0,
  collection_sensitivity: 2,
  collection_rival_sigma: 0.3,
  collection_rival_distance_threshold: 0.3,
  flip_distance_threshold: 0.1,
  cursor_tolerance: 0.18,
};

export type RcFieldSpec = {
  key: keyof RobotConfigFields;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Sensitivity 1–5: integer only */
  integer?: boolean;
};

export const RC_FIELD_SPECS: RcFieldSpec[] = [
  { key: "pantry_aggressiveness", label: "Aggressiveness", min: -1, max: 1, step: 0.1 },
  { key: "pantry_sensitivity", label: "Sensitivity", min: 1, max: 5, step: 1, integer: true },
  { key: "pantry_rival_sigma", label: "Rival σ", min: 0.1, max: 0.5, step: 0.01 },
  { key: "pantry_rival_distance_threshold", label: "Rival distance", min: 0.2, max: 0.5, step: 0.01 },
  { key: "collection_aggressiveness", label: "Aggressiveness", min: -1, max: 1, step: 0.1 },
  { key: "collection_sensitivity", label: "Sensitivity", min: 1, max: 5, step: 1, integer: true },
  { key: "collection_rival_sigma", label: "Rival σ", min: 0.1, max: 0.5, step: 0.01 },
  { key: "collection_rival_distance_threshold", label: "Rival distance", min: 0.2, max: 0.5, step: 0.01 },
  { key: "flip_distance_threshold", label: "Flip distance", min: 0.1, max: 0.5, step: 0.01 },
  { key: "cursor_tolerance", label: "Cursor tolerance", min: 0.1, max: 0.2, step: 0.01 },
];

export const RC_FIELD_GROUPS: { title: string; specs: RcFieldSpec[] }[] = [
  { title: "Pantry", specs: RC_FIELD_SPECS.slice(0, 4) },
  { title: "Collection", specs: RC_FIELD_SPECS.slice(4, 8) },
  { title: "General", specs: RC_FIELD_SPECS.slice(8) },
];

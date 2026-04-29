import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Set data directory
const dataDir = '/home/share/data';
console.log('API routes - Using data directory:', dataDir);

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  console.log('Creating data directory:', dataDir);
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('Data directory created successfully');
  } catch (err) {
    console.error('Failed to create data directory:', err);
  }
}

// Set file paths - Use only rival_params.yaml for all parameters
const rivalParamsPath = path.join(dataDir, 'rival_params.yaml');
const buttonStatesPath = path.join(dataDir, 'button.json');
const simaJSONPath = path.join(dataDir, 'sima.json');
const missionSequencePath = path.join(dataDir, 'mission_sequence.json');
const missionSequenceLegacyPath = path.join(dataDir, 'mission_sequence_black.json');

// Set navigation parameter file paths
const navProfiles = {
  didilong: path.join(dataDir, 'nav_didilong_params.yaml'),
  fast: path.join(dataDir, 'nav_fast_params.yaml'),
  slow: path.join(dataDir, 'nav_slow_params.yaml'),
  linearBoost: path.join(dataDir, 'nav_linearBoost_params.yaml'),
  angularBoost: path.join(dataDir, 'nav_angularBoost_params.yaml')
};

// Default values for all parameters
const DEFAULT_VALUES = {
  nav_rival_radius: 0.22,
  dock_rival_radius: 0.46,
  dock_rival_degree: 120,
  nav_profiles: {
    didilong: { linear: 1.5, angular: 1.0 },
    fast: { linear: 1.1, angular: 12.0 },
    slow: { linear: 0.8, angular: 2.0 },
    linearBoost: { linear: 1.1, angular: 2.0 },
    angularBoost: { linear: 0.5, angular: 12.0 }
  },
  sima_start_time: 85,
  sima_plan_code: 1
};


// Global YAML options for consistent formatting
const yamlOptions = {
  lineWidth: -1, // Don't wrap long lines
  quotingType: '"', // Use double quotes when necessary
  forceQuotes: false, // Only quote when necessary
  schema: yaml.DEFAULT_SCHEMA, // Use default schema
  styles: {
    '!!float': 'decimal' // Ensure floats have decimal representation
  }
};

// Helper function to ensure floating point format for numbers
function formatFloatForYaml(value) {
  // Convert to number first in case it's a string
  const numValue = Number(value);
  
  // For values that are exactly integers (like 1.0), force decimal representation
  if (Number.isInteger(numValue)) {
    // Use a string with .0 to force YAML to show decimal point
    return numValue + 0.0;
  }
  
  // Preserve the actual value without rounding/truncating
  return numValue;
}

// Helper function for JSON responses - returns formatted number with original precision
function formatFloatForJSON(value) {
  // Convert to number first in case it's a string
  const numValue = Number(value);
  // Use 2 decimal places for consistent formatting without rounding
  return numValue.toFixed(2).replace(/\.?0+$/, '');
}

// GET endpoint to retrieve rival radius
router.get('/rival-radius', (req, res) => {
  try {
    // Check if file exists
    if (!fs.existsSync(rivalParamsPath)) {
      // Create default file with rival radius
      const defaultData = {
        nav_rival_parameters: {
          rival_inscribed_radius: formatFloatForYaml(DEFAULT_VALUES.nav_rival_radius)
        },
        dock_rival_parameters: {
          dock_rival_radius: formatFloatForYaml(DEFAULT_VALUES.dock_rival_radius),
          dock_rival_degree: DEFAULT_VALUES.dock_rival_degree
        }
      };
      
      // Ensure the directory exists
      const dir = path.dirname(rivalParamsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(rivalParamsPath, yaml.dump(defaultData));
      console.log('Created default rival_params.yaml');
      
      return res.json({ 
        success: true, 
        message: 'Using default rival radius',
        radius: formatFloatForJSON(DEFAULT_VALUES.nav_rival_radius)
      });
    }

    // Read and parse the YAML file
    const fileContent = fs.readFileSync(rivalParamsPath, 'utf8');
    let data;
    
    try {
      data = yaml.load(fileContent);
    } catch (parseError) {
      console.error('Error parsing YAML:', parseError);
      return res.json({
        success: true,
        message: 'Error parsing file, using default radius',
        radius: formatFloatForJSON(DEFAULT_VALUES.nav_rival_radius)
      });
    }

    // Extract the radius value
    const radius = data?.nav_rival_parameters?.rival_inscribed_radius || DEFAULT_VALUES.nav_rival_radius;
    
    // Format radius for response
    const formattedRadius = formatFloatForJSON(radius);

    res.json({ 
      success: true, 
      message: 'Retrieved rival radius successfully',
      radius: formattedRadius 
    });
  } catch (error) {
    console.error('Error reading rival radius:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error reading configuration file',
      error: error.message
    });
  }
});

// POST endpoint to update rival radius
router.post('/rival-radius', (req, res) => {
  try {
    const { radius } = req.body;

    if (radius === undefined || isNaN(radius)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid radius value'
      });
    }

    // Ensure the radius is within reasonable bounds (0.0m to 0.5m)
    const validRadius = Math.max(0.0, Math.min(0.5, parseFloat(radius)));

    // Convert to float format for YAML
    const yamlRadius = formatFloatForYaml(validRadius);

    // Default data structure if file doesn't exist
    let data = { 
      nav_rival_parameters: { 
        rival_inscribed_radius: yamlRadius 
      },
      dock_rival_parameters: { 
        dock_rival_radius: formatFloatForYaml(DEFAULT_VALUES.dock_rival_radius), 
        dock_rival_degree: DEFAULT_VALUES.dock_rival_degree 
      }
    };

    if (fs.existsSync(rivalParamsPath)) {
      // Read existing file
      const fileContent = fs.readFileSync(rivalParamsPath, 'utf8');
      
      try {
        const existingData = yaml.load(fileContent);
        if (existingData) data = existingData;
      } catch (parseError) {
        console.warn(`Could not parse existing YAML: ${parseError.message}`);
      }
    }
    
    // Update the radius value
    if (!data.nav_rival_parameters) {
      data.nav_rival_parameters = {};
    }
    data.nav_rival_parameters.rival_inscribed_radius = yamlRadius;

    // Ensure the directory exists
    const dir = path.dirname(rivalParamsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the updated configuration back to the file
    let yamlContent = yaml.dump(data, yamlOptions);
    yamlContent = yamlContent.replace(/(rival_inscribed_radius|dock_rival_radius): (\d+)$/gm, '$1: $2.0');
    fs.writeFileSync(rivalParamsPath, yamlContent);

    // Format radius for response
    const formattedRadius = formatFloatForJSON(validRadius);

    res.json({ 
      success: true, 
      message: 'Rival radius updated successfully', 
      radius: formattedRadius
    });
  } catch (error) {
    console.error('Error updating rival radius:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating configuration file',
      error: error.message
    });
  }
});

// GET endpoint to retrieve dock rival parameters
router.get('/dock-rival-params', (req, res) => {
  try {
    // Check if file exists
    if (!fs.existsSync(rivalParamsPath)) {
      // Create default file with all parameters
      const defaultData = {
        nav_rival_parameters: {
          rival_inscribed_radius: formatFloatForYaml(DEFAULT_VALUES.nav_rival_radius)
        },
        dock_rival_parameters: {
          dock_rival_radius: formatFloatForYaml(DEFAULT_VALUES.dock_rival_radius),
          dock_rival_degree: DEFAULT_VALUES.dock_rival_degree
        }
      };
      
      // Ensure the directory exists
      const dir = path.dirname(rivalParamsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(rivalParamsPath, yaml.dump(defaultData));
      console.log('Created default rival_params.yaml for dock parameters');
      
      return res.json({ 
        success: true, 
        message: 'Using default dock parameters',
        radius: formatFloatForJSON(DEFAULT_VALUES.dock_rival_radius),
        degree: DEFAULT_VALUES.dock_rival_degree 
      });
    }

    // Read and parse the YAML file
    const fileContent = fs.readFileSync(rivalParamsPath, 'utf8');
    let data;
    
    try {
      data = yaml.load(fileContent);
    } catch (parseError) {
      console.error('Error parsing YAML:', parseError);
      return res.json({
        success: true,
        message: 'Error parsing file, using default dock parameters',
        radius: formatFloatForJSON(DEFAULT_VALUES.dock_rival_radius),
        degree: DEFAULT_VALUES.dock_rival_degree
      });
    }

    // Extract parameters
    const radius = data?.dock_rival_parameters?.dock_rival_radius || DEFAULT_VALUES.dock_rival_radius;
    const degree = data?.dock_rival_parameters?.dock_rival_degree || DEFAULT_VALUES.dock_rival_degree;
    
    // Format for consistent decimal places
    const formattedRadius = formatFloatForJSON(radius);

    res.json({ 
      success: true, 
      message: 'Retrieved dock parameters successfully',
      radius: formattedRadius, 
      degree 
    });
  } catch (error) {
    console.error('Error reading dock rival parameters:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error reading configuration file',
      error: error.message,
      radius: formatFloatForJSON(DEFAULT_VALUES.dock_rival_radius), // Default values on error
      degree: DEFAULT_VALUES.dock_rival_degree
    });
  }
});

// POST endpoint to update dock rival parameters
router.post('/dock-rival-params', (req, res) => {
  try {
    const { radius, degree } = req.body;

    if ((radius === undefined || isNaN(radius)) && (degree === undefined || isNaN(degree))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid parameters'
      });
    }

    // Ensure the values are within reasonable bounds
    const validRadius = radius !== undefined ? Math.max(0.0, Math.min(0.5, parseFloat(radius))) : DEFAULT_VALUES.dock_rival_radius;
    const validDegree = degree !== undefined ? Math.max(0, Math.min(360, parseInt(degree))) : DEFAULT_VALUES.dock_rival_degree;
    
    // Format radius for YAML
    const yamlRadius = formatFloatForYaml(validRadius);
    
    // Check if file exists, create a default if not
    let data = { 
      nav_rival_parameters: { 
        rival_inscribed_radius: formatFloatForYaml(DEFAULT_VALUES.nav_rival_radius) 
      },
      dock_rival_parameters: { 
        dock_rival_radius: yamlRadius, 
        dock_rival_degree: validDegree 
      }
    };

    if (fs.existsSync(rivalParamsPath)) {
      // Read existing file
      try {
        const fileContent = fs.readFileSync(rivalParamsPath, 'utf8');
        const loadedData = yaml.load(fileContent);
        if (loadedData) data = loadedData;
        
        // Make sure sections exist
        if (!data.dock_rival_parameters) {
          data.dock_rival_parameters = {};
        }
      } catch (parseError) {
        console.warn(`Could not parse existing YAML: ${parseError.message}`);
      }
    } else {
      // Ensure the directory exists
      const dir = path.dirname(rivalParamsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    
    // Update the values
    data.dock_rival_parameters.dock_rival_radius = yamlRadius;
    data.dock_rival_parameters.dock_rival_degree = validDegree;

    // Write the updated configuration back to the file
    let yamlContent = yaml.dump(data, yamlOptions);
    yamlContent = yamlContent.replace(/(rival_inscribed_radius|dock_rival_radius): (\d+)$/gm, '$1: $2.0');
    fs.writeFileSync(rivalParamsPath, yamlContent);

    // Format radius for response
    const formattedRadius = formatFloatForJSON(validRadius);

    res.json({ 
      success: true, 
      message: 'Dock rival parameters updated successfully', 
      radius: formattedRadius,
      degree: validDegree
    });
  } catch (error) {
    console.error('Error updating dock rival parameters:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating configuration file',
      error: error.message
    });
  }
});

// GET endpoint to retrieve navigation parameters
router.get('/nav-params', (req, res) => {
  try {
    // Get requested profile or default to slow
    const profile = req.query.profile || 'slow';
    
    // Ensure valid profile
    if (!navProfiles[profile]) {
      return res.status(400).json({
        success: false,
        message: `Invalid profile: ${profile}`
      });
    }
    
    const profilePath = navProfiles[profile];
    
    // Get default values for this profile
    const defaultLinear = DEFAULT_VALUES.nav_profiles[profile]?.linear || 0.8;
    const defaultAngular = DEFAULT_VALUES.nav_profiles[profile]?.angular || 2.0;
    
    // Check if file exists
    if (!fs.existsSync(profilePath)) {
      // Create default file with profile-specific values
      const defaultData = {
        robot_parameters: {
          max_linear_velocity: formatFloatForYaml(defaultLinear),
          max_angular_velocity: formatFloatForYaml(defaultAngular)
        }
      };
      
      // Ensure the directory exists
      const dir = path.dirname(profilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      let defaultYaml = yaml.dump(defaultData, yamlOptions);
      defaultYaml = defaultYaml.replace(/(max_linear_velocity|max_angular_velocity): (-?\d+)$/gm, '$1: $2.0');
      fs.writeFileSync(profilePath, defaultYaml);
      console.log(`Created default ${profile} profile with linear=${defaultLinear}, angular=${defaultAngular}`);
      
      return res.json({ 
        success: true, 
        profile, 
        linearVelocity: formatFloatForJSON(defaultLinear), 
        angularVelocity: formatFloatForJSON(defaultAngular) 
      });
    }

    // Read and parse the YAML file
    try {
      const fileContent = fs.readFileSync(profilePath, 'utf8');
      const data = yaml.load(fileContent);

      // Extract values
      let linearVelocity = defaultLinear;
      let angularVelocity = defaultAngular;
      
      if (data?.robot_parameters) {
        if (typeof data.robot_parameters.max_linear_velocity === 'number') {
          linearVelocity = data.robot_parameters.max_linear_velocity;
        }
        if (typeof data.robot_parameters.max_angular_velocity === 'number') {
          angularVelocity = data.robot_parameters.max_angular_velocity;
        }
      }
      
      // Format for response
      const formattedLinear = Number.isInteger(linearVelocity) ? linearVelocity.toFixed(1) : linearVelocity;
      const formattedAngular = Number.isInteger(angularVelocity) ? angularVelocity.toFixed(1) : angularVelocity;

      res.json({ 
        success: true, 
        profile, 
        linearVelocity: formattedLinear, 
        angularVelocity: formattedAngular 
      });
    } catch (parseError) {
      console.error(`Error parsing ${profile} profile:`, parseError);
      // Use default values on error
      res.json({ 
        success: true, 
        profile, 
        linearVelocity: formatFloatForJSON(defaultLinear), 
        angularVelocity: formatFloatForJSON(defaultAngular) 
      });
    }
  } catch (error) {
    console.error(`Error reading navigation parameters:`, error);
    res.status(500).json({ 
      success: false, 
      message: 'Error reading navigation parameters',
      error: error.message
    });
  }
});

// POST endpoint to update navigation parameters
router.post('/nav-params', (req, res) => {
  try {
    const { profile, linearVelocity, angularVelocity } = req.body;

    if (!profile || !navProfiles[profile]) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid profile: ${profile}`
      });
    }

    if ((linearVelocity === undefined || isNaN(linearVelocity)) && 
        (angularVelocity === undefined || isNaN(angularVelocity))) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid parameters'
      });
    }

    const profilePath = navProfiles[profile];
    
    // Get default values for this profile
    const defaultLinear = DEFAULT_VALUES.nav_profiles[profile]?.linear || 0.8;
    const defaultAngular = DEFAULT_VALUES.nav_profiles[profile]?.angular || 2.0;
    
    // Ensure the values are within reasonable bounds
    const validLinearVelocity = linearVelocity !== undefined 
      ? Math.max(0.1, Math.min(1.6, parseFloat(linearVelocity))) 
      : defaultLinear;
      
    const validAngularVelocity = angularVelocity !== undefined 
      ? Math.max(1.0, Math.min(15.0, parseFloat(angularVelocity))) 
      : defaultAngular;
    
    // Format for YAML
    const yamlLinear = formatFloatForYaml(validLinearVelocity);
    const yamlAngular = formatFloatForYaml(validAngularVelocity);
    
    // Default data structure
    let data = { 
      robot_parameters: { 
        max_linear_velocity: yamlLinear, 
        max_angular_velocity: yamlAngular 
      } 
    };

    if (fs.existsSync(profilePath)) {
      // Read existing file
      const fileContent = fs.readFileSync(profilePath, 'utf8');
      
      try {
        const existingData = yaml.load(fileContent);
        if (existingData) data = existingData;
      } catch (parseError) {
        console.warn(`Could not parse existing YAML: ${parseError.message}`);
      }
    }
    
    // Make sure robot_parameters section exists
    if (!data.robot_parameters) {
      data.robot_parameters = {};
    }
    
    // Update the values
    data.robot_parameters.max_linear_velocity = yamlLinear;
    data.robot_parameters.max_angular_velocity = yamlAngular;

    // Ensure the directory exists
    const dir = path.dirname(profilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write the updated configuration back to the file
    let yamlContent = yaml.dump(data, yamlOptions);
    yamlContent = yamlContent.replace(/(max_linear_velocity|max_angular_velocity): (\d+)$/gm, '$1: $2.0');
    fs.writeFileSync(profilePath, yamlContent);

    // Format for response
    const formattedLinear = validLinearVelocity.toFixed(1);
    const formattedAngular = validAngularVelocity.toFixed(1);

    res.json({ 
      success: true, 
      message: 'Navigation parameters updated successfully',
      profile,
      linearVelocity: formattedLinear,
      angularVelocity: formattedAngular
    });
  } catch (error) {
    console.error('Error updating navigation parameters:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating navigation parameters',
      error: error.message
    });
  }
});

// GET endpoint to retrieve SIMA parameters
router.get('/sima-params', (req, res) => {
  try {
    const simaJSONPath = path.join(dataDir, 'sima.json');
    
    // Default values
    let params = {
      sima_start_time: 85,
      plan_code: 1
    };
    
    // Check if file exists
    if (!fs.existsSync(simaJSONPath)) {
      // Create default file
      fs.writeFileSync(simaJSONPath, JSON.stringify(params, null, 2));
      console.log('Created default sima.json:', params);
      
      return res.json({ success: true, ...params });
    }

    // Read and parse the JSON file
    try {
      const fileContent = fs.readFileSync(simaJSONPath, 'utf8');
      const data = JSON.parse(fileContent);

      if (data) {
        params.sima_start_time = data.sima_start_time || params.sima_start_time;
        params.plan_code = data.plan_code || params.plan_code;
      }
      
      return res.json({ success: true, ...params });
  } catch (error) {
      console.error('Error parsing sima.json:', error);
      return res.json({ success: true, ...params });
    }
  } catch (error) {
    console.error('Error reading sima.json:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST endpoint to update SIMA parameters
router.post('/sima-params', (req, res) => {
  try {
    const { sima_start_time, plan_code } = req.body;
    const simaJSONPath = path.join(dataDir, 'sima.json');

    // Validate parameters
    if (sima_start_time === undefined || plan_code === undefined) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required parameters' 
      });
    }

    // Create or update the file
    fs.writeFileSync(simaJSONPath, JSON.stringify({
      sima_start_time,
      plan_code
    }, null, 2));

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating SIMA parameters:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

function defaultButtonStates18() {
  return Object.fromEntries([...Array(18).keys()].map((num) => [String(num), false]));
}

/** Splits the playmat tap order: same order as in `sequence`, pantry 0-9 and collection 10-17. */
function missionFromFlatSequence(flat) {
  if (!Array.isArray(flat)) {
    return { pantry_sequence: [], collection_sequence: [] };
  }
  const pantry_sequence = [];
  const collection_sequence = [];
  for (const m of flat) {
    const n = Number(m);
    if (!Number.isInteger(n)) continue;
    if (n >= 0 && n <= 9) pantry_sequence.push(n);
    else if (n >= 10 && n <= 17) collection_sequence.push(n);
  }
  return { pantry_sequence, collection_sequence };
}

/**
 * One document: playmat { states, sequence } with derived pantry/collection in the same file.
 * Legacy: mission_sequence.json is merged once when button.json is missing.
 */
function readButtonDocument() {
  if (!fs.existsSync(buttonStatesPath)) {
    if (fs.existsSync(missionSequencePath) || fs.existsSync(missionSequenceLegacyPath)) {
      const p = fs.existsSync(missionSequencePath) ? missionSequencePath : missionSequenceLegacyPath;
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const st = defaultButtonStates18();
        const doc = {
          states: st,
          sequence: [],
          pantry_sequence: Array.isArray(raw.pantry_sequence) ? raw.pantry_sequence.map(Number) : [],
          collection_sequence: Array.isArray(raw.collection_sequence) ? raw.collection_sequence.map(Number) : [],
        };
        const dir = path.dirname(buttonStatesPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(buttonStatesPath, JSON.stringify(doc, null, 2), 'utf8');
        console.log('Migrated mission_sequence into button.json');
        return doc;
      } catch (e) {
        console.error('Mission migration to button.json failed', e);
      }
    }
    return {
      states: defaultButtonStates18(),
      sequence: [],
      pantry_sequence: [],
      collection_sequence: [],
    };
  }
  const data = JSON.parse(fs.readFileSync(buttonStatesPath, 'utf8'));
  const states = data.states && typeof data.states === 'object' && !Array.isArray(data.states) ? data.states : defaultButtonStates18();
  const sequence = Array.isArray(data.sequence) ? data.sequence : [];
  const derived = missionFromFlatSequence(sequence);
  return {
    states,
    sequence,
    pantry_sequence: Array.isArray(data.pantry_sequence) ? data.pantry_sequence.map(Number) : derived.pantry_sequence,
    collection_sequence: Array.isArray(data.collection_sequence) ? data.collection_sequence.map(Number) : derived.collection_sequence,
  };
}

function writeButtonDocumentFromPlaymat(states, sequence) {
  const dir = path.dirname(buttonStatesPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const m = missionFromFlatSequence(Array.isArray(sequence) ? sequence : []);
  const doc = { states, sequence: Array.isArray(sequence) ? sequence : [], ...m };
  fs.writeFileSync(buttonStatesPath, JSON.stringify(doc, null, 2), 'utf8');
  return doc;
}

/**
 * If playmat sequence is empty, prefer stored mission (migration or manual); else derive from sequence.
 */
function missionForApiResponse(doc) {
  if (Array.isArray(doc.sequence) && doc.sequence.length > 0) {
    return missionFromFlatSequence(doc.sequence);
  }
  return {
    pantry_sequence: Array.isArray(doc.pantry_sequence) ? doc.pantry_sequence : [],
    collection_sequence: Array.isArray(doc.collection_sequence) ? doc.collection_sequence : [],
  };
}

// GET endpoint to retrieve button states (includes mission in button.json; mission derived from sequence when non-empty)
router.get('/button-states', (req, res) => {
  try {
    const doc = readButtonDocument();
    const m = missionForApiResponse(doc);

    res.json({
      success: true,
      states: doc.states,
      sequence: doc.sequence,
      ...m,
    });
  } catch (error) {
    console.error('Error reading button states:', error);
    res.status(500).json({
      success: false,
      message: 'Error reading button states file',
      error: error.message,
    });
  }
});

// POST endpoint: updates states + sequence; overwrites mission fields from derived flat sequence
router.post('/button-states', (req, res) => {
  try {
    const { states, sequence } = req.body;

    if (!states || typeof states !== 'object') {
      console.error('Invalid button states provided:', states);
      return res.status(400).json({
        success: false,
        message: 'Invalid button states',
      });
    }

    const out = writeButtonDocumentFromPlaymat(states, sequence);

    res.json({
      success: true,
      message: 'Button states and sequence updated successfully',
      pantry_sequence: out.pantry_sequence,
      collection_sequence: out.collection_sequence,
    });
  } catch (error) {
    console.error('Error updating button states:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating button states file',
      error: error.message,
    });
  }
});

// --- robot_config (data dir; legacy _black filename still read on GET) ---
const robotConfigPath = path.join(dataDir, 'robot_config.yaml');
const robotConfigLegacyPath = path.join(dataDir, 'robot_config_black.yaml');

const ROBOT_CONFIG_PARAM_KEYS = [
  'pantry_aggressiveness',
  'pantry_sensitivity',
  'pantry_rival_sigma',
  'pantry_rival_distance_threshold',
  'collection_aggressiveness',
  'collection_sensitivity',
  'collection_rival_sigma',
  'collection_rival_distance_threshold',
  'flip_distance_threshold',
  'cursor_tolerance',
];

/** js-yaml prints integer 0,2,-1 as 0,2,-1; ROS param files use x.0. Match indented lines, all supported keys, including negative values. */
const ROBOT_CONFIG_INT_TO_FLOAT_RE = new RegExp(
  `^(\\s*)(${ROBOT_CONFIG_PARAM_KEYS.join('|')}): (-?\\d+)$`,
  'gm',
);

function getDefaultRobotConfigDoc() {
  return {
    '/**': {
      ros__parameters: {
        // Aligned with DEFAULT_ROBOT_CONFIG in src/utils/robotConfigFields.ts
        pantry_aggressiveness: 0.0,
        pantry_sensitivity: 2.0,
        pantry_rival_sigma: 0.3,
        pantry_rival_distance_threshold: 0.3,
        collection_aggressiveness: 0.0,
        collection_sensitivity: 2.0,
        collection_rival_sigma: 0.3,
        collection_rival_distance_threshold: 0.3,
        flip_distance_threshold: 0.1,
        cursor_tolerance: 0.18,
      },
    },
  };
}

function loadRobotConfigYaml() {
  if (fs.existsSync(robotConfigPath)) {
    return yaml.load(fs.readFileSync(robotConfigPath, 'utf8'));
  }
  if (fs.existsSync(robotConfigLegacyPath)) {
    return yaml.load(fs.readFileSync(robotConfigLegacyPath, 'utf8'));
  }
  return getDefaultRobotConfigDoc();
}

function getRosParamsFromDoc(doc) {
  if (!doc || typeof doc !== 'object') return {};
  const k = Object.keys(doc).find((x) => doc[x] && typeof doc[x] === 'object' && doc[x].ros__parameters);
  if (!k) return {};
  return doc[k].ros__parameters && typeof doc[k].ros__parameters === 'object'
    ? { ...doc[k].ros__parameters }
    : {};
}

router.get('/robot-config', (req, res) => {
  try {
    const doc = loadRobotConfigYaml();
    const rp = getRosParamsFromDoc(doc);
    const params = {};
    for (const key of ROBOT_CONFIG_PARAM_KEYS) {
      if (rp[key] !== undefined && rp[key] !== null) params[key] = rp[key];
    }
    res.json({ success: true, params });
  } catch (e) {
    console.error('robot-config GET', e);
    res.status(500).json({ success: false, message: String(e.message) });
  }
});

router.post('/robot-config', (req, res) => {
  try {
    const doc = loadRobotConfigYaml();
    const k = Object.keys(doc).find(
      (x) => doc[x] && typeof doc[x] === 'object' && doc[x].ros__parameters !== undefined
    );
    if (!k) {
      return res.status(500).json({ success: false, message: 'Invalid YAML shape' });
    }
    if (!doc[k].ros__parameters) doc[k].ros__parameters = {};
    for (const key of ROBOT_CONFIG_PARAM_KEYS) {
      if (req.body[key] === undefined) continue;
      const v = req.body[key];
      if (typeof v === 'number' && !Number.isNaN(v)) {
        doc[k].ros__parameters[key] = v;
      }
    }
    delete doc[k].ros__parameters.robot_name;
    let out = yaml.dump(doc, yamlOptions);
    out = out.replace(ROBOT_CONFIG_INT_TO_FLOAT_RE, '$1$2: $3.0');
    const dir = path.dirname(robotConfigPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(robotConfigPath, out);
    res.json({ success: true, message: 'robot_config.yaml updated' });
  } catch (e) {
    console.error('robot-config POST', e);
    res.status(500).json({ success: false, message: String(e.message) });
  }
});

router.get('/mission-sequence', (req, res) => {
  try {
    if (!fs.existsSync(buttonStatesPath) && !fs.existsSync(missionSequencePath) && !fs.existsSync(missionSequenceLegacyPath)) {
      return res.json({ success: true, pantry_sequence: [], collection_sequence: [] });
    }
    const doc = readButtonDocument();
    const m = missionForApiResponse(doc);
    res.json({ success: true, ...m });
  } catch (e) {
    console.error('mission-sequence GET', e);
    res.status(500).json({ success: false, message: String(e.message) });
  }
});

/** Same data as in button.json; if playmat sequence is non-empty, mission is derived from it. */
router.post('/mission-sequence', (req, res) => {
  try {
    const { pantry_sequence, collection_sequence } = req.body || {};
    const out = {
      pantry_sequence: Array.isArray(pantry_sequence) ? pantry_sequence.map(Number) : [],
      collection_sequence: Array.isArray(collection_sequence) ? collection_sequence.map(Number) : [],
    };
    const doc = readButtonDocument();
    const next = {
      ...doc,
      pantry_sequence: out.pantry_sequence,
      collection_sequence: out.collection_sequence,
    };
    const dir = path.dirname(buttonStatesPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(buttonStatesPath, JSON.stringify(next, null, 2), 'utf8');
    res.json({ success: true, message: 'mission stored in button.json', ...out });
  } catch (e) {
    console.error('mission-sequence POST', e);
    res.status(500).json({ success: false, message: String(e.message) });
  }
});

// POST: reset all parameters to defaults (rival, nav, SIMA, robot_config, mission) — after robot/mission paths exist
router.post('/reset-to-defaults', (req, res) => {
  try {
    console.log('Reset all parameters to defaults API called');
    
    // 1. Reset rival_params.yaml
    const rivalDefaultData = {
      nav_rival_parameters: {
        rival_inscribed_radius: formatFloatForYaml(DEFAULT_VALUES.nav_rival_radius)
      },
      dock_rival_parameters: {
        dock_rival_radius: formatFloatForYaml(DEFAULT_VALUES.dock_rival_radius),
        dock_rival_degree: DEFAULT_VALUES.dock_rival_degree
      }
    };
    
    // Ensure the directory exists
    if (!fs.existsSync(dataDir)) {
      console.log('Creating data directory:', dataDir);
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Write rival_params.yaml with formatted values
    let yamlContent = yaml.dump(rivalDefaultData, yamlOptions);

    // Force decimal format for integers by replacing "x:" with "x.0:"
    yamlContent = yamlContent.replace(/(rival_inscribed_radius|dock_rival_radius): (\d+)$/gm, '$1: $2.0');

    // Now write the modified content to file
    fs.writeFileSync(rivalParamsPath, yamlContent);
    console.log('Reset rival_params.yaml');
    
    // 2. Reset all navigation profiles
    const navProfiles = Object.keys(DEFAULT_VALUES.nav_profiles);
    for (const profile of navProfiles) {
      const profilePath = path.join(dataDir, `nav_${profile}_params.yaml`);
      
      // Use numeric values for floats
      const profileData = {
        robot_parameters: {
          max_linear_velocity: formatFloatForYaml(DEFAULT_VALUES.nav_profiles[profile].linear),
          max_angular_velocity: formatFloatForYaml(DEFAULT_VALUES.nav_profiles[profile].angular)
        }
      };
      
      // Write YAML content to a string first
      let profYaml = yaml.dump(profileData, yamlOptions);
      
      // Force decimal format for integers by replacing "x:" with "x.0:"
      profYaml = profYaml.replace(/(max_angular_velocity|max_linear_velocity): (\d+)$/gm, '$1: $2.0');
      
      // Now write the modified content to file
      fs.writeFileSync(profilePath, profYaml);
      console.log(`Reset ${profile} navigation profile`);
    }
    
    // 3. Reset SIMA parameters
    fs.writeFileSync(simaJSONPath, JSON.stringify({
      sima_start_time: DEFAULT_VALUES.sima_start_time,
      plan_code: DEFAULT_VALUES.sima_plan_code
    }, null, 2));
    console.log('Reset sima.json with sima_start_time and plan_code');
    
    // 4. Reset robot_config.yaml
    const defaultRobotDoc = getDefaultRobotConfigDoc();
    let outRobot = yaml.dump(defaultRobotDoc, yamlOptions);
    outRobot = outRobot.replace(ROBOT_CONFIG_INT_TO_FLOAT_RE, '$1$2: $3.0');
    const rcDir = path.dirname(robotConfigPath);
    if (!fs.existsSync(rcDir)) {
      fs.mkdirSync(rcDir, { recursive: true });
    }
    fs.writeFileSync(robotConfigPath, outRobot, 'utf8');
    console.log('Reset robot_config.yaml');
    
    // 5. Reset playmat + mission in button.json (mission derived from empty sequence)
    const missionOut = { pantry_sequence: [], collection_sequence: [] };
    writeButtonDocumentFromPlaymat(defaultButtonStates18(), []);
    console.log('Reset button.json (states, sequence, pantry/collection)');
    
    // Defaults for response (and frontend state sync)
    const defaultRc = {};
    const rcp0 = getRosParamsFromDoc(getDefaultRobotConfigDoc());
    for (const key of ROBOT_CONFIG_PARAM_KEYS) {
      if (rcp0[key] !== undefined && rcp0[key] !== null) {
        defaultRc[key] = rcp0[key];
      }
    }
    
    // Format values for response to ensure consistent decimal places
    const responseData = {
      success: true,
      message: 'All parameters reset to defaults',
      defaults: {
        nav_rival_radius: formatFloatForJSON(DEFAULT_VALUES.nav_rival_radius),
        dock_rival_radius: formatFloatForJSON(DEFAULT_VALUES.dock_rival_radius),
        dock_rival_degree: DEFAULT_VALUES.dock_rival_degree,
        nav_profiles: {},
        sima_start_time: DEFAULT_VALUES.sima_start_time,
        plan_code: DEFAULT_VALUES.sima_plan_code,
        robot_config: defaultRc,
        mission: { pantry_sequence: missionOut.pantry_sequence, collection_sequence: missionOut.collection_sequence },
      }
    };
    
    // Format navigation profiles for response
    for (const profile in DEFAULT_VALUES.nav_profiles) {
      responseData.defaults.nav_profiles[profile] = {
        linear: formatFloatForJSON(DEFAULT_VALUES.nav_profiles[profile].linear),
        angular: formatFloatForJSON(DEFAULT_VALUES.nav_profiles[profile].angular)
      };
    }
    
    res.json(responseData);
  } catch (error) {
    console.error('Error resetting parameters:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error resetting parameters',
      error: error.message
    });
  }
});

export default router;

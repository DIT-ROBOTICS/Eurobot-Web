// fileOperations.ts - Functions for reading and writing to configuration files

/**
 * Read the rival robot parameters from the YAML file
 * @returns The rival inscribed radius in centimeters
 */
export async function getRivalRadius(): Promise<number> {
  try {
    const response = await fetch('/api/rival-radius');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    // Convert from meters to centimeters for display
    return data.radius * 100;
  } catch (error) {
    console.error('Error fetching rival radius:', error);
    // Return a default value in case of error
    return 22;
  }
}

/**
 * Update the rival robot parameters in the YAML file
 * @param radiusCm The rival inscribed radius in centimeters
 * @returns Success status and message
 */
export async function updateRivalRadius(radiusCm: number): Promise<{ success: boolean; message: string }> {
  try {
    // Convert from centimeters to meters for storage
    const radiusM = radiusCm / 100;
    
    const response = await fetch('/api/rival-radius', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ radius: radiusM }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating rival radius:', error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get the button states and sequence from the server
 * @returns Object with button states (key: button number, value: boolean) and sequence (number[])
 */
export async function getButtonStatesAndSequence(): Promise<{ states: Record<number, boolean>, sequence: number[] }> {
  try {
    const response = await fetch('/api/button-states');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.success && data.states && Array.isArray(data.sequence)) {
      return { states: data.states, sequence: data.sequence };
    } else {
      throw new Error('Invalid response format from server');
    }
  } catch (error) {
    console.error('Error fetching button states and sequence:', error);
    // Return default states (all false) and empty sequence in case of error
    return {
      states: Object.fromEntries([...Array(18).keys()].map((num) => [num, false])),
      sequence: [],
    };
  }
}

/**
 * Update the button states and sequence on the server
 * @param states Object with button states (key: button number, value: boolean)
 * @param sequence Array of button press order
 * @returns Success status and message
 */
export async function updateButtonStatesAndSequence(states: Record<number, boolean>, sequence: number[]): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('/api/button-states', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ states, sequence }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating button states and sequence:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
} 
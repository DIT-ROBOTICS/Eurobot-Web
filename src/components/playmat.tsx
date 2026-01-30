import React, { useRef, useEffect, useCallback, useState } from 'react';

// Remove inline type declaration
// declare module '*.png' {
//   const content: string;
//   export default content;
// }

import playmatImage from "../assets/playmat_2026_FINAL.png";
import { useRosConnection } from "../utils/useRosConnection";
import { getButtonStatesAndSequence, updateButtonStatesAndSequence } from "../api/fileOperations";

// Define plan sequence type
interface PlanSequence {
  id: number;
  sequence: number[];
  description: string;
}

// Default plan sequences
const DEFAULT_PLANS: PlanSequence[] = [
  { id: 1, sequence: [1, 2, 4, 8, 16], description: 'Plan A' },
  { id: 2, sequence: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 0], description: 'Plan X' },
];

export default function Playmat() {
  const [estimatedScore, setEstimatedScore] = useState(128);
  const [isHalfScreen, setIsHalfScreen] = useState(false);
  const { connected, getTopicHandler, getServiceServer } = useRosConnection();
  // For storing button states
  const [toggleStates, setToggleStates] = useState<Record<number, boolean>>(
    Object.fromEntries([...Array(20).keys()].map(num => [num, false]))
  );
  // Loading state
  const [isLoading, setIsLoading] = useState(true);
  // Long press reset state
  const [pressTimer, setPressTimer] = useState<any>(null);
  const [pressProgress, setPressProgress] = useState(0);
  
  // Plan management states
  const [currentSequence, setCurrentSequence] = useState<number[]>([]);
  const [plans, setPlans] = useState<PlanSequence[]>(DEFAULT_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  
  // UI interaction states  
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Service server states managed via refs
  
  // Use ref to store the latest selectedPlanId for service callback access
  const selectedPlanIdRef = useRef<number | null>(null);
  
  // Use ref to store ROS connection and service server to prevent recreation
  const rosConnectionRef = useRef<any>(null);
  const serviceServerRef = useRef<any>(null);
  
  // Sync selectedPlanId to ref
  useEffect(() => {
    selectedPlanIdRef.current = selectedPlanId;
  }, [selectedPlanId]);
  
  // Detect half-screen mode
  useEffect(() => {
    try {
      const savedValue = localStorage.getItem('isHalfScreen');
      setIsHalfScreen(savedValue === 'true');
    } catch (error) {
      console.warn('Could not detect half screen mode:', error);
    }
    
    // Listen for changes to half-screen mode
    const checkHalfScreen = () => {
      try {
        const savedValue = localStorage.getItem('isHalfScreen');
        setIsHalfScreen(savedValue === 'true');
      } catch (error) {
        console.warn('Could not detect half screen mode:', error);
      }
    };
    
    window.addEventListener('storage', checkHalfScreen);
    return () => window.removeEventListener('storage', checkHalfScreen);
  }, []);
  
  // Load initial button states from server
  useEffect(() => {
    const fetchButtonStates = async () => {
      setIsLoading(true);
      try {
        const { states, sequence } = await getButtonStatesAndSequence();
        setToggleStates(states);
        setCurrentSequence(sequence);
        // According to the sequence, select the most similar plan
        setSelectedPlanId(findMostSimilarPlan(sequence));
      } catch (error) {
        console.error("Error loading button states and sequence:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchButtonStates();
  }, []);

  // Subscribe to score topics from ROS
  useEffect(() => {
    if (!connected || typeof window === 'undefined' || !window.ROSLIB) {
      return;
    }

    let scoreReceived = false;
    let lastScoreTime = 0;
    const TIMEOUT_MS = 1000; // 1 second timeout to consider a topic as disconnected

    // Create topics for score updates
    const scoreTopic = getTopicHandler('/score', 'std_msgs/msg/Int32');
    const idealScoreTopic = getTopicHandler('/robot/startup/ideal_score', 'std_msgs/msg/Int32');
    
    // Function to check if primary topic is alive
    const isPrimaryTopicAlive = () => {
      return Date.now() - lastScoreTime < TIMEOUT_MS;
    };

    // Timer to check connection status
    const connectionTimer = setInterval(() => {
      if (!isPrimaryTopicAlive()) {
        scoreReceived = false;
      }
    }, 500);

    if (scoreTopic) {
      // Subscribe to the primary score topic
      scoreTopic.subscribe((message: any) => {
        const score = parseInt(message.data);
        if (!isNaN(score)) {
          scoreReceived = true;
          lastScoreTime = Date.now();
          setEstimatedScore(score);
        }
      });
    }

    if (idealScoreTopic) {
      // Subscribe to the fallback score topic
      idealScoreTopic.subscribe((message: any) => {
        const score = parseInt(message.data);
        if (!isNaN(score) && !scoreReceived) {
          setEstimatedScore(score);
        }
      });
    }
    
    // Clean up subscriptions and timer
    return () => {
      try {
        if (scoreTopic) scoreTopic.unsubscribe();
        if (idealScoreTopic) idealScoreTopic.unsubscribe();
        clearInterval(connectionTimer);
      } catch (e) {
        console.error("Error unsubscribing from score topics:", e);
      }
    };
  }, [connected, getTopicHandler]);

  // Function to toggle button state
  const toggleButton = (button: keyof typeof toggleStates) => {
    const newStates = {
      ...toggleStates,
      [button]: !toggleStates[button]
    };
    
    setToggleStates(newStates);
    
    // Save the updated states to the server
    updateButtonStatesAndSequence(newStates, currentSequence).catch(error => {
      console.error("Error saving button states:", error);
    });
  };

  // Function to reset all buttons
  const handleResetButtons = async () => {
    try {
      setIsLoading(true);
      await updateButtonStatesAndSequence(Object.fromEntries([...Array(20).keys()].map(num => [num, false])), []);
      // Show temporary feedback that reset happened (could add a flash effect here)
    } catch (error) {
      console.error("Error resetting button states:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Set base button sizes
  const buttonSizes = {
    largeSquare: isHalfScreen ? "w-[170px] h-[170px]" : "w-[250px] h-[250px]",
    wideRect: isHalfScreen ? "w-[170px] h-[70px]" : "w-[150px] h-[100px]",
    tallRect: isHalfScreen ? "w-[80px] h-[180px]" : "w-[80px] h-[150px]",
    smallSquare: isHalfScreen ? "w-[500px] h-[85px]" : "w-[100px] h-[100px]"
  };

  // Button font sizes
  const fontSize = {
    large: isHalfScreen ? "text-3xl" : "text-4xl",
    medium: isHalfScreen ? "text-2xl" : "text-3xl"
  };

  // Adjust container for half-screen mode without changing the image
  const containerClasses = isHalfScreen 
    ? "relative flex items-center justify-center h-full bg-[#0e0e0e] transform-gpu origin-center"
    : "relative flex items-center justify-center h-full bg-[#0e0e0e]";

  // Load plans from localStorage
  useEffect(() => {
    try {
      const savedPlans = localStorage.getItem('savedPlans');
      if (savedPlans) {
        setPlans(JSON.parse(savedPlans));
      }
    } catch (error) {
      console.error('Error loading saved plans:', error);
    }
  }, []);

  // Save plans to localStorage
  const savePlans = useCallback((newPlans: PlanSequence[]) => {
    try {
      localStorage.setItem('savedPlans', JSON.stringify(newPlans));
      setPlans(newPlans);
    } catch (error) {
      console.error('Error saving plans:', error);
    }
  }, []);

  // File upload handler
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const newPlans = JSON.parse(content);
          if (Array.isArray(newPlans)) {
            savePlans(newPlans);
          }
        } catch (error) {
          console.error('Error parsing uploaded file:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  // Calculate sequence similarity
  const calculateSimilarity = (seq1: number[], seq2: number[]): number => {
    let matches = 0;
    const minLength = Math.min(seq1.length, seq2.length);
    
    for (let i = 0; i < minLength; i++) {
      if (seq1[i] === seq2[i]) {
        matches++;
      }
    }
    
    return matches / Math.max(seq1.length, seq2.length);
  };

  // Find the most similar plan
  const findMostSimilarPlan = (sequence: number[]): number | null => {
    if (sequence.length === 0) return null;
    
    let maxSimilarity = 0;
    let mostSimilarPlanId = null;
    
    plans.forEach((p: PlanSequence) => {
      const similarity = calculateSimilarity(sequence, p.sequence);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarPlanId = p.id;
      }
    });
    
    return mostSimilarPlanId;
  };

  // Handle button click
  const handleButtonClick = (buttonId: number) => {
    setToggleStates((prevStates: Record<number, boolean>) => {
      // If button is already in sequence, don't change its state
      const newStates = { ...prevStates };
      if (!currentSequence.includes(buttonId)) {
        newStates[buttonId] = !prevStates[buttonId];
      }
      // Allow duplicates, push each time
      setCurrentSequence((prevSeq: number[]) => {
        const newSeq = [...prevSeq, buttonId];
        setSelectedPlanId(findMostSimilarPlan(newSeq));
        updateButtonStatesAndSequence(newStates, newSeq); // Sync to server
        return newSeq;
      });
      return newStates;
    });
  };

  // Setup service server with stable connection
  useEffect(() => {
    if (!connected || typeof window === 'undefined' || !window.ROSLIB) {
      // Clean up existing service server if connection is lost
      if (serviceServerRef.current) {
        try {
          console.log('Cleaning up service server due to connection loss...');
          serviceServerRef.current.unadvertise();
          serviceServerRef.current = null;
        } catch (e) {
          console.error('Error cleaning up service server:', e);
        }
      }
      return;
    }

    // Get service server instance
    const server = getServiceServer('/robot/startup/web_plan', 'std_srvs/srv/Trigger');
    if (!server) {
      return;
    }

    // Check if we already have a service server with the same ROS connection
    if (serviceServerRef.current && rosConnectionRef.current === server.ros) {
      console.log('Service server already exists and connection is stable');
      return;
    }

    // Clean up existing service server if ROS connection changed
    if (serviceServerRef.current) {
      try {
        console.log('Cleaning up existing service server due to connection change...');
        serviceServerRef.current.unadvertise();
      } catch (e) {
        console.error('Error cleaning up existing service server:', e);
      }
    }

    try {
      // Setup the service server

      // Handle service requests
      server.advertise((request: any, response: any) => {
        console.log('Service request received:', request);
        
        // Get current selected plan ID from ref (always up-to-date)
        const planId = selectedPlanIdRef.current || 0;
        response.success = true;
        response.message = planId.toString();
        
        console.log(`Service responding with plan ID: ${planId}`);
        return true;
      });

      // Store references
      serviceServerRef.current = server;
      rosConnectionRef.current = server.ros;
      console.log('Service server created successfully: /robot/startup/web_plan');

    } catch (error) {
      console.error('Error creating service server:', error);
    }

    return () => {
      // Cleanup on unmount only
      if (serviceServerRef.current) {
        try {
          console.log('Unmounting: Stopping service server...');
          serviceServerRef.current.unadvertise();
          serviceServerRef.current = null;
          rosConnectionRef.current = null;
        } catch (e) {
          console.error('Error stopping service server during unmount:', e);
        }
      }
    };
  }, [connected]); // Only depend on connected state

  // Handle confirm button
  const handleConfirm = () => {
    if (selectedPlanId) {
      setIsConfirming(true);
      setIsSuccess(true);
      
      // Show success state for 2 seconds, then reset
      setTimeout(() => {
        setIsSuccess(false);
        setIsConfirming(false);
      }, 2000);
    }
  };

  // Handle reset button
  const handleReset = () => {
    setCurrentSequence([]);
    setSelectedPlanId(null);
    setIsConfirming(false);
    setIsSuccess(false);
    const resetStates = Object.fromEntries([...Array(20).keys()].map(num => [num, false]));
    setToggleStates(resetStates);
    updateButtonStatesAndSequence(resetStates, []);
  };

  // Get button visual state
  const getButtonVisualState = (buttonId: number) => {
    // If button is in current sequence
    const sequenceIndex = currentSequence.indexOf(buttonId);
    if (sequenceIndex !== -1) {
      return {
        bg: "bg-[#121212]",
        text: "text-white",
        border: "border-white border-2"
      };
    }
    
    // If button is in selected plan sequence
    if (selectedPlanId) {
      const selectedPlan = plans.find((p: PlanSequence) => p.id === selectedPlanId);
      if (selectedPlan && selectedPlan.sequence.includes(buttonId)) {
        return {
          bg: "bg-white/10",
          text: "text-white/80",
          border: "border-white/80 border-2"
        };
      }
    }
    
    // Default state
    return {
      bg: "bg-[#121212]",
      text: "text-[#666666]",
      border: "border-[#333333] hover:border-white hover:text-white border-2"
    };
  };

  // Update button className
  const getButtonClassName = (buttonId: number, baseClasses: string) => {
    const visualState = getButtonVisualState(buttonId);
    return `${baseClasses} ${visualState.bg} ${visualState.text} ${visualState.border} transition-all duration-200`;
  };

  return (
    <div className={containerClasses}>
      {/* Image container */}
      <div className={isHalfScreen ? "relative transform-gpu scale-[0.92]" : "relative"}>
      <img
        src={playmatImage}
        alt="Eurobot 2026 Playmat"
        className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-lg"
      />

        {/* Change circular buttons to rounded squares (0-9) - using red-black theme */}
        {/* Button 0 - Top right - Blue */}
        <button
          className={getButtonClassName(0, `absolute top-[23.7%] right-[39.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(0)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>0</span>
        </button>

        {/* Button 1 - Right side - Black */}
        <button
          className={getButtonClassName(1, `absolute top-[34%] right-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(1)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>1</span>
        </button>

        {/* Button 2 - Bottom right - Black */}
        <button
          className={getButtonClassName(2, `absolute bottom-[15%] right-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(2)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>2</span>
        </button>

        {/* Button 3 - Right middle bottom - Black */}
        <button
          className={getButtonClassName(3, `absolute bottom-[36.3%] right-[24.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(3)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>3</span>
        </button>

        {/* Button 4 - Right bottom side - Black */}
        <button
          className={getButtonClassName(4, `absolute bottom-[36.3%] right-[34.5%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(4)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>4</span>
        </button>

        {/* Button 5 - Bottom middle left - Black */}
        <button
          className={getButtonClassName(5, `absolute bottom-[36.3%] left-[34.5%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(5)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>5</span>
        </button>

        {/* Button 6 - Middle bottom - Black */}
        <button
          className={getButtonClassName(6, `absolute bottom-[36.3%] left-[24.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(6)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>6</span>
        </button>

        {/* Button 7 - Bottom left - Black */}
        <button
          className={getButtonClassName(7, `absolute bottom-[15%] left-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(7)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>7</span>
        </button>

        {/* Button 8 - Left side - Black */}
        <button
          className={getButtonClassName(8, `absolute top-[34%] left-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(8)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>8</span>
        </button>

        {/* Button 9 - Top left - Yellow */}
        <button
          className={getButtonClassName(9, `absolute top-[23.7%] left-[39.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(9)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>9</span>
        </button>

        {/* Square buttons (10-19) - Using background color scheme */}
        {/* Button 10 - Top left square - Yellow */}
        <button
          className={getButtonClassName(10, `absolute top-[2%] left-[6.5%] ${buttonSizes.largeSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(10)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>10</span>
        </button>

        {/* Button 11 - Right side square - Yellow */}
        <button
          className={getButtonClassName(11, `absolute top-[56.3%] right-[0.9%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(11)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>11</span>
        </button>

        {/* Button 12 - Bottom right corner square - Yellow */}
        <button
          className={getButtonClassName(12, `absolute bottom-[6%] right-[33%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(12)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>12</span>
        </button>

        {/* Button 13 - Bottom middle square - Yellow */}
        <button
          className={getButtonClassName(13, `absolute bottom-[1.5%] left-[47.6%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(13)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>13</span>
        </button>

        {/* Button 14 - Bottom left square - Yellow */}
        <button
          className={getButtonClassName(14, `absolute bottom-[1.3%] left-[21%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(14)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>14</span>
        </button>

        {/* Button 15 - Left side square - Blue */}
        <button
          className={getButtonClassName(15, `absolute top-[56.3%] left-[0.9%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(15)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>15</span>
        </button>

        {/* Button 16 - Bottom left corner square - Blue */}
        <button
          className={getButtonClassName(16, `absolute bottom-[6%] left-[33%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(16)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>16</span>
        </button>

        {/* Button 17 - Bottom right square - Blue */}
        <button
          className={getButtonClassName(17, `absolute bottom-[36.3%] right-[47.5%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(17)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>17</span>
        </button>

        {/* Button 18 - Bottom right square - Blue */}
        <button
          className={getButtonClassName(18, `absolute bottom-[1.3%] right-[21%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(18)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>18</span>
        </button>

        {/* Button 19 - Top right corner square - Blue */}
        <button
          className={getButtonClassName(19, `absolute top-[2%] right-[6.5%] ${buttonSizes.largeSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(19)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>19</span>
        </button>


        {/* Score display - Smoky dark glass effect */}
        <div className="absolute top-[43%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-15 px-12 py-8 rounded-xl border-0 shadow-lg min-w-[400px] backdrop-blur-lg">
          <div className="text-[#ff4d4d] text-3xl uppercase tracking-wider mb-5 text-center font-bold text-shadow-lg">Estimated Score</div>
          <div className="text-white text-9xl font-bold text-center tracking-wider text-shadow-lg drop-shadow-lg">{estimatedScore}</div>
        </div>

        {/* Integrated Control Panel */}
        <div className={`absolute left-1/2 transform -translate-x-1/2 z-50 bg-black/80 backdrop-blur-xl rounded-2xl p-6 w-[90%] max-w-[600px] border border-[#333333] shadow-2xl ${
          isHalfScreen ? '-top-70' : 'top-5'
        }`}>
          <div className="flex flex-col gap-4">
            {/* Top Section: Sequence Display and Plan Selection */}
            <div className="space-y-3">
              <div className="text-lg text-white font-medium">
                <div 
                  className="whitespace-nowrap overflow-x-auto scrollbar-hide pb-2" 
                  style={{ 
                    msOverflowStyle: 'none', 
                    scrollbarWidth: 'none',
                    WebkitOverflowScrolling: 'touch'
                  }}
                  ref={(el) => {
                    if (el) {
                      el.scrollLeft = el.scrollWidth;
                    }
                  }}
                >
                  <span className="text-white/60 text-lg">Sequence:</span>
                  <span className="text-white text-xl tracking-wider font-medium ml-4">
                    {currentSequence.map((num, index) => (
                      <span key={index}>
                        {index > 0 && <span className="text-white/40 mx-2">•</span>}
                        {num}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <select
                    value={selectedPlanId || ''}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                      const planId = parseInt(e.target.value);
                      setSelectedPlanId(planId);
                    }}
                    className="w-full bg-[#121212] text-white px-4 py-3 rounded-xl border border-[#333333] focus:outline-none focus:border-white text-lg appearance-none cursor-pointer hover:bg-[#1a1a1a]"
                    style={{
                      WebkitAppearance: 'none',
                      MozAppearance: 'none',
                      backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 1rem top 50%',
                      backgroundSize: '0.8rem auto',
                      paddingRight: '2.5rem'
                    }}
                  >
                    <option value="">Select a plan</option>
                    {plans.map((plan: PlanSequence) => (
                      <option key={plan.id} value={plan.id}>
                        Plan {plan.id} - {plan.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="planFileUpload"
                  />
                  <label
                    htmlFor="planFileUpload"
                    className="inline-flex items-center px-4 py-3 bg-[#121212] text-white rounded-xl border border-[#333333] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload Plans
                  </label>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#333333] my-2"></div>

            {/* Bottom Section: Action Buttons */}
            <div className="flex items-center justify-between gap-4">
              {/* Reset Button */}
              <div
                className="flex-1 relative group"
                onMouseDown={() => {
                  const timer = setInterval(() => {
                    setPressProgress((prev: number) => {
                      const newProgress = prev + (100/10);
                      if (newProgress >= 100) {
                        handleReset();
                        clearInterval(timer);
                        return 0;
                      }
                      return newProgress;
                    });
                  }, 100);
                  setPressTimer(timer);
                }}
                onMouseUp={() => {
                  if (pressTimer) {
                    clearInterval(pressTimer);
                    setPressTimer(null);
                    setPressProgress(0);
                  }
                }}
                onMouseLeave={() => {
                  if (pressTimer) {
                    clearInterval(pressTimer);
                    setPressTimer(null);
                    setPressProgress(0);
                  }
                }}
                onTouchStart={() => {
                  const timer = setInterval(() => {
                    setPressProgress((prev: number) => {
                      const newProgress = prev + (100/10);
                      if (newProgress >= 100) {
                        handleReset();
                        clearInterval(timer);
                        return 0;
                      }
                      return newProgress;
                    });
                  }, 100);
                  setPressTimer(timer);
                }}
                onTouchEnd={() => {
                  if (pressTimer) {
                    clearInterval(pressTimer);
                    setPressTimer(null);
                    setPressProgress(0);
                  }
                }}
              >
                <div className="flex items-center justify-center gap-3 px-6 py-3 bg-[#121212] rounded-xl border border-white hover:bg-white/5 transition-all cursor-pointer">
                  <div className="relative">
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="absolute inset-0 w-4 h-4 rounded-full bg-white animate-ping opacity-75"></div>
                  </div>
                  <span className="text-white font-medium">Hold to Reset</span>
                </div>
                {pressProgress > 0 && (
                  <div className="absolute bottom-0 left-0 h-1 bg-white rounded-b-xl transition-all" style={{ width: `${pressProgress}%` }}></div>
                )}
              </div>

              {/* Confirm Button */}
              <button
                onClick={handleConfirm}
                disabled={!selectedPlanId || isConfirming}
                className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                  !selectedPlanId
                    ? 'bg-[#121212] text-[#666666] cursor-not-allowed border border-[#333333]'
                    : isSuccess
                    ? 'bg-green-600 text-white border border-green-600'
                    : 'bg-white text-black hover:bg-[#f0f0f0] shadow-lg shadow-white/20'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {isSuccess ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Plan Confirmed</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Confirm Plan {selectedPlanId || ''}</span>
                    </>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

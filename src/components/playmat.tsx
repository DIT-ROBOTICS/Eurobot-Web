import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { PLAYMAT_BACKGROUNDS, DEFAULT_PLAYMAT_BG_ID } from '../assets/playmatBackgrounds';
import { PLAYMAT_BG_ID_KEY } from '../utils/storageKeys';
import { useRosConnection } from "../utils/useRosConnection";
import { getButtonStatesAndSequence, updateButtonStatesAndSequence } from "../api/fileOperations";
import { clsx } from "clsx";
import { validateJsonMissionPlansJson } from "../utils/uploadValidation";

const MISSION_INDEX_COUNT = 18; // 0-17: pantry 0-9, collection 10-17 (issue #2)

/** Pre-2026 field id on the asset (0-9, 11-18; 10/19 are removed) -> mission index. */
const LEGACY_FIELD_ID_TO_MISSION: Record<number, number> = {
  0: 6, 1: 15, 2: 14, 3: 7, 4: 17, 5: 12, 6: 2, 7: 10, 8: 11, 9: 3, 11: 9, 12: 16, 13: 4, 14: 1, 15: 0, 16: 13, 17: 5, 18: 8,
};

function defaultMissionButtonStates(): Record<number, boolean> {
  return Object.fromEntries([...Array(MISSION_INDEX_COUNT).keys()].map((n) => [n, false])) as Record<
    number,
    boolean
  >;
}

type MigrateResult = { states: Record<number, boolean>; sequence: number[]; changed: boolean };

function migrateButtonLoad(states: Record<number, boolean | undefined>, sequence: number[]): MigrateResult {
  const keys = Object.keys(states || {}).map(Number);
  const hasLegacySlots = keys.includes(10) || keys.includes(19) || keys.length > 18;
  const hasLegacyInSeq = sequence.some((n) => n === 10 || n === 19);
  const isLegacy = hasLegacySlots || hasLegacyInSeq;

  if (isLegacy) {
    const s = defaultMissionButtonStates();
    for (const legacy of Object.keys(LEGACY_FIELD_ID_TO_MISSION).map(Number)) {
      const m = LEGACY_FIELD_ID_TO_MISSION[legacy];
      s[m] = Boolean(states[legacy]);
    }
    const newSeq: number[] = [];
    for (const id of sequence) {
      if (id === 10 || id === 19) continue;
      const m = LEGACY_FIELD_ID_TO_MISSION[id];
      if (m !== undefined) newSeq.push(m);
    }
    return { states: s, sequence: newSeq, changed: true };
  }

  const s = defaultMissionButtonStates();
  for (let m = 0; m < MISSION_INDEX_COUNT; m++) {
    s[m] = Boolean(states[m]);
  }
  const newSeq = sequence.filter(
    (n) => Number.isInteger(n) && n >= 0 && n < MISSION_INDEX_COUNT
  );
  const changed = newSeq.length !== sequence.length;
  return { states: s, sequence: newSeq, changed };
}

// Define plan sequence type
interface PlanSequence {
  id: number;
  sequence: number[];
  description: string;
}

// Default plan sequences (mission indices 0-17; remove corner slots 10/19)
const DEFAULT_PLANS: PlanSequence[] = [
  { id: 1, sequence: [0, 1, 2, 3, 4], description: "Plan A" },
  { id: 2, sequence: [...Array(18).keys()], description: "Plan X" },
];

export default function Playmat() {
  const [playmatBgId, setPlaymatBgId] = useState(() => {
    try {
      return localStorage.getItem(PLAYMAT_BG_ID_KEY) || DEFAULT_PLAYMAT_BG_ID;
    } catch {
      return DEFAULT_PLAYMAT_BG_ID;
    }
  });
  const playmatImage = useMemo(
    () => PLAYMAT_BACKGROUNDS.find((p) => p.id === playmatBgId)?.src ?? PLAYMAT_BACKGROUNDS[0].src,
    [playmatBgId]
  );
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [estimatedScore, setEstimatedScore] = useState(128);
  const [isHalfScreen, setIsHalfScreen] = useState(false);
  const { connected, getTopicHandler, getServiceServer } = useRosConnection();
  // For storing button states
  const [toggleStates, setToggleStates] = useState<Record<number, boolean>>(() => defaultMissionButtonStates());
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
    const onPlaymat = () => {
      try {
        setPlaymatBgId(localStorage.getItem(PLAYMAT_BG_ID_KEY) || DEFAULT_PLAYMAT_BG_ID);
      } catch { /* */ }
    };
    window.addEventListener('storage', checkHalfScreen);
    window.addEventListener('eurobot-playmat-bg', onPlaymat);
    return () => {
      window.removeEventListener('storage', checkHalfScreen);
      window.removeEventListener('eurobot-playmat-bg', onPlaymat);
    };
  }, []);
  
  // Load initial state from /api/button-states (playmat + derived pantry/collection in button.json)
  useEffect(() => {
    const fetchButtonStates = async () => {
      setIsLoading(true);
      try {
        const { states, sequence } = await getButtonStatesAndSequence();
        const migrated = migrateButtonLoad(
          (states as Record<number, boolean | undefined>) || {},
          Array.isArray(sequence) ? sequence : []
        );
        setToggleStates(migrated.states);
        setCurrentSequence(migrated.sequence);
        setSelectedPlanId(findMostSimilarPlan(migrated.sequence));
        if (migrated.changed) {
          await updateButtonStatesAndSequence(migrated.states, migrated.sequence);
        }
      } catch (error) {
        console.error("Error loading button states and sequence:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void fetchButtonStates();
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
    const gameScoreTopic = getTopicHandler('/game_score', 'std_msgs/msg/Int32');
    
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

    if (gameScoreTopic) {
      // Predicted / game score: drives the same "Estimated Score" on the playmat
      gameScoreTopic.subscribe((message: any) => {
        const score = parseInt(message.data, 10);
        if (!isNaN(score)) setEstimatedScore(score);
      });
    }

    // Clean up subscriptions and timer
    return () => {
      try {
        if (scoreTopic) scoreTopic.unsubscribe();
        if (idealScoreTopic) idealScoreTopic.unsubscribe();
        if (gameScoreTopic) gameScoreTopic.unsubscribe();
        clearInterval(connectionTimer);
      } catch (e) {
        console.error("Error unsubscribing from score topics:", e);
      }
    };
  }, [connected, getTopicHandler]);

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

  // Top-align so the playmat and overlay are not pulled upward by vertical centering (avoids overlap with the floating tab bar; matches Robot Status flow)
  const containerClasses = isHalfScreen
    ? "relative flex items-center justify-center h-full w-full min-h-0 bg-[#0e0e0e] transform-gpu origin-center"
    : "relative flex w-full min-h-0 items-start justify-center bg-[#0e0e0e]";

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
    if (!file) return;
    if (file.size < 1 || file.size > 4 * 1024 * 1024) {
      console.warn("JSON plan file size not allowed");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".json")) {
      console.warn("Upload a .json file only");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const v = validateJsonMissionPlansJson(content);
      if (!v.ok) {
        console.warn("Invalid plans JSON:", v.reason);
        return;
      }
      try {
        savePlans(v.data as PlanSequence[]);
      } catch (error) {
        console.error("Error saving plans:", error);
      }
    };
    reader.readAsText(file);
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

  // mission index 0-17: server derives pantry/collection and stores in button.json
  const handleButtonClick = (missionId: number) => {
    setToggleStates((prevStates: Record<number, boolean>) => {
      const newStates = { ...prevStates };
      if (!currentSequence.includes(missionId)) {
        newStates[missionId] = !prevStates[missionId];
      }
      setCurrentSequence((prevSeq: number[]) => {
        const newSeq = [...prevSeq, missionId];
        setSelectedPlanId(findMostSimilarPlan(newSeq));
        void updateButtonStatesAndSequence(newStates, newSeq);
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
    const resetStates = defaultMissionButtonStates();
    setToggleStates(resetStates);
    void updateButtonStatesAndSequence(resetStates, []);
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
    <div className="box-border h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden bg-[#0e0e0e] px-3 pt-[var(--app-chrome-pad-top)] pb-[var(--app-chrome-pad-bottom)] [overflow-anchor:none] sm:px-5 lg:px-6">
      <div className={containerClasses}>
      {/* Image container */}
      <div className={isHalfScreen ? "relative transform-gpu scale-[0.92]" : "relative"}>
      <img
        src={playmatImage}
        alt="Eurobot 2026 Playmat"
        className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-lg"
      />

        {/* Mission point buttons: labels are mission index 0-17; corners 10/19 (old field) removed. */}
        <button
          className={getButtonClassName(6, `absolute top-[23.7%] right-[39.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(6)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>6</span>
        </button>

        <button
          className={getButtonClassName(15, `absolute top-[34%] right-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(15)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>15</span>
        </button>

        <button
          className={getButtonClassName(14, `absolute bottom-[15%] right-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(14)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>14</span>
        </button>

        <button
          className={getButtonClassName(7, `absolute bottom-[36.3%] right-[24.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(7)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>7</span>
        </button>

        <button
          className={getButtonClassName(17, `absolute bottom-[36.3%] right-[34.5%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(17)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>17</span>
        </button>

        <button
          className={getButtonClassName(12, `absolute bottom-[36.3%] left-[34.5%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(12)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>12</span>
        </button>

        <button
          className={getButtonClassName(2, `absolute bottom-[36.3%] left-[24.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(2)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>2</span>
        </button>

        <button
          className={getButtonClassName(10, `absolute bottom-[15%] left-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(10)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>10</span>
        </button>

        <button
          className={getButtonClassName(11, `absolute top-[34%] left-[4.5%] ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(11)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>11</span>
        </button>

        <button
          className={getButtonClassName(3, `absolute top-[23.7%] left-[39.2%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(3)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>3</span>
        </button>

        <button
          className={getButtonClassName(9, `absolute top-[56.3%] right-[0.9%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(9)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>9</span>
        </button>

        <button
          className={getButtonClassName(16, `absolute bottom-[6%] right-[33%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(16)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>16</span>
        </button>

        <button
          className={getButtonClassName(4, `absolute bottom-[1.5%] left-[47.6%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(4)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>4</span>
        </button>

        <button
          className={getButtonClassName(1, `absolute bottom-[1.3%] left-[21%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(1)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>1</span>
        </button>

        <button
          className={getButtonClassName(0, `absolute top-[56.3%] left-[0.9%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(0)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>0</span>
        </button>

        <button
          className={getButtonClassName(13, `absolute bottom-[6%] left-[33%] ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(13)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>13</span>
        </button>

        <button
          className={getButtonClassName(5, `absolute bottom-[36.3%] right-[47.5%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(5)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>5</span>
        </button>

        <button
          className={getButtonClassName(8, `absolute bottom-[1.3%] right-[21%] ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(8)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>8</span>
        </button>


        {/* Score display - Smoky dark glass effect */}
        <div className="absolute top-[43%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black bg-opacity-15 px-12 py-8 rounded-xl border-0 shadow-lg min-w-[400px] backdrop-blur-lg">
          <div className="text-3xl uppercase tracking-wider mb-5 text-center font-bold text-shadow-lg" style={{ color: "var(--theme-accent)" }}>Estimated Score</div>
          <div className="text-white text-9xl font-bold text-center tracking-wider text-shadow-lg drop-shadow-lg">{estimatedScore}</div>
        </div>

        {/* Integrated Control Panel */}
        <div
          className={`absolute left-1/2 z-50 w-[90%] max-w-[600px] -translate-x-1/2 transform rounded-2xl border border-[#333333] bg-black/80 p-6 shadow-2xl backdrop-blur-xl ${
            isHalfScreen ? "top-4" : "top-6 sm:top-8"
          }`}
        >
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
                  <Popover.Root open={planMenuOpen} onOpenChange={setPlanMenuOpen}>
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between bg-[#121212] text-white px-4 py-3 rounded-xl border border-[#333333] focus:outline-none focus:ring-2 text-lg text-left cursor-pointer hover:bg-[#1a1a1a] transition-colors"
                        style={{ outlineColor: "var(--theme-accent)" }}
                        aria-haspopup="listbox"
                        aria-expanded={planMenuOpen}
                      >
                        <span>
                          {selectedPlanId
                            ? (() => {
                                const p = plans.find((pl) => pl.id === selectedPlanId);
                                return p
                                  ? `Plan ${p.id} — ${p.description}`
                                  : "Select a plan";
                              })()
                            : "Select a plan"}
                        </span>
                        <svg
                          className="w-5 h-5 shrink-0 text-white/80"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </Popover.Trigger>
                    <Popover.Portal>
                      <Popover.Content
                        className="z-[200] w-[var(--radix-popover-trigger-width)] max-h-72 overflow-y-auto rounded-xl border border-[#333] bg-[#0a0a0a] p-1 shadow-2xl"
                        sideOffset={4}
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        {plans.map((plan: PlanSequence) => (
                          <button
                            key={plan.id}
                            type="button"
                            onClick={() => {
                              setSelectedPlanId(plan.id);
                              setPlanMenuOpen(false);
                            }}
                            className={clsx(
                              "w-full text-left px-3 py-3 text-lg rounded-lg transition-colors",
                              selectedPlanId === plan.id
                                ? "text-white"
                                : "text-[#ccc] hover:bg-[#1a1a1a] hover:text-white"
                            )}
                            style={
                              selectedPlanId === plan.id
                                ? { backgroundColor: "color-mix(in srgb, var(--theme-accent) 35%, #000)" }
                                : undefined
                            }
                          >
                            Plan {plan.id} — {plan.description}
                          </button>
                        ))}
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover.Root>
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
    </div>
  );
}

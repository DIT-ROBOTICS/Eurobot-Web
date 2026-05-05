import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { PLAYMAT_BACKGROUNDS, DEFAULT_PLAYMAT_BG_ID } from '../assets/playmatBackgrounds';
import { PLAYMAT_BG_ID_KEY } from '../utils/storageKeys';
import { useRosConnection } from "../utils/useRosConnection";
import { getButtonStatesAndSequence, updateButtonStatesAndSequence } from "../api/fileOperations";
import { clsx } from "clsx";
import { validateJsonMissionPlansJson } from "../utils/uploadValidation";
import { useIsHalfScreen } from "../hooks/useIsHalfScreen";

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
  const hasLegacySlots = keys.some((n) => n >= MISSION_INDEX_COUNT) || keys.length > MISSION_INDEX_COUNT;
  const hasLegacyInSeq = sequence.some((n) => n >= MISSION_INDEX_COUNT);
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
function calculateSimilarity(seq1: number[], seq2: number[]): number {
  let matches = 0;
  const minLength = Math.min(seq1.length, seq2.length);
  for (let i = 0; i < minLength; i++) {
    if (seq1[i] === seq2[i]) matches++;
  }
  return matches / Math.max(seq1.length, seq2.length);
}

interface PlanSequence {
  id: number;
  sequence: number[];
  description: string;
}

// Default plan sequences (mission indices 0-17; remove corner slots 10/19)
const DEFAULT_PLANS: PlanSequence[] = [
  { id: 1, sequence: [0, 1, 2, 3, 4], description: "Default" },
  { id: 2, sequence: [...Array(18).keys()], description: "All" },
];

/**
 * Full screen vs half screen: edit `full` and `half` separately.
 * Button entries are position-only; sizes come from PLAYMAT_BUTTON_SIZES.
 */
const PLAYMAT_IMAGE_WRAP = {
  full: "relative",
  // Half: no flex-1 (see PLAYMAT_OUTER.half) so the playmat is only as tall as the art; score margin then reads.
  half: "relative w-full min-h-0 shrink-0 transform-gpu scale-[0.92]",
} as const;

const PLAYMAT_OUTER = {
  full: "relative flex w-full min-h-0 items-start justify-center bg-[#0e0e0e]",
  // Column: plan, playmat (content-sized), then score. Do not use h-full+flex-1 on the playmat: that stretches the
  // playmat row to the viewport, so the map sits at the top of a huge box and small mt-4 on the score is invisible
  // “gap” in the already-empty area — margin tweaks have no feel.
  half: "relative flex w-full min-h-0 flex-col items-stretch justify-start gap-4 bg-[#0e0e0e] transform-gpu origin-center",
} as const;

// Card chrome shared by full and half; full centers on the field, half is the same card placed in flow below the playmat.
const PLAYMAT_SCORE_OUTER_CHROME =
  "bg-black bg-opacity-15 px-12 py-8 rounded-xl border-0 shadow-lg min-w-[400px] max-w-full backdrop-blur-lg box-border";

const PLAYMAT_SCORE_OUTER = {
  full: `absolute top-[43%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 ${PLAYMAT_SCORE_OUTER_CHROME}`,
  // Half: same card as full; w-fit + self-center (w-full was stretching the bar to full row width). Max width aligned with plan strip.
  // Extra top margin in addition to column gap (meant to read once flex-1 / h-full playmat is removed on half).
  half: `relative z-10 mt-3 w-fit max-w-[min(100%,40rem)] shrink-0 self-center sm:mt-4 ${PLAYMAT_SCORE_OUTER_CHROME}`,
} as const;

const PLAYMAT_SCORE_TITLE_CLASS =
  "text-3xl uppercase tracking-wider mb-5 text-center font-bold text-shadow-lg";

const PLAYMAT_SCORE_VALUE_CLASS =
  "text-white text-9xl font-bold text-center tracking-wider text-shadow-lg drop-shadow-lg";

const PLAYMAT_CONTROL_OUTER = {
  full: "absolute left-1/2 z-50 w-[90%] max-w-[600px] -translate-x-1/2 transform rounded-2xl border border-[#333333] bg-black/80 p-6 shadow-2xl backdrop-blur-xl top-6 sm:top-8",
} as const;

/** Half: sits above the playmat in normal flow (not over the field image). */
const PLAYMAT_CONTROL_FLOW_HALF =
  "relative z-20 w-full max-w-[min(100%,40rem)] shrink-0 self-center rounded-2xl border border-[#333333] bg-black/80 p-4 shadow-2xl backdrop-blur-xl sm:p-5" as const;

// TO-DO: tune these sizes to fit playmat of each year.
const PLAYMAT_BUTTON_SIZES = {
  full: {
    largeSquare: "w-[250px] h-[250px]",
    wideRect: "w-[220px] h-[130px]",
    tallRect: "w-[130px] h-[220px]",
    smallSquare: "w-[130px] h-[130px]",
  },
  half: {
    largeSquare: "w-[170px] h-[170px]",
    wideRect: "w-[120px] h-[80px]",
    tallRect: "w-[80px] h-[120px]",
    smallSquare: "w-[85px] h-[85px]",
  },
} as const;

const PLAYMAT_BUTTON_FONT = {
  full: { large: "text-4xl", medium: "text-3xl" },
  half: { large: "text-3xl", medium: "text-2xl" },
} as const;

// TO-DO: tune these positions for dual-monitor layout.
/** `absolute` position classes per mission index; tune `half` for dual-monitor layout. */
const MISSION_BTN_POS: Record<number, { full: string; half: string }> = {
  0: { full: "absolute top-[55.2%] left-[0.1%]", half: "absolute top-[54.8%] left-[0%]" },
  1: { full: "absolute bottom-[0.1%] left-[20.1%]", half: "absolute bottom-[0%] left-[20%]" },
  2: { full: "absolute top-[55.2%] left-[23.5%]", half: "absolute top-[54.8%] left-[23.3%]" },
  3: { full: "absolute top-[22.7%] left-[38.5%]", half: "absolute top-[22%] left-[38%]" },
  4: { full: "absolute bottom-[0.1%] right-[46.8%]", half: "absolute bottom-[0%] right-[46.4%]" },
  5: { full: "absolute top-[55.2%] right-[46.8%]", half: "absolute top-[54.8%] right-[46.4%]" },
  6: { full: "absolute top-[22.7%] right-[38.5%]", half: "absolute top-[22%] right-[38%]" },
  7: { full: "absolute top-[55.2%] right-[23.5%]", half: "absolute top-[54.8%] right-[23.3%]" },
  8: { full: "absolute bottom-[0.1%] right-[20.1%]", half: "absolute bottom-[0%] right-[20%]" },
  9: { full: "absolute top-[55.2%] right-[0.1%]", half: "absolute top-[54.8%] right-[0%]" },
  10: { full: "absolute bottom-[15%] left-[4.5%]", half: "absolute bottom-[15%] left-[4.5%]" },
  11: { full: "absolute top-[34%] left-[4.5%]", half: "absolute top-[34%] left-[4.5%]" },
  12: { full: "absolute bottom-[6%] left-[33%]", half: "absolute bottom-[6%] left-[33%]" },
  13: { full: "absolute top-[55.2%] left-[33%]", half: "absolute top-[54.8%] left-[33%]" },
  14: { full: "absolute bottom-[15%] right-[4.5%]", half: "absolute bottom-[15%] right-[4.5%]" },
  15: { full: "absolute top-[34%] right-[4.5%]", half: "absolute top-[34%] right-[4.5%]" },
  16: { full: "absolute bottom-[6%] right-[33%]", half: "absolute bottom-[6%] right-[33%]" },
  17: { full: "absolute top-[55.2%] right-[33%]", half: "absolute top-[54.8%] right-[33%]" },
};

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
  const isHalfScreen = useIsHalfScreen();
  const { connected, getTopicHandler, getServiceServer } = useRosConnection();
  const [, setToggleStates] = useState<Record<number, boolean>>(() => defaultMissionButtonStates());
  const [isLoading, setIsLoading] = useState(true);
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [pressProgress, setPressProgress] = useState(0);
  // Brief visual flash after a successful reset
  const [resetFlash, setResetFlash] = useState(false);
  
  // Plan management states
  const [currentSequence, setCurrentSequence] = useState<number[]>([]);
  const [plans, setPlans] = useState<PlanSequence[]>(DEFAULT_PLANS);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  // The plan ID that has been explicitly confirmed by the user. Only this value
  // is exposed over the ROS service — selecting/auto-detecting must NOT change it.
  const [confirmedPlanId, setConfirmedPlanId] = useState<number | null>(null);

  const isConfirmed = selectedPlanId !== null && selectedPlanId === confirmedPlanId;

  // Service server states managed via refs

  // Ref so the service callback always reads the latest confirmed value without
  // re-advertising the service on every state change.
  const confirmedPlanIdRef = useRef<number | null>(null);

  const rosConnectionRef = useRef<ROSLIB.Ros | null>(null);
  const serviceServerRef = useRef<ROSLIB.Service | null>(null);

  useEffect(() => {
    confirmedPlanIdRef.current = confirmedPlanId;
  }, [confirmedPlanId]);

  const findMostSimilarPlan = useCallback((sequence: number[]): number | null => {
    if (sequence.length === 0) return null;

    let maxSimilarity = 0;
    let mostSimilarPlanId: number | null = null;

    plans.forEach((p: PlanSequence) => {
      const similarity = calculateSimilarity(sequence, p.sequence);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarPlanId = p.id;
      }
    });

    return mostSimilarPlanId;
  }, [plans]);

  // Sync playmat background changes from Control Panel / backup restore.
  useEffect(() => {
    const onPlaymat = () => {
      try {
        setPlaymatBgId(localStorage.getItem(PLAYMAT_BG_ID_KEY) || DEFAULT_PLAYMAT_BG_ID);
      } catch {}
    };
    window.addEventListener('eurobot-playmat-bg', onPlaymat);
    return () => {
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
  }, [findMostSimilarPlan]);

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
      scoreTopic.subscribe((message: ROSLIBMessage) => {
        const score = parseInt(String(message.data));
        if (!isNaN(score)) {
          scoreReceived = true;
          lastScoreTime = Date.now();
          setEstimatedScore(score);
        }
      });
    }

    if (idealScoreTopic) {
      // Subscribe to the fallback score topic
      idealScoreTopic.subscribe((message: ROSLIBMessage) => {
        const score = parseInt(String(message.data));
        if (!isNaN(score) && !scoreReceived) {
          setEstimatedScore(score);
        }
      });
    }

    if (gameScoreTopic) {
      // Predicted / game score: drives the same "Estimated Score" on the playmat
      gameScoreTopic.subscribe((message: ROSLIBMessage) => {
        const score = parseInt(String(message.data), 10);
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

  const buttonSizes = isHalfScreen ? PLAYMAT_BUTTON_SIZES.half : PLAYMAT_BUTTON_SIZES.full;
  const fontSize = isHalfScreen ? PLAYMAT_BUTTON_FONT.half : PLAYMAT_BUTTON_FONT.full;
  const containerClasses = isHalfScreen ? PLAYMAT_OUTER.half : PLAYMAT_OUTER.full;
  const missionPos = (id: number) => (isHalfScreen ? MISSION_BTN_POS[id].half : MISSION_BTN_POS[id].full);

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

  // mission index 0-17: server derives pantry/collection and stores in button.json
  const handleButtonClick = (missionId: number) => {
    setToggleStates((prevStates: Record<number, boolean>) => {
      const newStates = { ...prevStates };
      if (!currentSequence.includes(missionId)) {
        newStates[missionId] = !prevStates[missionId];
      }
      setCurrentSequence((prevSeq: number[]) => {
        const newSeq = [...prevSeq, missionId];
        // Don't auto-reassign selectedPlanId here: clicking mission buttons must
        // not flip the Confirm state. Auto-detection is only for initial load.
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
      return;
    }

    // Clean up existing service server if ROS connection changed
    if (serviceServerRef.current) {
      try {
        serviceServerRef.current.unadvertise();
      } catch (e) {
        console.error('Error cleaning up existing service server:', e);
      }
    }

    try {
      // Setup the service server

      // Handle service requests
      server.advertise((_request: ROSLIBServiceRequestData, response: ROSLIBServiceResponse) => {
        // Only expose the confirmed plan. If the user hasn't confirmed (or has
        // reset), return 0 so downstream knows no plan is locked in yet.
        const planId = confirmedPlanIdRef.current ?? 0;
        response.success = true;
        response.message = planId.toString();
        return true;
      });

      // Store references
      serviceServerRef.current = server;
      rosConnectionRef.current = server.ros;

    } catch (error) {
      console.error('Error creating service server:', error);
    }

    return () => {
      // Cleanup on unmount only
      if (serviceServerRef.current) {
        try {
          serviceServerRef.current.unadvertise();
          serviceServerRef.current = null;
          rosConnectionRef.current = null;
        } catch (e) {
          console.error('Error stopping service server during unmount:', e);
        }
      }
    };
  }, [connected, getServiceServer]);

  // Handle confirm button
  const handleConfirm = () => {
    if (selectedPlanId) {
      setConfirmedPlanId(selectedPlanId);
    }
  };

  // Handle reset button
  const handleReset = () => {
    setCurrentSequence([]);
    setSelectedPlanId(null);
    setConfirmedPlanId(null);
    const resetStates = defaultMissionButtonStates();
    setToggleStates(resetStates);
    void updateButtonStatesAndSequence(resetStates, []);
    setResetFlash(true);
    setTimeout(() => setResetFlash(false), 600);
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

  const renderScoreBlock = (outerClassName: string) => (
    <div className={outerClassName}>
      <div className={PLAYMAT_SCORE_TITLE_CLASS} style={{ color: "var(--theme-accent)" }}>
        Estimated Score
      </div>
      <div className={PLAYMAT_SCORE_VALUE_CLASS}>{estimatedScore}</div>
    </div>
  );

  const renderSequencePlanPanel = () => (
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
                        className="z-[200] w-[36rem] max-w-[calc(100vw-2rem)] max-h-[min(34rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain rounded-2xl border border-[#333] bg-[#0a0a0a] p-2 shadow-2xl"
                        sideOffset={9}
                        align="start"
                        collisionPadding={16}
                        avoidCollisions
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
                              "w-full text-left px-5 py-[1.375rem] min-h-[5rem] text-[1.625rem] rounded-xl transition-colors select-none touch-manipulation",
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
                            Plan {plan.id} - {plan.description}
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
                className="flex-1 relative group hold-press select-none touch-manipulation"
                onContextMenu={(e) => e.preventDefault()}
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
                <div
                  className={clsx(
                    "relative flex items-center justify-center gap-3 px-6 py-3 rounded-xl border transition-all cursor-pointer overflow-hidden",
                    resetFlash
                      ? "bg-green-600 border-green-600"
                      : "bg-[#121212] border-white hover:bg-white/5"
                  )}
                >
                  <div className="relative">
                    <div className="w-4 h-4 rounded-full bg-white"></div>
                    <div className="absolute inset-0 w-4 h-4 rounded-full bg-white animate-ping opacity-75"></div>
                  </div>
                  <span className="text-white font-medium">
                    {resetFlash ? "Reset Done" : "Hold to Reset"}
                  </span>
                  {pressProgress > 0 && (
                    <div className="pointer-events-none absolute bottom-0 left-0 h-1 bg-white transition-all" style={{ width: `${pressProgress}%` }}></div>
                  )}
                </div>
              </div>

              {/* Confirm Button */}
              <button
                onClick={handleConfirm}
                disabled={!selectedPlanId || isConfirmed}
                className={`flex-1 px-6 py-3 rounded-xl font-medium transition-all ${
                  !selectedPlanId
                    ? 'bg-[#121212] text-[#666666] cursor-not-allowed border border-[#333333]'
                    : isConfirmed
                    ? 'bg-green-600 text-white border border-green-600'
                    : 'bg-white text-black hover:bg-[#f0f0f0] shadow-lg shadow-white/20'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  {isConfirmed ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Plan {confirmedPlanId} Confirmed</span>
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
  );

  return (
    <div className="box-border h-full min-h-0 w-full min-w-0 overflow-y-auto overflow-x-hidden bg-[#0e0e0e] px-3 pt-[var(--app-chrome-pad-top)] pb-[var(--app-chrome-pad-bottom)] [overflow-anchor:none] sm:px-5 lg:px-6">
      <div className={containerClasses}>
        {isHalfScreen && (
          <div className={PLAYMAT_CONTROL_FLOW_HALF}>
            {renderSequencePlanPanel()}
          </div>
        )}
        {/* Image container: mission controls + (full) floating plan panel */}
        <div className={isHalfScreen ? PLAYMAT_IMAGE_WRAP.half : PLAYMAT_IMAGE_WRAP.full}>
      <img
        src={playmatImage}
        alt="Eurobot 2026 Playmat"
        className="max-h-[85vh] max-w-full object-contain rounded-xl shadow-lg"
      />

        {/* Mission point buttons: labels are mission index 0-17; corners 10/19 (old field) removed. */}
        <button
          className={getButtonClassName(6, `${missionPos(6)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(6)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>6</span>
        </button>

        <button
          className={getButtonClassName(15, `${missionPos(15)} ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(15)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>15</span>
        </button>

        <button
          className={getButtonClassName(14, `${missionPos(14)} ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(14)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>14</span>
        </button>

        <button
          className={getButtonClassName(7, `${missionPos(7)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(7)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>7</span>
        </button>

        <button
          className={getButtonClassName(17, `${missionPos(17)} ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(17)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>17</span>
        </button>

        <button
          className={getButtonClassName(12, `${missionPos(12)} ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(12)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>12</span>
        </button>

        <button
          className={getButtonClassName(2, `${missionPos(2)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(2)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>2</span>
        </button>

        <button
          className={getButtonClassName(10, `${missionPos(10)} ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(10)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>10</span>
        </button>

        <button
          className={getButtonClassName(11, `${missionPos(11)} ${buttonSizes.tallRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(11)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>11</span>
        </button>

        <button
          className={getButtonClassName(3, `${missionPos(3)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(3)}
          disabled={isLoading}
        >
          <span className={`${fontSize.large} font-bold`}>3</span>
        </button>

        <button
          className={getButtonClassName(9, `${missionPos(9)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(9)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>9</span>
        </button>

        <button
          className={getButtonClassName(16, `${missionPos(16)} ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(16)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>16</span>
        </button>

        <button
          className={getButtonClassName(4, `${missionPos(4)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(4)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>4</span>
        </button>

        <button
          className={getButtonClassName(1, `${missionPos(1)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(1)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>1</span>
        </button>

        <button
          className={getButtonClassName(0, `${missionPos(0)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(0)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>0</span>
        </button>

        <button
          className={getButtonClassName(13, `${missionPos(13)} ${buttonSizes.wideRect} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(13)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>13</span>
        </button>

        <button
          className={getButtonClassName(5, `${missionPos(5)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(5)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>5</span>
        </button>

        <button
          className={getButtonClassName(8, `${missionPos(8)} ${buttonSizes.smallSquare} rounded-xl flex items-center justify-center`)}
          onClick={() => handleButtonClick(8)}
          disabled={isLoading}
        >
          <span className={`${fontSize.medium} font-bold`}>8</span>
        </button>


        {/* Score: full = centered on playmat; half = same card, below the image in column flow (no overlay, same typography) */}
        {!isHalfScreen && renderScoreBlock(PLAYMAT_SCORE_OUTER.full)}

        {!isHalfScreen && (
          <div className={PLAYMAT_CONTROL_OUTER.full}>
            {renderSequencePlanPanel()}
          </div>
        )}
      </div>

        {isHalfScreen && renderScoreBlock(PLAYMAT_SCORE_OUTER.half)}
      </div>
    </div>
  );
}

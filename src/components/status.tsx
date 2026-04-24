import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { SponsorFullscreenOverlay } from "./SponsorFullscreenOverlay";
import Status3DModel from "./Status3DModel";
import { useRosConnection } from "../utils/useRosConnection";
import { parseSimaNamesFromStorage } from "../utils/simaNames";
import {
  listSponsors,
  recordToObjectUrl,
  type SponsorRecord,
} from "../utils/sponsorIdb";
import { StatusPanel } from "./StatusPanel";
import { MANUAL_CTRL_ACCENT, MANUAL_CTRL_NEUTRAL } from "../utils/manualButtonClasses";
import {
  type RobotConfigFields,
  DEFAULT_ROBOT_CONFIG,
  RC_FIELD_GROUPS,
} from "../utils/robotConfigFields";

interface UpdateStatus {
  message: string;
  isError: boolean;
  visible: boolean;
}

// System Status: driven only by /robot/startup/groups_state (order matches group indices 0–3)
// Ready button: /robot/startup/ready_signal as btcpp StartUpSrv, one call per group 1–4 (state=1)
const systemGroupOrder = ["MAIN", "VISION", "NAVIGATION", "LOCALIZATION"] as const;

interface SystemGroupStatusState {
  MAIN: number | null;
  VISION: number | null;
  NAVIGATION: number | null;
  LOCALIZATION: number | null;
}

const STARTUP_SRV_TYPE = "btcpp_ros2_interfaces/srv/StartUpSrv";

const SIMA_STALE_MS = 1300;
const BATTERY_STALE_MS = 8000;

export default function RobotDashboard() {
  const [batteryVoltage, setBatteryVoltage] = useState(20.25);
  const [displayVoltage, setDisplayVoltage] = useState(20.25);
  const lastBatteryMsgAtRef = useRef(0);
  const hasReceivedBatteryRef = useRef(false);
  const [plugConnected, setPlugConnected] = useState(false); // Ready signal over plug interface
  const [lastPlugTrueTime, setLastPlugTrueTime] = useState(0); // Time when the last true plug signal was received
  const [isHalfScreen, setIsHalfScreen] = useState(false); // New state for half-screen mode
  const [simaNames, setSimaNames] = useState<string[]>(() => parseSimaNamesFromStorage());
  const [simaOnline, setSimaOnline] = useState<Record<string, { ok: boolean; t: number }>>({});
  const [simaRenderTick, setSimaRenderTick] = useState(0);
  const [gameTimeVal, setGameTimeVal] = useState(0);
  const [gameScore, setGameScore] = useState<number | null>(null);
  const [sponsorRecords, setSponsorRecords] = useState<SponsorRecord[]>([]);
  const [sponsorIndex, setSponsorIndex] = useState(0);
  const [sponsorOverlayOpen, setSponsorOverlayOpen] = useState(false);
  const [sponsorOpenOrigin, setSponsorOpenOrigin] = useState({ x: 0, y: 0 });
  const [sponsorCloseExit, setSponsorCloseExit] = useState(false);
  const sponsorPreviewRef = useRef<HTMLDivElement>(null);
  const [hostname, setHostname] = useState(() => {
    const saved = localStorage.getItem("bms-hostname");
    return saved || "DIT-2026-10";
  });
  const { connected: rosConnected, getTopicHandler, getServiceHandler, createPublisher } = useRosConnection();
  const plugPubRef = useRef<ReturnType<NonNullable<typeof createPublisher>> | null>(null);
  const onTakePubRef = useRef<ReturnType<NonNullable<typeof createPublisher>> | null>(null);

  const [robotConfig, setRobotConfig] = useState<RobotConfigFields>(DEFAULT_ROBOT_CONFIG);
  const [isVoltageAvailable, setIsVoltageAvailable] = useState(true);
  // Long press reload state
  const [pressTimer, setPressTimer] = useState<any>(null);
  const [pressProgress, setPressProgress] = useState(0);
  // Device status (from ROS2 topics)
  const [deviceStatus, setDeviceStatus] = useState({
    chassis: false,
    mission: false,
    lidar: false,
    esp32: false,
    imu: false
  });
  const [rivalRadius, setRivalRadius] = useState(22); // Default rival radius in cm
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ message: '', isError: false, visible: false });
  /** Shown only under Robot config long-press buttons (not the Robot Parameters block) */
  const [robotConfigStatus, setRobotConfigStatus] = useState<UpdateStatus>({
    message: "",
    isError: false,
    visible: false,
  });
  const [dockRivalRadius, setDockRivalRadius] = useState(46); // Default dock rival radius in cm
  const [dockRivalDegree, setDockRivalDegree] = useState(120); // Default dock rival degree
  const [navLinearVelocity, setNavLinearVelocity] = useState(1.1); // Default linear velocity
  const [navAngularVelocity, setNavAngularVelocity] = useState(2.0); // Default angular velocity
  const [navProfile, setNavProfile] = useState("slow"); // Default navigation profile
  const [simaStartTime, setSimaStartTime] = useState(85); // Default SIMA start time
  const [planCode, setPlanCode] = useState(1); // Add new state for SIMA plan code
  const [showConfirmDialog, setShowConfirmDialog] = useState(false); // For confirmation dialog
  const [paramsToUpdate, setParamsToUpdate] = useState<string | null>(null); // Which parameters to update
  const [buttonPressTimer, setButtonPressTimer] = useState<any>(null);
  const [buttonPressProgress, setButtonPressProgress] = useState(0);
  const [activeButton, setActiveButton] = useState<string | null>(null);

  // State for system group status
  const [systemGroupStatus, setSystemGroupStatus] = useState<SystemGroupStatusState>({
    MAIN: null,
    VISION: null,
    NAVIGATION: null,
    LOCALIZATION: null,
  });
  const [lastGroupsStateUpdateTime, setLastGroupsStateUpdateTime] = useState(0);

  // Define the type for device status
  type DeviceStatusType = typeof deviceStatus;

  // Extract host number from hostname for connection URLs (set from Control Panel)
  const hostNumber = hostname.split("-")[2] || "";
  const bmsUrl = `http://dit-2026-${hostNumber}-esp.local/`;

  const refreshSponsors = useCallback(async () => {
    const list = await listSponsors();
    setSponsorRecords(list);
  }, []);

  useEffect(() => {
    void refreshSponsors();
    const onS = () => {
      void refreshSponsors();
    };
    window.addEventListener("eurobot-sponsor-updated", onS);
    return () => {
      window.removeEventListener("eurobot-sponsor-updated", onS);
    };
  }, [refreshSponsors]);

  useEffect(() => {
    if (sponsorRecords.length === 0) return;
    const t = setInterval(
      () => setSponsorIndex((i) => (i + 1) % sponsorRecords.length),
      4000
    );
    return () => clearInterval(t);
  }, [sponsorRecords.length]);

  const sponsorPreviewRec =
    sponsorRecords.length > 0
      ? sponsorRecords[sponsorIndex % sponsorRecords.length]
      : undefined;
  const sponsorPreviewSrc = useMemo(() => {
    if (!sponsorPreviewRec) return "";
    return recordToObjectUrl(sponsorPreviewRec);
  }, [sponsorIndex, sponsorPreviewRec]);

  useEffect(() => {
    return () => {
      if (sponsorPreviewSrc?.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(sponsorPreviewSrc);
        } catch {
          /* */
        }
      }
    };
  }, [sponsorPreviewSrc]);

  useEffect(() => {
    fetch("/api/robot-config")
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && d?.params) {
          setRobotConfig((prev: RobotConfigFields) => ({ ...prev, ...d.params }));
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!rosConnected) {
      if (plugPubRef.current) {
        try {
          plugPubRef.current.unadvertise?.();
        } catch {
          /* */
        }
        plugPubRef.current = null;
      }
      if (onTakePubRef.current) {
        try {
          onTakePubRef.current.unadvertise?.();
        } catch {
          /* */
        }
        onTakePubRef.current = null;
      }
      return;
    }
    const p = createPublisher("/robot/startup/plug", "std_msgs/msg/Bool");
    plugPubRef.current = p;
    const t = createPublisher("/robot/on_take", "std_msgs/msg/Int16");
    onTakePubRef.current = t;
    return () => {
      if (p)
        try {
          p.unadvertise?.();
        } catch {
          /* */
        }
      if (t)
        try {
          t.unadvertise?.();
        } catch {
          /* */
        }
    };
  }, [rosConnected, createPublisher]);

  useEffect(() => {
    const onBms = () => {
      setHostname(localStorage.getItem("bms-hostname") || "DIT-2026-10");
    };
    window.addEventListener("eurobot-bms-hostname", onBms);
    window.addEventListener("storage", onBms);
    return () => {
      window.removeEventListener("eurobot-bms-hostname", onBms);
      window.removeEventListener("storage", onBms);
    };
  }, []);

  useEffect(() => {
    const f = () => setSimaNames(parseSimaNamesFromStorage());
    window.addEventListener("eurobot-sima-names-updated", f);
    return () => window.removeEventListener("eurobot-sima-names-updated", f);
  }, []);

  useEffect(() => {
    const i = setInterval(() => setSimaRenderTick((n) => n + 1), 400);
    return () => clearInterval(i);
  }, []);

  // Detect half-screen mode
  useEffect(() => {
    try {
      const savedValue = localStorage.getItem('isHalfScreen');
      setIsHalfScreen(savedValue === 'true');
      
      // Listen for changes to half-screen mode from other components
      const checkHalfScreen = () => {
        try {
          const savedValue = localStorage.getItem('isHalfScreen');
          setIsHalfScreen(savedValue === 'true');
        } catch (error) {
          console.warn('Could not detect half screen mode:', error);
        }
      };

      // Add event listener for storage events
      window.addEventListener('storage', checkHalfScreen);
      document.addEventListener('visibilitychange', checkHalfScreen);
      
      // Also set up a polling mechanism to check periodically
      const interval = setInterval(checkHalfScreen, 1000);
      
      return () => {
        window.removeEventListener('storage', checkHalfScreen);
        document.removeEventListener('visibilitychange', checkHalfScreen);
        clearInterval(interval);
      };
    } catch (error) {
      console.warn('Could not detect half screen mode:', error);
    }
  }, []);

  // Subscribe to ROS topics using our shared connection
  useEffect(() => {
    if (!rosConnected || typeof window === 'undefined' || !window.ROSLIB) {
      return;
    }

    const batteryTopic = getTopicHandler("/robot_status/battery_voltage", "std_msgs/msg/Float32");
    if (batteryTopic) {
      batteryTopic.subscribe((message: any) => {
        const voltage = parseFloat(message.data);
        if (isNaN(voltage)) return;
        lastBatteryMsgAtRef.current = Date.now();
        hasReceivedBatteryRef.current = true;
        setBatteryVoltage(parseFloat(voltage.toFixed(1)));
        setIsVoltageAvailable(true);
      });
    }

      // Subscribe to device status topics
      const deviceTopicNames = {
        chassis: '/robot_status/usb/chassis',
        mission: '/robot_status/usb/mission',
        lidar: '/robot_status/usb/lidar',
        esp32: '/robot_status/usb/esp',
        imu: '/robot_status/usb/imu'
      };

      // Create topics and subscribe
    const deviceTopics: Record<string, any> = {};
      Object.entries(deviceTopicNames).forEach(([device, topicName]) => {
      const topic = getTopicHandler(topicName, 'std_msgs/msg/Bool');
      if (topic) {
        topic.subscribe((message: any) => {
          setDeviceStatus((prev: DeviceStatusType) => ({
            ...prev,
            [device]: message.data
          }));
        });
        deviceTopics[device] = topic;
      }
    });

    // Subscribe to robot ready signal (over plug interface)
    const plugTopic = getTopicHandler('/robot/startup/plug', 'std_msgs/msg/Bool');
    if (plugTopic) {
      plugTopic.subscribe((message: any) => {
        if (message.data) {
          // If we receive a true signal, update the connected status and record the timestamp
          setPlugConnected(true);
          setLastPlugTrueTime(Date.now());
        } else {
          // If we receive false, immediately set to false
          setPlugConnected(false);
        }
      });
      }

    const groupsStateTopic = getTopicHandler("/robot/startup/groups_state", "std_msgs/msg/Int32MultiArray");
    if (groupsStateTopic) {
      groupsStateTopic.subscribe((message: any) => {
        if (message.data && Array.isArray(message.data)) {
          const newStatusUpdate: Partial<SystemGroupStatusState> = {};
          systemGroupOrder.forEach((name, index) => {
            if (message.data.length > index) {
              newStatusUpdate[name] = message.data[index];
            } else {
              newStatusUpdate[name] = null;
            }
          });
          setSystemGroupStatus((prevStatus: SystemGroupStatusState) => ({ ...prevStatus, ...newStatusUpdate }));
          setLastGroupsStateUpdateTime(Date.now());
        }
      });
    }

    const gameTimeTopic = getTopicHandler("/robot/startup/game_time", "std_msgs/msg/Float32");
    if (gameTimeTopic) {
      gameTimeTopic.subscribe((message: any) => {
        const v = parseFloat(message.data);
        if (!isNaN(v)) setGameTimeVal(v);
      });
    }

    const gameScoreTopic = getTopicHandler("/game_score", "std_msgs/msg/Int32");
    if (gameScoreTopic) {
      gameScoreTopic.subscribe((message: any) => {
        const s = parseInt(message.data, 10);
        if (!isNaN(s)) setGameScore(s);
      });
    }

    // Cleanup function
    return () => {
      if (batteryTopic) {
        try {
          batteryTopic.unsubscribe();
        } catch (e) {
          console.error("Error unsubscribing from battery topic:", e);
        }
      }
      
      // Unsubscribe from all device topics
      Object.values(deviceTopics).forEach((topic: any) => {
        if (topic) {
          try {
            topic.unsubscribe();
          } catch (e) {
            console.error("Error unsubscribing from topic:", e);
          }
        }
      });
      
      // Unsubscribe from plug topic
      if (plugTopic) {
        try {
          plugTopic.unsubscribe();
        } catch (e) {
          console.error("Error unsubscribing from plug topic:", e);
        }
      }

      // Unsubscribe from groups state topic
      if (groupsStateTopic) {
        try {
          groupsStateTopic.unsubscribe();
        } catch (e) {
          console.error("Error unsubscribing from groups state topic:", e);
        }
      }
      if (gameTimeTopic) {
        try {
          gameTimeTopic.unsubscribe();
        } catch (e) {
          console.error("Error unsubscribing from game_time topic:", e);
        }
      }
      if (gameScoreTopic) {
        try {
          gameScoreTopic.unsubscribe();
        } catch (e) {
          console.error("Error unsubscribing from game_score topic:", e);
        }
      }
    };
  }, [rosConnected, getTopicHandler]);

  useEffect(() => {
    if (!rosConnected || typeof window === "undefined" || !window.ROSLIB) {
      setSimaOnline({});
      return;
    }
    const parts: { name: string; t: { unsubscribe: () => void } }[] = [];
    simaNames.forEach((name) => {
      const t = getTopicHandler(`/${name}/status`, "std_msgs/msg/Bool");
      if (t) {
        t.subscribe((m: { data: boolean }) => {
          setSimaOnline((o) => ({ ...o, [name]: { ok: m.data === true, t: Date.now() } }));
        });
        parts.push({ name, t });
      }
    });
    return () => {
      parts.forEach(({ t }) => {
        try {
          t.unsubscribe();
        } catch {
          /* */
        }
      });
    };
  }, [rosConnected, getTopicHandler, simaNames.join("|")]);

  // Add a timeout effect to reset plugConnected to false if no true signal received for 5 seconds
  useEffect(() => {
    // Skip if not currently connected
    if (!plugConnected) return;

    // Set up interval to check for timeout
    const intervalId = setInterval(() => {
      const now = Date.now();
      const timeSinceLastTrue = now - lastPlugTrueTime;
      
      // If it's been more than 5 seconds since the last true signal, set to false
      if (timeSinceLastTrue > 5000) {
        setPlugConnected(false);
      }
    }, 1000); // Check every second
    
    // Clean up interval on unmount or when plugConnected changes
    return () => clearInterval(intervalId);
  }, [plugConnected, lastPlugTrueTime]);

  useEffect(() => {
    if (rosConnected) {
      return;
    }
    setIsVoltageAvailable(false);
    hasReceivedBatteryRef.current = false;
    setBatteryVoltage(0);
    setDisplayVoltage(0);
  }, [rosConnected]);

  useEffect(() => {
    if (!isVoltageAvailable || !hasReceivedBatteryRef.current) return;
    const alpha = 0.42;
    setDisplayVoltage((prev) => parseFloat((prev * (1 - alpha) + batteryVoltage * alpha).toFixed(2)));
  }, [batteryVoltage, isVoltageAvailable]);

  useEffect(() => {
    if (!rosConnected) return;
    const id = setInterval(() => {
      if (!hasReceivedBatteryRef.current) return;
      if (Date.now() - lastBatteryMsgAtRef.current > BATTERY_STALE_MS) {
        setIsVoltageAvailable(false);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [rosConnected]);

  // Calculate battery percentage based on voltage (15V-21V range)
  const getBatteryPercentage = () => {
    if (!isVoltageAvailable) return 0;
    const percentage = ((displayVoltage - 15) / (21 - 15)) * 100;
    return Math.max(0, Math.min(100, Math.round(percentage)));
  };

  // Get battery color based on percentage
  const getBatteryColor = () => {
    if (!isVoltageAvailable) return "#444444";
    
    const percentage = getBatteryPercentage();
    if (percentage > 70) return "#3bab72";
    if (percentage > 30) return "#e6a919";
    return "#d64045";
  };

  const isSimaNameOnline = (name: string) => {
    if (!rosConnected) return false;
    const s = simaOnline[name];
    if (!s) return false;
    return s.ok && Date.now() - s.t < SIMA_STALE_MS;
  };

  // Fetch current rival radius from backend on component mount
  useEffect(() => {
    const fetchRivalRadius = async () => {
      try {
        const response = await fetch('/api/rival-radius');
        const data = await response.json();
        
        if (data.success) {
          // Ensure radius is displayed with consistent decimal places
          // Convert from meters to centimeters for display
          const radiusCm = parseFloat(data.radius) * 100;
          setRivalRadius(radiusCm);
        }
      } catch (error) {
        console.error('Error fetching rival radius:', error);
      }
    };
    
    fetchRivalRadius();
  }, []); // Empty dependency array means this runs once on mount
  
  // Fetch dock rival parameters
  useEffect(() => {
    const fetchDockRivalParams = async () => {
      try {
        const response = await fetch('/api/dock-rival-params');
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          // Convert radius from meters to centimeters
          if (data.radius) setDockRivalRadius(data.radius * 100);
          if (data.degree) setDockRivalDegree(data.degree);
        }
      } catch (error) {
        console.error("Error fetching dock rival parameters:", error);
        // Keep using default values on error
      }
    };
    
    fetchDockRivalParams();
  }, []);
  
  // Fetch navigation parameters
  useEffect(() => {
    const fetchNavParams = async () => {
      try {
        const response = await fetch(`/api/nav-params?profile=${navProfile}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
          if (data.linearVelocity) setNavLinearVelocity(data.linearVelocity);
          if (data.angularVelocity) setNavAngularVelocity(data.angularVelocity);
        }
      } catch (error) {
        console.error("Error fetching navigation parameters:", error);
        // Keep using default values on error
      }
    };
    
    fetchNavParams();
  }, [navProfile]);
  
  // Fetch SIMA parameters (this one is correct, keep it)
  useEffect(() => {
    const fetchSimaParams = async () => {
      try {
        const response = await fetch('/api/sima-params');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        if (data.success) {
          if (data.sima_start_time !== undefined) setSimaStartTime(data.sima_start_time);
          if (data.plan_code !== undefined) setPlanCode(data.plan_code);
        }
      } catch (error: any) { // Add type for error
        console.error("Error fetching SIMA parameters:", error);
      }
    };
    fetchSimaParams();
  }, []);

  // Function to update SIMA parameters
  const handleUpdateSimaParams = async () => {
    try {
      const response = await fetch('/api/sima-params', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sima_start_time: simaStartTime,
          plan_code: planCode
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setUpdateStatus({ message: 'SIMA parameters updated successfully', isError: false, visible: true });
        setTimeout(() => setUpdateStatus((prev: UpdateStatus) => ({ ...prev, visible: false })), 3000); // Add type for prev
      } else {
        throw new Error(data.message || 'Update failed');
      }
    } catch (error: any) { // Add type for error
      console.error('Error updating SIMA parameters:', error);
      setUpdateStatus({ message: `Error: ${error.message}`, isError: true, visible: true });
      setTimeout(() => setUpdateStatus((prev: UpdateStatus) => ({ ...prev, visible: false })), 3000); // Add type for prev
    }
  };
  
  // Function to handle long press updates
  const handleLongPressUpdate = async () => {
    if (activeButton === 'rival') handleUpdateRivalRadius(rivalRadius);
    else if (activeButton === 'dock') handleUpdateDockRivalParams();
    else if (activeButton === 'nav') handleUpdateNavParams();
    else if (activeButton === 'sima') handleUpdateSimaParams();
    else if (activeButton === 'reset') resetToDefaults();
  };

  // Remove duplicate updateParameters function
  const handleUpdateRivalRadius = async (newRadius: number) => {
    await updateParameters('rival');
  };

  const handleUpdateDockRivalParams = async () => {
      await updateParameters('dock');
  };
  
  const handleUpdateNavParams = async () => {
      await updateParameters('nav');
  };
  
  // Consolidated update parameters function
  const updateParameters = async (paramType: string) => {
    setUpdateStatus({ message: 'Updating...', isError: false, visible: true });
    
    try {
      let response;
      
      switch (paramType) {
        case 'rival': {
          const radiusM = rivalRadius / 100;
          console.log(`Sending radius update request: ${radiusM}m`);
          
          response = await fetch('/api/rival-radius', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ radius: radiusM }),
          });
          break;
        }
        case 'dock': {
          const radiusM = dockRivalRadius / 100;
          console.log(`Sending dock rival params update: radius=${radiusM}m, degree=${dockRivalDegree}`);
          
          response = await fetch('/api/dock-rival-params', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              radius: radiusM,
              degree: dockRivalDegree 
            }),
          });
          break;
        }
        case 'nav': {
          console.log(`Sending navigation params update: profile=${navProfile}, linear=${navLinearVelocity}, angular=${navAngularVelocity}`);
          
          response = await fetch('/api/nav-params', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              profile: navProfile,
              linearVelocity: navLinearVelocity,
              angularVelocity: navAngularVelocity
            }),
          });
          break;
        }
        case 'sima': {
          console.log(`Sending SIMA params update: offset=${simaStartTime}, planCode=${planCode}`);
          
          response = await fetch('/api/sima-params', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
              sima_start_time: simaStartTime,
              plan_code: planCode
            }),
          });
          break;
        }
        default:
          throw new Error(`Unknown parameter type: ${paramType}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setUpdateStatus({ message: `${paramType} parameters updated successfully`, isError: false, visible: true });
        setTimeout(() => setUpdateStatus((prev: UpdateStatus) => ({ ...prev, visible: false })), 3000); // Add type for prev
      } else {
        throw new Error(data.message || 'Update failed');
      }
    } catch (error: any) { // Add type for error
      console.error(`Error updating ${paramType} parameters:`, error);
      setUpdateStatus({ 
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        isError: true, 
        visible: true 
      });
      setTimeout(() => setUpdateStatus((prev: UpdateStatus) => ({ ...prev, visible: false })), 3000); // Add type for prev
    }
  };

  // Update the handleUpdateAllParams function
  const handleUpdateAllParams = async () => {
    setUpdateStatus({ message: 'Updating all parameters...', isError: false, visible: true });
    try {
      const updatePromises = [];
      // Rival Radius
      updatePromises.push(fetch('/api/rival-radius', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radius: rivalRadius / 100 }) }));
      // Dock Rival Params
      updatePromises.push(fetch('/api/dock-rival-params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radius: dockRivalRadius / 100, degree: dockRivalDegree }) }));
      // Nav Params
      updatePromises.push(fetch('/api/nav-params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile: navProfile, linearVelocity: navLinearVelocity, angularVelocity: navAngularVelocity }) }));
      // SIMA Params - use correct names
      updatePromises.push(fetch('/api/sima-params', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sima_start_time: simaStartTime, plan_code: planCode }) }));

      const results = await Promise.all(updatePromises);
      const allSuccessful = results.every(response => response.ok);
      if (allSuccessful) {
        setUpdateStatus({ message: 'All parameters updated successfully!', isError: false, visible: true });
      } else {
        throw new Error('Some parameters failed to update');
      }
    } catch (error: any) { // Add type for error
      console.error("Error updating all parameters:", error);
      setUpdateStatus({ message: `Error: ${error.message}`, isError: true, visible: true });
    }
    setTimeout(() => setUpdateStatus((prev: UpdateStatus) => ({ ...prev, visible: false })), 3000); // Add type for prev
  };

  const runRobotConfigSaveAfterLongPress = useCallback(async () => {
    setButtonPressProgress(0);
    setActiveButton(null);
    setRobotConfigStatus({ message: "Saving robot config...", isError: false, visible: true });
    try {
      const res = await fetch("/api/robot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(robotConfig),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Save failed");
      setRobotConfigStatus({
        message: "Robot config saved successfully",
        isError: false,
        visible: true,
      });
    } catch (e: unknown) {
      setRobotConfigStatus({
        message: `Error: ${e instanceof Error ? e.message : "Save failed"}`,
        isError: true,
        visible: true,
      });
    }
    setTimeout(() => setRobotConfigStatus((prev) => ({ ...prev, visible: false })), 3000);
  }, [robotConfig]);

  const runRobotConfigResetAfterLongPress = useCallback(async () => {
    setButtonPressProgress(0);
    setActiveButton(null);
    setRobotConfig({ ...DEFAULT_ROBOT_CONFIG });
    setRobotConfigStatus({ message: "Resetting robot config to defaults...", isError: false, visible: true });
    try {
      const res = await fetch("/api/robot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(DEFAULT_ROBOT_CONFIG),
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Reset failed");
      setRobotConfigStatus({
        message: "Robot config reset to defaults",
        isError: false,
        visible: true,
      });
    } catch (e: unknown) {
      setRobotConfigStatus({
        message: `Error: ${e instanceof Error ? e.message : "Reset failed"}`,
        isError: true,
        visible: true,
      });
    }
    setTimeout(() => setRobotConfigStatus((prev) => ({ ...prev, visible: false })), 3000);
  }, []);
  
  // Update the startLongPress function to handle the new unified update
  const startLongPress = (buttonType: string) => {
    setActiveButton(buttonType);
    const timer = setInterval(() => {
      setButtonPressProgress((prev: number) => { // Add type for prev
        const newProgress = prev + (100 / 10); // Complete in 1 second (10x100ms)
        if (newProgress >= 100) {
          clearInterval(timer);
          if (buttonType === 'update') {
            handleUpdateAllParams(); // This should send all params
          } else if (buttonType === 'reset') {
            resetToDefaults();
          } else if (buttonType === 'robotConfigSave') {
            void runRobotConfigSaveAfterLongPress();
          } else if (buttonType === 'robotConfigReset') {
            void runRobotConfigResetAfterLongPress();
          } else {
            // For individual parameter updates (rival, dock, nav, sima)
            updateParameters(buttonType);
          }
          return 100;
        }
        return newProgress;
      });
    }, 100);
    setButtonPressTimer(timer);
  };
  
  // Cancel long press
  const cancelLongPress = () => {
    if (buttonPressTimer) {
      clearInterval(buttonPressTimer);
      setButtonPressTimer(null);
      // No need to call update functions here if startLongPress already does upon 100%
      // The logic in startLongPress handles the action if progress reached 100
      setButtonPressProgress(0); // Reset progress regardless
      // setActiveButton(null); // Consider resetting activeButton here too
    }
  };
  
  // Function to handle navigation profile change
  const handleProfileChange = (profile: string) => {
    setNavProfile(profile);
  };

  // Function to reset all parameters to defaults
  const resetToDefaults = async () => {
    // The call from startLongPress ensures conditions (activeButton === 'reset' and progress was 100) are met.
    // We still need to reset button progress and active button here.
    setButtonPressProgress(0); // Reset progress as the action is now initiated
    setActiveButton(null);    // Clear the active button

    setUpdateStatus({ message: 'Resetting to defaults...', isError: false, visible: true });
    try {
      const response = await fetch('/api/reset-to-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error(`Failed to reset parameters: ${response.statusText}`);
      const data = await response.json();
      if (data.success && data.defaults) {
        const defaults = data.defaults;
        if (defaults.nav_rival_radius) setRivalRadius(Math.round(parseFloat(defaults.nav_rival_radius) * 100));
        if (defaults.dock_rival_radius) setDockRivalRadius(Math.round(parseFloat(defaults.dock_rival_radius) * 100));
        if (defaults.dock_rival_degree) setDockRivalDegree(defaults.dock_rival_degree);
        if (defaults.sima_start_time !== undefined) setSimaStartTime(defaults.sima_start_time);
        if (defaults.plan_code !== undefined) setPlanCode(defaults.plan_code); // Changed from sima_plan_code to plan_code
        if (defaults.robot_config && typeof defaults.robot_config === "object") {
          setRobotConfig((prev) => ({ ...prev, ...defaults.robot_config } as RobotConfigFields));
        }
        setUpdateStatus({ message: 'All parameters reset to defaults!', isError: false, visible: true });
        fetchNavParams(navProfile); // Reload nav params for current profile
      } else {
        throw new Error(data.message || 'Failed to reset parameters or parse defaults');
      }
    } catch (error: any) { 
      console.error("Error resetting parameters:", error);
      setUpdateStatus({ message: `Error: ${error.message}`, isError: true, visible: true });
    }
    setTimeout(() => setUpdateStatus((prev: UpdateStatus) => ({ ...prev, visible: false })), 3000); 
  };
  
  // Helper function to fetch navigation parameters for a specific profile
  const fetchNavParams = async (profile: string) => {
    try {
      const response = await fetch(`/api/nav-params?profile=${profile}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        if (data.linearVelocity) setNavLinearVelocity(parseFloat(data.linearVelocity));
        if (data.angularVelocity) setNavAngularVelocity(parseFloat(data.angularVelocity));
      }
    } catch (error) {
      console.error("Error fetching navigation parameters:", error);
    }
  };
  
  // Helper function to determine system group color
  const getSystemGroupColor = (value: number | null): string => {
    if (value === null) return "red"; // No message or error
    if (value === 0) return "yellow";
    if (value === 3) return "green";
    return "red"; // Default for other unexpected values
  };

  // Add a timeout effect to reset systemGroupStatus if no message received
  useEffect(() => {
    if (!rosConnected) return; // Don't run if not connected

    const intervalId = setInterval(() => {
      const now = Date.now();
      const timeSinceLastUpdate = now - lastGroupsStateUpdateTime;

      // If it's been more than 5 seconds since the last update, reset statuses
      if (lastGroupsStateUpdateTime !== 0 && timeSinceLastUpdate > 5000) {
        setSystemGroupStatus({
          MAIN: null,
          VISION: null,
          NAVIGATION: null,
          LOCALIZATION: null,
        });
        setLastGroupsStateUpdateTime(0); // Reset time to prevent immediate re-trigger
      }
    }, 1000); // Check every second

    // Clean up interval on unmount or when dependencies change
    return () => clearInterval(intervalId);
  }, [rosConnected, lastGroupsStateUpdateTime]); // Removed systemGroupStatus from deps

  const callGameReady = useCallback(() => {
    // Four StartUpSrv calls (group 1–4, state=1) — same contract as Eurobot-2026-Main mock; does not change System Status locally.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const R = (window as any).ROSLIB;
    if (!R) return;
    const srv = getServiceHandler("/robot/startup/ready_signal", STARTUP_SRV_TYPE);
    if (!srv) {
      console.warn(
        "ready_signal: StartUpSrv not available (check bridge / service type " + STARTUP_SRV_TYPE + ")"
      );
      return;
    }
    const callGroup = (i: number) => {
      if (i >= 4) return;
      const gid = i + 1;
      const req = new R.ServiceRequest({ group: gid, state: 1 });
      srv.callService(
        req,
        (res: { success?: boolean }) => {
          if (!res?.success) {
            console.warn("ready_signal: group", gid, "returned success=false");
          }
          callGroup(i + 1);
        },
        (err: Error) => {
          console.error("ready_signal StartUpSrv", gid, err);
          callGroup(i + 1);
        }
      );
    };
    callGroup(0);
  }, [getServiceHandler]);

  const sendGameStart = useCallback(() => {
    const t = plugPubRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const R = (window as any).ROSLIB;
    if (t && R) {
      const M = R.Message;
      t.publish(new M({ data: true }));
    }
  }, []);

  const runTestOnTake = useCallback(() => {
    const t = onTakePubRef.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const R = (window as any).ROSLIB;
    if (!t || !R) return;
    const M = R.Message;
    [0, 1, 2, 3].forEach((n, i) => {
      setTimeout(() => t.publish(new M({ data: n })), i * 400);
    });
  }, []);

  const openSponsorFull = useCallback(() => {
    const el = sponsorPreviewRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setSponsorOpenOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    } else {
      setSponsorOpenOrigin({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    }
    setSponsorCloseExit(false);
    setSponsorOverlayOpen(true);
  }, []);

  const closeSponsorFull = useCallback(() => {
    setSponsorCloseExit(true);
    window.setTimeout(() => {
      setSponsorOverlayOpen(false);
      setSponsorCloseExit(false);
    }, 280);
  }, []);

  useEffect(() => {
    if (!sponsorOverlayOpen) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSponsorFull();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sponsorOverlayOpen, closeSponsorFull]);

  useEffect(() => {
    if (!sponsorOverlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sponsorOverlayOpen]);

  const gameTimeNum = Number.isFinite(gameTimeVal) ? gameTimeVal : 0;
  const gameTimeInt = Math.min(100, Math.max(0, Math.round(gameTimeNum)));
  const gameTimeProgress = Math.min(1, Math.max(0, gameTimeNum / 100));

  const sponsorFullScreenOverlay =
    sponsorOverlayOpen && sponsorRecords.length > 0 && typeof document !== "undefined"
      ? createPortal(
          <SponsorFullscreenOverlay
            records={sponsorRecords}
            onClose={closeSponsorFull}
            openOrigin={sponsorOpenOrigin}
            closeExit={sponsorCloseExit}
          />,
          document.body
        )
      : null;

  return (
    <>
      {sponsorFullScreenOverlay}

    <div
      className="h-full w-full min-h-0 overflow-y-auto overflow-x-hidden bg-[#0e0e0e] px-3 pt-[var(--app-chrome-pad-top)] pb-[var(--app-chrome-pad-bottom)] sm:px-5 lg:px-6 [overflow-anchor:none]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {/* Status Indicators */}
          <StatusPanel title="System Status">
            {systemGroupOrder.map((name) => (
              <StatusItem
                key={name}
                color={getSystemGroupColor(systemGroupStatus[name])}
                label={name}
              />
            ))}
          </StatusPanel>

          {/* Checkboxes */}
          <StatusPanel title="Device Status">
            <CheckboxItem label="CHASSIS" checked={deviceStatus.chassis} />
            <CheckboxItem label="MISSION" checked={deviceStatus.mission} />
            <CheckboxItem label="LIDAR" checked={deviceStatus.lidar} />
            <CheckboxItem label="IMU" checked={deviceStatus.imu} />
            <CheckboxItem label="ESP32" checked={deviceStatus.esp32} />
          </StatusPanel>

          <StatusPanel title="Manual control">
              <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
                <button
                  type="button"
                  disabled={!rosConnected}
                  onClick={callGameReady}
                  className={`${MANUAL_CTRL_NEUTRAL} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  Ready
                </button>
                <button
                  type="button"
                  disabled={!rosConnected}
                  onClick={sendGameStart}
                  className={`${MANUAL_CTRL_ACCENT} disabled:cursor-not-allowed disabled:opacity-50`}
                  style={{ backgroundColor: "var(--theme-accent)" }}
                >
                  Start
                </button>
                <button
                  type="button"
                  disabled={!rosConnected}
                  onClick={runTestOnTake}
                  className={
                    `${MANUAL_CTRL_NEUTRAL} min-h-0 py-3.5 text-base sm:px-3 sm:text-lg md:py-4 md:text-2xl ` +
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  HW Test
                </button>
            </div>
          </StatusPanel>

          <StatusPanel title="Robot config">
            <div className="flex flex-col">
              {RC_FIELD_GROUPS.map((group, groupIdx) => (
                <React.Fragment key={group.title}>
                  <h3
                    className={`text-xl font-bold text-white ${
                      groupIdx > 0 ? "mt-6" : ""
                    }`}
                  >
                    {group.title}
                  </h3>
                  <div className="mt-4 flex min-w-0 flex-col space-y-4">
                    {group.specs.map((spec) => {
                    const raw = robotConfig[spec.key];
                    const v = spec.integer ? Math.round(raw) : raw;
                    const setVal = (n: number) => {
                      const c = spec.integer
                        ? Math.min(spec.max, Math.max(spec.min, Math.round(n)))
                        : Math.min(spec.max, Math.max(spec.min, n));
                      setRobotConfig((o) => ({ ...o, [spec.key]: c }));
                    };
                    const show =
                      spec.integer
                        ? String(Math.round(v))
                        : (Math.round(v * 1000) / 1000).toString();
                    return (
                      <div key={spec.key} className="min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-[#e0e0e0] text-xl">
                            {spec.label}:
                          </div>
                          <div className="text-right text-white text-xl font-bold tabular-nums">
                            {show}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-col space-y-2">
                          <input
                            type="range"
                            min={spec.min}
                            max={spec.max}
                            step={spec.step}
                            value={v}
                            onChange={(e) => {
                              const n = spec.integer
                                ? Math.round(parseFloat(e.target.value))
                                : parseFloat(e.target.value);
                              setVal(n);
                            }}
                            className="h-3 w-full cursor-pointer appearance-none rounded-lg bg-[#333]"
                            aria-label={`${group.title} ${spec.label}`}
                          />
                          <div className="flex justify-between text-sm text-[#999]">
                            <span>{spec.min}</span>
                            <span>{spec.max}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </React.Fragment>
              ))}
            </div>
            <div className="w-full max-w-2xl sm:max-w-none">
              <button
                type="button"
                className="relative mt-8 block w-full overflow-hidden rounded-md px-5 py-4 text-center text-xl font-bold uppercase tracking-wider text-white transition-all duration-300"
                style={{
                  background:
                    activeButton === "robotConfigSave" && buttonPressProgress > 0
                      ? `linear-gradient(to right, #4caf50 ${buttonPressProgress}%, var(--theme-accent) ${buttonPressProgress}%)`
                      : "var(--theme-accent)",
                }}
                onMouseDown={() => startLongPress("robotConfigSave")}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress("robotConfigSave")}
                onTouchEnd={cancelLongPress}
              >
                SAVE ROBOT CONFIG
              </button>
              <button
                type="button"
                className="relative mt-2 block w-full overflow-hidden rounded-md px-5 py-4 text-center text-xl font-bold uppercase tracking-wider text-white transition-all duration-300"
                style={{
                  background:
                    activeButton === "robotConfigReset" && buttonPressProgress > 0
                      ? `linear-gradient(to right, #4caf50 ${buttonPressProgress}%, #333 ${buttonPressProgress}%)`
                      : "#333",
                }}
                onMouseDown={() => startLongPress("robotConfigReset")}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress("robotConfigReset")}
                onTouchEnd={cancelLongPress}
              >
                RESET TO DEFAULTS
              </button>
              {robotConfigStatus.visible && (
                <div
                  className={`mt-2 w-full text-center text-lg ${
                    robotConfigStatus.isError
                      ? "text-theme-accent"
                      : "bg-[#0a2e0a] text-[#6bff6b]"
                  } rounded-md py-2`}
                  style={
                    robotConfigStatus.isError
                      ? { background: "color-mix(in srgb, var(--theme-accent) 14%, #1a0a0a)" }
                      : undefined
                  }
                >
                  {robotConfigStatus.message}
                </div>
              )}
            </div>
          </StatusPanel>

          {/* 3D Model */}
          <Status3DModel />
        </div>

        <div className="space-y-6">

          {/* Robot Ready Signal Status */}
          <StatusPanel title="">
            <div className="flex items-center space-x-6">
              <div className="relative w-28 h-28 flex items-center justify-center">
                {/* Banter Loader Animation */}
                <div className={`banter-loader ${!plugConnected && 'banter-loader--inactive'}`}>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                  <div className="banter-loader__box"></div>
                </div>
              </div>
              
              <div className="flex flex-col">
                <div className="text-2xl font-bold text-white">Startup Signal</div>
                <div
                  className="text-xl font-mono"
                  style={{ color: plugConnected ? "var(--theme-accent)" : "#777" }}
                >
                  {plugConnected ? "READY" : "STANDBY"}
                </div>
              </div>
            </div>
          </StatusPanel>

          <StatusPanel title="Game">
            <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row">
              <div className="flex min-h-[11rem] min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-[#3a3a3a] bg-[#0f0f0f] px-4 py-6">
                <div className="mb-2 text-lg font-semibold uppercase tracking-widest text-[#aaa] sm:text-xl">
                  Score
                </div>
                <div
                  className="text-7xl font-bold leading-none tabular-nums sm:text-8xl"
                  style={{ color: "var(--theme-accent)" }}
                >
                  {gameScore === null ? "—" : gameScore}
                </div>
              </div>
              <div
                className="min-h-[11rem] min-w-0 flex-1 rounded-2xl p-1.5"
                style={{
                  background: `conic-gradient(from -90deg, var(--theme-accent) ${gameTimeProgress * 100}%, #2a2a2a 0)`,
                }}
                role="img"
                aria-label={`Game time ${gameTimeInt} of 100 seconds`}
              >
                <div className="flex h-full min-h-[10.25rem] w-full flex-col items-center justify-center rounded-[0.8rem] border border-[#1f1f1f] bg-[#0f0f0f] px-4 py-5">
                  <div className="mb-2 text-lg font-semibold uppercase tracking-widest text-[#aaa] sm:text-xl">
                    Time
                  </div>
                  <div className="text-7xl font-bold leading-none tabular-nums text-white sm:text-8xl">
                    {gameTimeInt}
                  </div>
                </div>
              </div>
            </div>
          </StatusPanel>

          <StatusPanel
            title="Sponsors"
            headerAction={
              sponsorRecords.length > 0 ? (
                <button
                  type="button"
                  onClick={openSponsorFull}
                  className="flex h-14 min-h-[44px] w-14 min-w-[44px] shrink-0 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: "var(--theme-accent)" }}
                  aria-label="Sponsors full screen"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h6v6M14 10l7-7M9 21H3v-6M10 14l-7 7" />
                  </svg>
                </button>
              ) : null
            }
          >
            {sponsorRecords.length === 0 ? (
              <p className="text-[#888] text-lg">Add logos in Control Panel.</p>
            ) : (
              <div className="flex flex-col items-stretch gap-3">
                <div
                  ref={sponsorPreviewRef}
                  className="relative h-[380px] w-full overflow-hidden rounded-lg bg-[#0f0f0f]"
                  style={{ contain: "paint" as const }}
                >
                  <div className="absolute inset-4 flex min-h-0 min-w-0 items-center justify-center sm:inset-[1.125rem]">
                    <div
                      key={sponsorIndex}
                      className="sponsor-card-slide flex h-full w-full min-h-0 min-w-0 items-center justify-center"
                    >
                      {sponsorPreviewRec && (
                        <img
                          src={sponsorPreviewSrc}
                          alt={sponsorPreviewRec.name}
                          className="h-auto max-h-[93%] w-auto max-w-[96%] object-contain sm:max-h-[95%] sm:max-w-[97%]"
                          decoding="async"
                          fetchPriority="low"
                          draggable={false}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </StatusPanel>
          
          {/* SIMA Status */}
          <StatusPanel title="SIMA Status">
            <span className="sr-only" aria-hidden>
              {simaRenderTick}
            </span>
            <div className="grid grid-cols-2 gap-4 min-w-[300px]">
              {simaNames.map((name) => {
                const online = isSimaNameOnline(name);
                return (
                  <div key={name} className="mb-2 flex items-center space-x-3">
                    <div
                      className={`h-8 w-8 shrink-0 rounded-full ${online ? "bg-[#4caf50]" : "bg-[#f44336]"}`}
                      aria-hidden
                    />
                    <div className="-translate-y-[0.08em] flex min-h-8 items-center text-[#e0e0e0] text-2xl sm:text-3xl uppercase leading-none break-all">
                      {name}
                    </div>
                  </div>
                );
              })}
            </div>
          </StatusPanel>

          {/* Battery Status */}
          <StatusPanel title="BAT STATUS">
            <div className="flex items-center gap-20 min-w-[300px]">
              <div className="text-[#ffffff] text-7xl font-bold text-left py-5 relative">
                {isVoltageAvailable ? (
                  <span className="relative">
                    {displayVoltage.toFixed(1)} <span className="text-5xl absolute bottom-2 -right-10">V</span>
                  </span>
                ) : (
                  <span className="relative text-[#888888]">N/A</span>
                )}
                <div className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-[var(--theme-accent)] to-transparent opacity-70"></div>
              </div>
              
              {/* Battery Icon - New Design */}
              <div className="relative w-24 h-32">
                {/* Battery body/outline */}
                <div className="absolute inset-0 rounded-md border-2 border-[#555] bg-[#111] overflow-hidden flex flex-col">
                  {/* Battery terminals at top */}
                  <div className="h-3 w-full bg-[#333] border-b border-[#444] flex justify-center items-center">
                    <div className="w-6 h-1.5 bg-[#666] rounded-sm"></div>
                  </div>
                  
                  {/* Battery level container */}
                  <div className="flex-1 relative p-0.5">
                    {/* Battery level fill */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 transition-all duration-300"
                      style={{ 
                        height: `${getBatteryPercentage()}%`,
                        background: isVoltageAvailable 
                          ? `linear-gradient(to top, ${getBatteryColor()}, ${getBatteryColor()}88)`
                          : 'linear-gradient(to top, #333, #444)',
                        opacity: isVoltageAvailable ? 1 : 0.5
                      }}
                    ></div>
                    
                    {/* Digital display overlay */}
                    <div className="absolute inset-0 flex flex-col justify-center items-center">
                      <div className="text-center">
                        <div className="font-mono text-lg font-bold text-white mb-1">
                          {isVoltageAvailable ? `${getBatteryPercentage()}%` : "N/A"}
                        </div>
                        {isVoltageAvailable && (
                          <div className="w-full h-0.5 bg-white opacity-30 mb-2"></div>
                        )}
                        <div className="flex justify-center">
                          {isVoltageAvailable && [...Array(Math.min(5, Math.ceil(getBatteryPercentage() / 20)))].map((_, i) => (
                            <div key={i} className="w-1 h-3 bg-white mx-0.5 opacity-80"></div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Battery grid pattern */}
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-6 gap-[1px] pointer-events-none opacity-10">
                      {[...Array(18)].map((_, i) => (
                        <div key={i} className="border border-[#fff]"></div>
                      ))}
                    </div>
                  </div>
                </div>
                
                {/* Glowing indicator */}
                <div 
                  className="absolute top-2 right-2 w-2 h-2 rounded-full transition-colors duration-300"
                  style={{ 
                    backgroundColor: getBatteryColor(),
                    boxShadow: isVoltageAvailable ? `0 0 8px ${getBatteryColor()}` : 'none',
                    opacity: isVoltageAvailable ? 1 : 0.3
                  }}
                ></div>
              </div>
            </div>
          </StatusPanel>
          
          <StatusPanel title="ESP-Daemon">
            <div className="flex flex-col gap-3">
              <a
                href={bmsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white text-2xl font-bold py-4 px-6 rounded-md w-full block text-center tracking-wider transition-colors"
                style={{ backgroundColor: "var(--theme-accent)" }}
              >
                Connect
              </a>
            </div>
          </StatusPanel>

          {/* Rival Robot Parameters Panel */}
          <StatusPanel title="Robot Parameters">
            <div className="flex flex-col space-y-4">
              <h3 className="text-xl font-bold text-white">Rival Parameters</h3>
              <div className="flex items-center justify-between">
                <div className="text-[#e0e0e0] text-xl mt-4">Rival Robot Radius:</div>
                <div className="text-white text-xl font-bold">{rivalRadius} cm</div>
              </div>
              
                             <div className="flex flex-col space-y-2">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={rivalRadius}
                  onChange={(e) => setRivalRadius(parseInt(e.target.value))}
                  className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[#999] text-sm">
                  <span>0 cm</span>
                  <span>25 cm</span>
                  <span>50 cm</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-[#e0e0e0] text-xl">Dock Rival Radius:</div>
                <div className="text-white text-xl font-bold">{dockRivalRadius} cm</div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="1"
                  value={dockRivalRadius}
                  onChange={(e) => setDockRivalRadius(parseInt(e.target.value))}
                  className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[#999] text-sm">
                  <span>0 cm</span>
                  <span>25 cm</span>
                  <span>50 cm</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-[#e0e0e0] text-xl">Dock Rival Degree:</div>
                <div className="text-white text-xl font-bold">{dockRivalDegree}°</div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="5"
                  value={dockRivalDegree}
                  onChange={(e) => setDockRivalDegree(parseInt(e.target.value))}
                  className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[#999] text-sm">
                  <span>0°</span>
                  <span>180°</span>
                  <span>360°</span>
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-white mt-6">Navigation Parameters</h3>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => handleProfileChange('didilong')}
                  className={`py-2 px-3 rounded text-white font-semibold ${navProfile === 'didilong' ? 'bg-theme-accent' : 'bg-[#333]'}`}
                >
                  DIDILONG
                </button>
                <button 
                  onClick={() => handleProfileChange('fast')}
                  className={`py-2 px-3 rounded text-white font-semibold ${navProfile === 'fast' ? 'bg-theme-accent' : 'bg-[#333]'}`}
                >
                  FAST
                </button>
                <button 
                  onClick={() => handleProfileChange('slow')}
                  className={`py-2 px-3 rounded text-white font-semibold ${navProfile === 'slow' ? 'bg-theme-accent' : 'bg-[#333]'}`}
                >
                  SLOW
                </button>
                <button 
                  onClick={() => handleProfileChange('linearBoost')}
                  className={`py-2 px-3 rounded text-white font-semibold ${navProfile === 'linearBoost' ? 'bg-theme-accent' : 'bg-[#333]'}`}
                >
                  LINEAR BOOST
                </button>
                <button 
                  onClick={() => handleProfileChange('angularBoost')}
                  className={`py-2 px-3 rounded text-white font-semibold ${navProfile === 'angularBoost' ? 'bg-theme-accent' : 'bg-[#333]'}`}
                >
                  ANGULAR BOOST
                </button>
              </div>
              
              <div className="flex items-center justify-between mt-4">
                <div className="text-[#e0e0e0] text-xl">Linear Velocity:</div>
                <div className="text-white text-xl font-bold">{typeof navLinearVelocity === 'number' ? navLinearVelocity.toFixed(1) : navLinearVelocity} m/s</div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <input
                  type="range"
                  min="0.1"
                  max="1.6"
                  step="0.1"
                  value={navLinearVelocity}
                  onChange={(e) => setNavLinearVelocity(parseFloat(e.target.value))}
                  className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[#999] text-sm">
                  <span>0.1 m/s</span>
                  <span>0.8 m/s</span>
                  <span>1.6 m/s</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between mt-4">
                <div className="text-[#e0e0e0] text-xl">Angular Velocity:</div>
                <div className="text-white text-xl font-bold">{typeof navAngularVelocity === 'number' ? navAngularVelocity.toFixed(1) : navAngularVelocity} rad/s</div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <input
                  type="range"
                  min="1.0"
                  max="15.0"
                  step="0.5"
                  value={navAngularVelocity}
                  onChange={(e) => setNavAngularVelocity(parseFloat(e.target.value))}
                  className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[#999] text-sm">
                  <span>1.0 rad/s</span>
                  <span>8.0 rad/s</span>
                  <span>15.0 rad/s</span>
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-white mt-6">SIMA Parameters</h3>
              <div className="flex items-center justify-between">
                <div className="text-[#e0e0e0] text-xl">Start Time:</div>
                <div className="text-white text-xl font-bold">{simaStartTime}</div>
              </div>
              
              <div className="flex flex-col space-y-2">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={simaStartTime}
                  onChange={(e) => setSimaStartTime(parseInt(e.target.value))}
                  className="w-full h-3 bg-[#333] rounded-lg appearance-none cursor-pointer"
                />
                
                <div className="flex justify-between text-[#999] text-sm">
                  <span>0</span>
                  <span>50</span>
                  <span>100</span>
                </div>
              </div>

              {/* Add SIMA Plan Code Controls */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-[#e0e0e0] text-xl">Plan Code:</div>
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={() => setPlanCode(prev => Math.max(1, prev - 1))}
                    className="bg-[#333] text-white w-10 h-10 rounded-md flex items-center justify-center hover:bg-[#444] transition-colors"
                  >
                    <span className="text-2xl">-</span>
                  </button>
                  <div className="text-white text-xl font-bold min-w-[40px] text-center">
                    {planCode}
                  </div>
                  <button 
                    onClick={() => setPlanCode(prev => Math.min(50, prev + 1))} // Changed 10 to 50
                    className="bg-[#333] text-white w-10 h-10 rounded-md flex items-center justify-center hover:bg-[#444] transition-colors"
                  >
                    <span className="text-2xl">+</span>
                  </button>
                </div>
              </div>
              
              <button
                className="text-white text-xl font-bold py-4 px-5 rounded-md w-full block text-center uppercase tracking-wider transition-all duration-300 mt-8 relative overflow-hidden"
                style={{
                  background: activeButton === 'update' && buttonPressProgress > 0 
                    ? `linear-gradient(to right, #4caf50 ${buttonPressProgress}%, var(--theme-accent) ${buttonPressProgress}%)`
                    : "var(--theme-accent)",
                }}
                onMouseDown={() => startLongPress('update')}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress('update')}
                onTouchEnd={cancelLongPress}
              >
                UPDATE ALL PARAMETERS
              </button>
              
              {/* After the update button, add DEFAULT button */}
              <button
                className="text-white text-xl font-bold py-4 px-5 rounded-md w-full block text-center uppercase tracking-wider transition-all duration-300 mt-2 relative overflow-hidden"
                style={{
                  background: activeButton === 'reset' && buttonPressProgress > 0 
                    ? `linear-gradient(to right, #4caf50 ${buttonPressProgress}%, #333 ${buttonPressProgress}%)`
                    : '#333'
                }}
                onMouseDown={() => startLongPress('reset')}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress('reset')}
                onTouchEnd={cancelLongPress}
              >
                RESET TO DEFAULTS
              </button>
              
              {updateStatus.visible && (
                <div
                  className={`mt-2 w-full text-center text-lg ${
                    updateStatus.isError
                      ? "text-theme-accent"
                      : "bg-[#0a2e0a] text-[#6bff6b]"
                  } rounded-md py-2`}
                  style={
                    updateStatus.isError
                      ? { background: "color-mix(in srgb, var(--theme-accent) 14%, #1a0a0a)" }
                      : undefined
                  }
                >
                  {updateStatus.message}
                </div>
              )}
            </div>
          </StatusPanel>
        </div>
      </div>

      {/* Long-press now replaces the confirmation dialog */}

      {/* Floating Bridge Status Indicator - Now a refresh button */}
      <div 
        className={`fixed ${
          isHalfScreen ? "bottom-30" : "bottom-20"
        } right-6 z-50 flex max-w-[min(100%,calc(100vw-1.5rem))] cursor-pointer select-none items-center gap-6 rounded-2xl border-2 border-[#444] bg-black/70 px-5 py-4 shadow-2xl backdrop-blur-md transition-all duration-300 sm:right-8 sm:gap-8 sm:px-8 sm:py-5`}
        style={{
          background: pressProgress > 0 
            ? `linear-gradient(to right, rgba(76, 175, 80, 0.8) ${pressProgress}%, rgba(0, 0, 0, 0.7) ${pressProgress}%)`
            : 'rgba(0, 0, 0, 0.7)'
        }}
        onMouseDown={() => {
          // Start long-press timer
          const timer = setInterval(() => {
            setPressProgress((prev: number) => { // Add type for prev
              const newProgress = prev + (100/10); // Complete in 1 second (10×100ms)
              if (newProgress >= 100) {
                // Reload the page
                window.location.reload();
                clearInterval(timer);
                return 0;
              }
              return newProgress;
            });
          }, 100);
          setPressTimer(timer);
        }}
        onMouseUp={() => {
          // Cancel long-press
          if (pressTimer) {
            clearInterval(pressTimer);
            setPressTimer(null);
            setPressProgress(0);
          }
        }}
        onMouseLeave={() => {
          // Also cancel on mouse leave
          if (pressTimer) {
            clearInterval(pressTimer);
            setPressTimer(null);
            setPressProgress(0);
          }
        }}
        onTouchStart={() => {
          // Start long-press timer (touch screen)
          const timer = setInterval(() => {
            setPressProgress((prev: number) => { // Add type for prev
              const newProgress = prev + (100/10); // Complete in 1 second
              if (newProgress >= 100) {
                // Reload the page
                window.location.reload();
                clearInterval(timer);
                return 0;
              }
              return newProgress;
            });
          }, 100);
          setPressTimer(timer);
        }}
        onTouchEnd={() => {
          // Cancel long-press (touch screen)
          if (pressTimer) {
            clearInterval(pressTimer);
            setPressTimer(null);
            setPressProgress(0);
          }
        }}
      >
        <div className="relative">
          <div className={`w-8 h-8 rounded-full ${rosConnected ? "bg-theme-accent" : "bg-[#444]"}`}></div>
          {rosConnected && (
            <div className="absolute inset-0 w-8 h-8 rounded-full bg-theme-accent animate-ping opacity-75"></div>
          )}
        </div>
        <div className="flex flex-col">
          <div className="text-white text-2xl font-mono font-bold leading-tight">
            ROS Bridge
          </div>
          <div className={`text-xl font-mono ${rosConnected ? "text-theme-accent" : "text-[#999]"}`}>
            {rosConnected ? "Connected" : "Press to refresh"}
          </div>
        </div>
        
        {/* Long-press progress is now shown with background gradient */}
      </div>

      {/* Add extra bottom space to prevent content from being hidden behind fixed elements */}
      <div className="h-20 w-full sm:h-24" aria-hidden />

      <style jsx={true} global={true}>{`
        ::-webkit-scrollbar {
          display: none;
        }
        
        * {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        
        @keyframes scan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(400%); }
        }
        
        .animate-scan {
          animation: scan 2s linear infinite;
        }
        
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .animate-spin-slow {
          animation: spin-slow 15s linear infinite;
        }

        /* Banter Loader Animation */
        .banter-loader {
          position: relative;
          width: 72px;
          height: 72px;
          transform: scale(0.7);
          transition: opacity 0.5s ease;
        }

        .banter-loader__box {
          float: left;
          position: relative;
          width: 20px;
          height: 20px;
          margin-right: 6px;
        }

        .banter-loader__box:before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          background: white;
          transition: opacity 0.5s ease, transform 0.3s ease;
        }

        .banter-loader--inactive {
          opacity: 0.4;
        }

        .banter-loader--inactive .banter-loader__box:before {
          background: white;
        }

        .banter-loader__box:nth-child(3n) {
          margin-right: 0;
          margin-bottom: 6px;
        }

        .banter-loader__box:nth-child(1):before, .banter-loader__box:nth-child(4):before {
          margin-left: 26px;
        }

        .banter-loader__box:nth-child(3):before {
          margin-top: 52px;
        }

        .banter-loader__box:last-child {
          margin-bottom: 0;
        }

        @keyframes moveBox-1 {
          9.0909090909% { transform: translate(-26px, 0); }
          18.1818181818% { transform: translate(0px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(26px, 0); }
          45.4545454545% { transform: translate(26px, 26px); }
          54.5454545455% { transform: translate(26px, 26px); }
          63.6363636364% { transform: translate(26px, 26px); }
          72.7272727273% { transform: translate(26px, 0px); }
          81.8181818182% { transform: translate(0px, 0px); }
          90.9090909091% { transform: translate(-26px, 0px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(1) {
          animation: moveBox-1 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(1) {
          animation: none;
        }

        @keyframes moveBox-2 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(26px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(26px, 0); }
          45.4545454545% { transform: translate(26px, 26px); }
          54.5454545455% { transform: translate(26px, 26px); }
          63.6363636364% { transform: translate(26px, 26px); }
          72.7272727273% { transform: translate(26px, 26px); }
          81.8181818182% { transform: translate(0px, 26px); }
          90.9090909091% { transform: translate(0px, 26px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(2) {
          animation: moveBox-2 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(2) {
          animation: none;
        }

        @keyframes moveBox-3 {
          9.0909090909% { transform: translate(-26px, 0); }
          18.1818181818% { transform: translate(-26px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(-26px, 0); }
          45.4545454545% { transform: translate(-26px, 0); }
          54.5454545455% { transform: translate(-26px, 0); }
          63.6363636364% { transform: translate(-26px, 0); }
          72.7272727273% { transform: translate(-26px, 0); }
          81.8181818182% { transform: translate(-26px, -26px); }
          90.9090909091% { transform: translate(0px, -26px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(3) {
          animation: moveBox-3 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(3) {
          animation: none;
        }

        @keyframes moveBox-4 {
          9.0909090909% { transform: translate(-26px, 0); }
          18.1818181818% { transform: translate(-26px, 0); }
          27.2727272727% { transform: translate(-26px, -26px); }
          36.3636363636% { transform: translate(0px, -26px); }
          45.4545454545% { transform: translate(0px, 0px); }
          54.5454545455% { transform: translate(0px, -26px); }
          63.6363636364% { transform: translate(0px, -26px); }
          72.7272727273% { transform: translate(0px, -26px); }
          81.8181818182% { transform: translate(26px, -26px); }
          90.9090909091% { transform: translate(26px, 0px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(4) {
          animation: moveBox-4 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(4) {
          animation: none;
        }

        @keyframes moveBox-5 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(0, 0); }
          27.2727272727% { transform: translate(0, 0); }
          36.3636363636% { transform: translate(26px, 0); }
          45.4545454545% { transform: translate(26px, 0); }
          54.5454545455% { transform: translate(26px, 0); }
          63.6363636364% { transform: translate(26px, 0); }
          72.7272727273% { transform: translate(26px, 0); }
          81.8181818182% { transform: translate(26px, -26px); }
          90.9090909091% { transform: translate(0px, -26px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(5) {
          animation: moveBox-5 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(5) {
          animation: none;
        }

        @keyframes moveBox-6 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(-26px, 0); }
          27.2727272727% { transform: translate(-26px, 0); }
          36.3636363636% { transform: translate(0px, 0); }
          45.4545454545% { transform: translate(0px, 0); }
          54.5454545455% { transform: translate(0px, 0); }
          63.6363636364% { transform: translate(0px, 0); }
          72.7272727273% { transform: translate(0px, 26px); }
          81.8181818182% { transform: translate(-26px, 26px); }
          90.9090909091% { transform: translate(-26px, 0px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(6) {
          animation: moveBox-6 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(6) {
          animation: none;
        }

        @keyframes moveBox-7 {
          9.0909090909% { transform: translate(26px, 0); }
          18.1818181818% { transform: translate(26px, 0); }
          27.2727272727% { transform: translate(26px, 0); }
          36.3636363636% { transform: translate(0px, 0); }
          45.4545454545% { transform: translate(0px, -26px); }
          54.5454545455% { transform: translate(26px, -26px); }
          63.6363636364% { transform: translate(0px, -26px); }
          72.7272727273% { transform: translate(0px, -26px); }
          81.8181818182% { transform: translate(0px, 0px); }
          90.9090909091% { transform: translate(26px, 0px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(7) {
          animation: moveBox-7 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(7) {
          animation: none;
        }

        @keyframes moveBox-8 {
          9.0909090909% { transform: translate(0, 0); }
          18.1818181818% { transform: translate(-26px, 0); }
          27.2727272727% { transform: translate(-26px, -26px); }
          36.3636363636% { transform: translate(0px, -26px); }
          45.4545454545% { transform: translate(0px, -26px); }
          54.5454545455% { transform: translate(0px, -26px); }
          63.6363636364% { transform: translate(0px, -26px); }
          72.7272727273% { transform: translate(0px, -26px); }
          81.8181818182% { transform: translate(26px, -26px); }
          90.9090909091% { transform: translate(26px, 0px); }
          100% { transform: translate(0px, 0px); }
        }

        .banter-loader__box:nth-child(8) {
          animation: moveBox-8 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(8) {
          animation: none;
        }

        @keyframes moveBox-9 {
          9.0909090909% { transform: translate(-26px, 0); }
          18.1818181818% { transform: translate(-26px, 0); }
          27.2727272727% { transform: translate(0px, 0); }
          36.3636363636% { transform: translate(-26px, 0); }
          45.4545454545% { transform: translate(0px, 0); }
          54.5454545455% { transform: translate(0px, 0); }
          63.6363636364% { transform: translate(-26px, 0); }
          72.7272727273% { transform: translate(-26px, 0); }
          81.8181818182% { transform: translate(-52px, 0); }
          90.9090909091% { transform: translate(-26px, 0); }
          100% { transform: translate(0px, 0); }
        }

        .banter-loader__box:nth-child(9) {
          animation: moveBox-9 4s infinite;
        }
        
        .banter-loader--inactive .banter-loader__box:nth-child(9) {
          animation: none;
        }
      `}</style>
    </div>
    </>
  );
}

function StatusItem({ color, label, key }: { color: string; label: string; key?: string }) { // Added key as an optional prop
  const colorMap: { [key: string]: string } = { // Added index signature to colorMap
    green: "bg-[#4caf50]",
    yellow: "bg-[#ffb74d]",
    red: "bg-[#f44336]",
  };

  return (
    <div className="flex items-center space-x-5 mb-5">
      <div
        className={`w-8 h-8 shrink-0 rounded-full ${colorMap[color as keyof typeof colorMap]}`}
        aria-hidden
      />
      <div className="-translate-y-[0.08em] flex min-h-8 items-center text-[#e0e0e0] text-3xl uppercase leading-none tracking-wider min-w-[180px] break-words">
        {label}
      </div>
    </div>
  );
}

// Checkbox item component
function CheckboxItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center space-x-5 mb-5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-theme-accent">
        {checked ? (
          <div className="h-5 w-5 bg-theme-accent" />
        ) : (
          <div className="h-5 w-5 bg-transparent" />
        )}
      </div>
      <div className="-translate-y-[0.08em] flex min-h-8 items-center text-[#e0e0e0] text-3xl uppercase leading-none tracking-wider min-w-[180px] break-words">
        {label}
      </div>
    </div>
  );
}

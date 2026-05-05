import { useState, useEffect, useCallback } from 'react';

interface RosConnectionState {
  ros: ROSLIB.Ros | null;
  connected: boolean;
  url: string;
}

let rosInstance: ROSLIB.Ros | null = null;
let rosSubscribers = 0;
const ROS_STATE_EVENT = 'eurobot-ros-connection-state';

function emitRosState(state: RosConnectionState): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<RosConnectionState>(ROS_STATE_EVENT, { detail: state }));
}

function isRosInstanceOpen(ros: ROSLIB.Ros | null): boolean {
  return ros?.isConnected === true || ros?.socket?.readyState === WebSocket.OPEN;
}

function isRosInstanceConnecting(ros: ROSLIB.Ros | null): boolean {
  return ros?.socket?.readyState === WebSocket.CONNECTING;
}

export function useRosConnection() {
  const [connectionState, setConnectionState] = useState<RosConnectionState>({
    ros: null,
    connected: false,
    url: ''
  });

  useEffect(() => {
    // Skip if ROSLIB is not available
    if (typeof window === 'undefined' || !window.ROSLIB) {
      console.warn('ROSLIB not available - ROS2 connection disabled');
      return;
    }

    // bms-hostname (ESP daemon) is not used for the bridge URL; kept for other UI that reads it.
    const hostname = localStorage.getItem("bms-hostname") || "DIT-2026-10";
    const _hostNumber = hostname.split("-")[2] || "";
    void _hostNumber;
    const rosUrl = `ws://localhost:9090`;

    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    let disposed = false;
    const maxReconnectAttempts = 10;
    const reconnectInterval = 3000;

    const onSharedState = (event: Event) => {
      const detail = (event as CustomEvent<RosConnectionState>).detail;
      if (detail) setConnectionState(detail);
    };
    window.addEventListener(ROS_STATE_EVENT, onSharedState);

    // Function to attempt reconnection
    const attemptReconnect = () => {
      if (rosSubscribers <= 0) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectToROS();
        }, reconnectInterval);
      } else {
        if (!import.meta.env.DEV) {
          console.warn('Maximum reconnection attempts reached. Please refresh the page.');
        }
      }
    };

    // Function to connect to ROS
    const connectToROS = () => {
      // If we already have a connection, use it
      if (rosInstance) {
        if (isRosInstanceOpen(rosInstance) || isRosInstanceConnecting(rosInstance)) {
          const state = {
            ros: rosInstance,
            connected: isRosInstanceOpen(rosInstance),
            url: rosUrl
          };
          if (!disposed) setConnectionState(state);
          emitRosState(state);
          return;
        }
        try {
          rosInstance.close?.();
        } catch {}
        rosInstance = null;
      }

      try {
        // Establish new ROS connection
        const ros = new window.ROSLIB.Ros({
          url: rosUrl
        });

        // Set the global instance
        rosInstance = ros;

        // ROS connection event handlers
        ros.on('connection', () => {
          const state = {
            ros,
            connected: true,
            url: rosUrl
          };
          if (!disposed) setConnectionState(state);
          emitRosState(state);
          reconnectAttempts = 0;
        });

        ros.on('error', () => {
          if (rosInstance === ros) rosInstance = null;
          const state = {
            ros: rosInstance,
            connected: false,
            url: rosUrl
          };
          if (!disposed) setConnectionState(state);
          emitRosState(state);
          attemptReconnect();
        });

        ros.on('close', () => {
          if (rosInstance === ros) rosInstance = null;
          const state = {
            ros: null,
            connected: false,
            url: rosUrl
          };
          if (!disposed) setConnectionState(state);
          emitRosState(state);
          attemptReconnect();
        });
      } catch {
        if (rosInstance && !isRosInstanceOpen(rosInstance)) rosInstance = null;
        const state = { ros: null, connected: false, url: rosUrl };
        if (!disposed) setConnectionState(state);
        emitRosState(state);
        attemptReconnect();
      }
    };

    // Increment the subscriber count
    rosSubscribers++;
    
    // Connect to ROS with an initial delay to ensure the service is ready
    const initialDelay = 2000; // 2 seconds delay before first connection attempt
    const initialConnectTimer = setTimeout(() => {
      connectToROS();
    }, initialDelay);

    // Cleanup function
    return () => {
      disposed = true;
      // Decrement the subscriber count
      rosSubscribers--;
      window.removeEventListener(ROS_STATE_EVENT, onSharedState);
      
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (initialConnectTimer) {
        clearTimeout(initialConnectTimer);
      }
      
      // Only close the connection if no components are using it
      if (rosSubscribers === 0 && rosInstance) {
        try {
          rosInstance.close();
          rosInstance = null;
        } catch (e) {
          console.error("Error during cleanup:", e);
        }
      }
    };
  }, []);

  // Helper function to create a topic instance
  const getTopicHandler = useCallback((topicName: string, messageType: string) => {
    if (!connectionState.ros || !connectionState.connected) {
      return null;
    }

    return new window.ROSLIB.Topic({
      ros: connectionState.ros,
      name: topicName,
      messageType: messageType
    });
  }, [connectionState.ros, connectionState.connected]);

  // Helper function to create a service instance
  const getServiceHandler = useCallback((serviceName: string, serviceType: string) => {
    if (!connectionState.ros || !connectionState.connected) {
      return null;
    }

    return new window.ROSLIB.Service({
      ros: connectionState.ros,
      name: serviceName,
      serviceType: serviceType
    });
  }, [connectionState.ros, connectionState.connected]);

  // Helper function to create a service server instance
  const getServiceServer = useCallback((serviceName: string, serviceType: string) => {
    if (!connectionState.ros || !connectionState.connected) {
      return null;
    }

    return new window.ROSLIB.Service({
      ros: connectionState.ros,
      name: serviceName,
      serviceType: serviceType
    });
  }, [connectionState.ros, connectionState.connected]);

  /** Advertise and return a publisher Topic (caller must unadvertise/unsubscribe on cleanup) */
  const createPublisher = useCallback(
    (topicName: string, messageType: string) => {
      if (typeof window === 'undefined' || !window.ROSLIB) return null;
      if (!connectionState.ros || !connectionState.connected) return null;
      const topic = new window.ROSLIB.Topic({
        ros: connectionState.ros,
        name: topicName,
        messageType,
      });
      topic.advertise();
      return topic;
    },
    [connectionState.ros, connectionState.connected]
  );

  return {
    ...connectionState,
    getTopicHandler,
    getServiceHandler,
    getServiceServer,
    createPublisher,
  };
}

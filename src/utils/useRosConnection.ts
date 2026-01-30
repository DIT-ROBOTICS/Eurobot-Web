import { useState, useEffect, useCallback } from 'react';

// Define the shape of our connection state
interface RosConnectionState {
  ros: any;
  connected: boolean;
  url: string;
}

// Singleton instance for the ROS connection
let rosInstance: any = null;
let rosSubscribers = 0;

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

    // Get hostname from localStorage
    const hostname = localStorage.getItem('bms-hostname') || "DIT-2026-10";
    const hostNumber = hostname.split('-')[2] || "";
    const rosUrl = `ws://localhost:9090`;

    let reconnectTimer: any = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;
    const reconnectInterval = 3000;

    // Function to attempt reconnection
    const attemptReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(`Attempting to reconnect to ROS (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);
        
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectToROS();
        }, reconnectInterval);
      } else {
        console.warn('Maximum reconnection attempts reached. Please refresh the page.');
      }
    };

    // Function to connect to ROS
    const connectToROS = () => {
      // If we already have a connection, use it
      if (rosInstance) {
        setConnectionState({
          ros: rosInstance,
          connected: true,
          url: rosUrl
        });
        return;
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
          console.log('Connected to ROS2 bridge');
          setConnectionState({
            ros,
            connected: true,
            url: rosUrl
          });
          reconnectAttempts = 0;
        });

        ros.on('error', (error: any) => {
          console.error('Error connecting to ROS2 bridge:', error);
          setConnectionState((prev: RosConnectionState) => ({ ...prev, connected: false }));
          attemptReconnect();
        });

        ros.on('close', () => {
          console.log('Connection to ROS2 bridge closed');
          setConnectionState((prev: RosConnectionState) => ({ ...prev, connected: false }));
          attemptReconnect();
        });
      } catch (error) {
        console.error('Failed to initialize ROS2 connection:', error);
        setConnectionState((prev: RosConnectionState) => ({ ...prev, connected: false }));
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
      // Decrement the subscriber count
      rosSubscribers--;
      
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

    return new (window as any).ROSLIB.Topic({
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

    return new (window as any).ROSLIB.Service({
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

    return new (window as any).ROSLIB.Service({
      ros: connectionState.ros,
      name: serviceName,
      serviceType: serviceType
    });
  }, [connectionState.ros, connectionState.connected]);

  return {
    ...connectionState,
    getTopicHandler,
    getServiceHandler,
    getServiceServer
  };
} 
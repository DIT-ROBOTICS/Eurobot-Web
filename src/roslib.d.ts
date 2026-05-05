interface ROSLIBMessage {
  data: unknown;
  [key: string]: unknown;
}

interface ROSLIBSocket {
  readyState: number;
}

interface ROSLIBServiceRequestData {
  [key: string]: unknown;
}

interface ROSLIBServiceResponse {
  success?: boolean;
  message?: string;
  [key: string]: unknown;
}

interface ROSLIBEvent {
  on(eventName: string, callback: (data?: unknown) => void): void;
  close(): void;
}

declare namespace ROSLIB {
  class Ros implements ROSLIBEvent {
    isConnected?: boolean;
    socket?: ROSLIBSocket;
    constructor(options: { url: string });
    on(eventName: string, callback: (data?: unknown) => void): void;
    close(): void;
  }

  class Topic {
    name: string;
    messageType: string;
    ros: ROSLIB.Ros;
    constructor(options: { ros: ROSLIB.Ros; name: string; messageType: string });
    subscribe(callback: (message: ROSLIBMessage) => void): void;
    unsubscribe(): void;
    publish(message: ROSLIBMessage | Message): void;
    advertise(): void;
    unadvertise(): void;
  }

  class Service {
    name: string;
    serviceType: string;
    ros: ROSLIB.Ros;
    constructor(options: { ros: ROSLIB.Ros; name: string; serviceType: string });
    callService(
      request: ROSLIBServiceRequestData | ServiceRequest,
      callback: (response: ROSLIBServiceResponse) => void,
      failedCallback?: (error: Error) => void
    ): void;
    advertise(handler: (request: ROSLIBServiceRequestData, response: ROSLIBServiceResponse) => boolean): void;
    unadvertise(): void;
  }

  class ServiceRequest {
    constructor(values?: ROSLIBServiceRequestData);
    [key: string]: unknown;
  }

  class Message {
    constructor(values?: { [key: string]: unknown });
    [key: string]: unknown;
  }
}

interface Window {
  ROSLIB: typeof ROSLIB;
}

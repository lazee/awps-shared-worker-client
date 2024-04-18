export interface WebSocketClient {
  onclose(fn: (code: number, reason: string) => void): void;
  onerror(fn: (error: any) => void): void;
  onmessage(fn: (data: string | Buffer | ArrayBuffer | Buffer[]) => void): void;
  onopen(fn: () => void): void;
  /** Closes the WebSocket connection, optionally using code as the the WebSocket connection close code and reason as the the WebSocket connection close reason. */
  close(code?: number, reason?: string): void;
  /** Transmits data using the WebSocket connection. data can be a string, a Blob, an ArrayBuffer, or an ArrayBufferView. */
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  send(data: any): Promise<void>;
  isOpen(): boolean;
}

export class WebSocketClientImpl implements WebSocketClient {
  private socket: WebSocket;

  public constructor(url: string, protocolName: string) {
    this.socket = new WebSocket(url, protocolName);
  }

  onopen(fn: (event: Event) => void): void {
    this.socket.onopen = (event) => fn(event);
  }

  onclose(fn: (code: number, reason: string) => void): void {
    this.socket.onclose = (event: CloseEvent) => fn(event.code, event.reason);
  }

  onerror(fn: (error: Event) => void): void {
    this.socket.onerror = (event: Event) => fn(event);
  }

  onmessage(fn: (data: string | Buffer | ArrayBuffer) => void): void {
    this.socket.onmessage = (event: MessageEvent) => fn(event.data);
  }

  close(code?: number, reason?: string): void {
    this.socket.close(code, reason);
  }

  send(data: string | ArrayBuffer | Blob | ArrayBufferView): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.isOpen()) {
          this.socket.send(data);
          resolve();
        } else {
          reject(new Error("WebSocket is not open"));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  isOpen(): boolean {
    return this.socket.readyState === WebSocket.OPEN;
  }
}

export class WebSocketClientFactory {
  public create(uri: string, protocolName: string): WebSocketClient {
    return new WebSocketClientImpl(uri, protocolName);
  }
}

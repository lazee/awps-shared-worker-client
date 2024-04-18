/// <reference types="node" />
export interface WebSocketClient {
    onclose(fn: (code: number, reason: string) => void): void;
    onerror(fn: (error: any) => void): void;
    onmessage(fn: (data: string | Buffer | ArrayBuffer | Buffer[]) => void): void;
    onopen(fn: () => void): void;
    /** Closes the WebSocket connection, optionally using code as the the WebSocket connection close code and reason as the the WebSocket connection close reason. */
    close(code?: number, reason?: string): void;
    /** Transmits data using the WebSocket connection. data can be a string, a Blob, an ArrayBuffer, or an ArrayBufferView. */
    send(data: any): Promise<void>;
    isOpen(): boolean;
}
export declare class WebSocketClientImpl implements WebSocketClient {
    private socket;
    constructor(url: string, protocolName: string);
    onopen(fn: (event: Event) => void): void;
    onclose(fn: (code: number, reason: string) => void): void;
    onerror(fn: (error: Event) => void): void;
    onmessage(fn: (data: string | Buffer | ArrayBuffer) => void): void;
    close(code?: number, reason?: string): void;
    send(data: string | ArrayBuffer | Blob | ArrayBufferView): Promise<void>;
    isOpen(): boolean;
}
export declare class WebSocketClientFactory {
    create(uri: string, protocolName: string): WebSocketClient;
}

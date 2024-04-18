import { WebPubSubResult, JoinGroupOptions, LeaveGroupOptions, OnConnectedArgs, OnDisconnectedArgs, OnGroupDataMessageArgs, OnServerDataMessageArgs, OnStoppedArgs, SendToGroupOptions, SendEventOptions, WebPubSubClientOptions, OnRejoinGroupFailedArgs } from "./models";
import { WebPubSubDataType } from "./models/messages";
import { WebPubSubClientCredential } from "./webPubSubClientCredential";
/**
 * Types which can be serialized and sent as JSON.
 */
export type JSONTypes = string | number | boolean | object;
/**
 * The WebPubSub client
 */
export declare class WebPubSubClient {
    private readonly _protocol;
    private readonly _credential;
    private readonly _options;
    private readonly _groupMap;
    private readonly _ackMap;
    private readonly _sequenceId;
    private readonly _messageRetryPolicy;
    private readonly _reconnectRetryPolicy;
    private readonly _emitter;
    private _state;
    private _isStopping;
    private _ackId;
    private _wsClient?;
    private _uri?;
    private _lastCloseEvent?;
    private _lastDisconnectedMessage?;
    private _connectionId?;
    private _reconnectionToken?;
    private _isInitialConnected;
    private nextAckId;
    /**
     * Create an instance of WebPubSubClient
     * @param clientAccessUrl - The uri to connect
     * @param options - The client options
     */
    constructor(clientAccessUrl: string, options?: WebPubSubClientOptions);
    /**
     * Create an instance of WebPubSubClient
     * @param credential - The credential to use when connecting
     * @param options - The client options
     */
    constructor(credential: WebPubSubClientCredential, options?: WebPubSubClientOptions);
    /**
     * Start to start to the service.
     */
    start(): Promise<void>;
    private _startFromRestarting;
    private _startCore;
    /**
     * Stop the client.
     */
    stop(): void;
    /**
     * Add handler for connected event
     * @param event - The event name
     * @param listener - The handler
     */
    on(event: "connected", listener: (e: OnConnectedArgs) => void): void;
    /**
     * Add handler for disconnected event
     * @param event - The event name
     * @param listener - The handler
     */
    on(event: "disconnected", listener: (e: OnDisconnectedArgs) => void): void;
    /**
     * Add handler for stopped event
     * @param event - The event name
     * @param listener - The handler
     */
    on(event: "stopped", listener: (e: OnStoppedArgs) => void): void;
    /**
     * Add handler for server messages
     * @param event - The event name
     * @param listener - The handler
     */
    on(event: "server-message", listener: (e: OnServerDataMessageArgs) => void): void;
    /**
     * Add handler for group messags
     * @param event - The event name
     * @param listener - The handler
     */
    on(event: "group-message", listener: (e: OnGroupDataMessageArgs) => void): void;
    /**
     * Add handler for rejoining group failed
     * @param event - The event name
     * @param listener - The handler
     */
    on(event: "rejoin-group-failed", listener: (e: OnRejoinGroupFailedArgs) => void): void;
    /**
     * Remove handler for connected event
     * @param event - The event name
     * @param listener - The handler
     */
    off(event: "connected", listener: (e: OnConnectedArgs) => void): void;
    /**
     * Remove handler for disconnected event
     * @param event - The event name
     * @param listener - The handler
     */
    off(event: "disconnected", listener: (e: OnDisconnectedArgs) => void): void;
    /**
     * Remove handler for stopped event
     * @param event - The event name
     * @param listener - The handler
     */
    off(event: "stopped", listener: (e: OnStoppedArgs) => void): void;
    /**
     * Remove handler for server message
     * @param event - The event name
     * @param listener - The handler
     */
    off(event: "server-message", listener: (e: OnServerDataMessageArgs) => void): void;
    /**
     * Remove handler for group message
     * @param event - The event name
     * @param listener - The handler
     */
    off(event: "group-message", listener: (e: OnGroupDataMessageArgs) => void): void;
    /**
     * Remove handler for rejoining group failed
     * @param event - The event name
     * @param listener - The handler
     */
    off(event: "rejoin-group-failed", listener: (e: OnRejoinGroupFailedArgs) => void): void;
    private _emitEvent;
    /**
     * Send custom event to server.
     * @param eventName - The event name
     * @param content - The data content
     * @param dataType - The data type
     * @param options - The options
     */
    sendEvent(eventName: string, content: JSONTypes | ArrayBuffer, dataType: WebPubSubDataType, options?: SendEventOptions): Promise<WebPubSubResult>;
    private _sendEventAttempt;
    /**
     * Join the client to group
     * @param groupName - The group name
     * @param options - The join group options
     */
    joinGroup(groupName: string, options?: JoinGroupOptions): Promise<WebPubSubResult>;
    private _joinGroupAttempt;
    private _joinGroupCore;
    /**
     * Leave the client from group
     * @param groupName - The group name
     * @param ackId - The optional ackId. If not specified, client will generate one.
     */
    leaveGroup(groupName: string, options?: LeaveGroupOptions): Promise<WebPubSubResult>;
    private _leaveGroupAttempt;
    /**
     * Send message to group.
     * @param groupName - The group name
     * @param content - The data content
     * @param dataType - The data type
     * @param options - The options
     */
    sendToGroup(groupName: string, content: JSONTypes | ArrayBuffer, dataType: WebPubSubDataType, options?: SendToGroupOptions): Promise<WebPubSubResult>;
    private _sendToGroupAttempt;
    private _getWebSocketClientFactory;
    private _connectCore;
    private _handleConnectionCloseAndNoRecovery;
    private _autoReconnect;
    private _handleConnectionStopped;
    private _sendMessage;
    private _sendMessageWithAckId;
    private _handleConnectionClose;
    private _safeEmitConnected;
    private _safeEmitDisconnected;
    private _safeEmitGroupMessage;
    private _safeEmitServerMessage;
    private _safeEmitStopped;
    private _safeEmitRejoinGroupFailed;
    private _buildDefaultOptions;
    private _buildMessageRetryOptions;
    private _buildReconnectRetryOptions;
    private _buildRecoveryUri;
    private _getOrAddGroup;
    private _changeState;
    private _operationExecuteWithRetry;
}

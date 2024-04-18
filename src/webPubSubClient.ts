// Original source license:
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// This file has been modified:
// - Removed logger
// - Removed Abort logic as it doesn't work in most webworker implementations in browsers
import EventEmitter from "events";
import { SendMessageError, SendMessageErrorOptions } from "./errors";
import {
  WebPubSubResult,
  JoinGroupOptions,
  LeaveGroupOptions,
  OnConnectedArgs,
  OnDisconnectedArgs,
  OnGroupDataMessageArgs,
  OnServerDataMessageArgs,
  OnStoppedArgs,
  WebPubSubRetryOptions,
  SendToGroupOptions,
  SendEventOptions,
  WebPubSubClientOptions,
  OnRejoinGroupFailedArgs,
} from "./models";
import {
  ConnectedMessage,
  DisconnectedMessage,
  GroupDataMessage,
  ServerDataMessage,
  WebPubSubDataType,
  WebPubSubMessage,
  JoinGroupMessage,
  LeaveGroupMessage,
  SendToGroupMessage,
  SendEventMessage,
  AckMessage,
  SequenceAckMessage,
} from "./models/messages";
import { WebPubSubClientProtocol, WebPubSubJsonReliableProtocol } from "./protocols";
import { WebPubSubClientCredential } from "./webPubSubClientCredential";
import { WebSocketClientFactory, WebSocketClient } from "./websocket/webSocketClient";

enum WebPubSubClientState {
  Stopped = "Stopped",
  Disconnected = "Disconnected",
  Connecting = "Connecting",
  Connected = "Connected",
  Recovering = "Recovering",
}

const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

}

/**
 * Types which can be serialized and sent as JSON.
 */
export type JSONTypes = string | number | boolean | object;

/**
 * The WebPubSub client
 */
export class WebPubSubClient {
  private readonly _protocol: WebPubSubClientProtocol;
  private readonly _credential: WebPubSubClientCredential;
  private readonly _options: WebPubSubClientOptions;
  private readonly _groupMap: Map<string, WebPubSubGroup>;
  private readonly _ackMap: Map<number, AckEntity>;
  private readonly _sequenceId: SequenceId;
  private readonly _messageRetryPolicy: RetryPolicy;
  private readonly _reconnectRetryPolicy: RetryPolicy;

  private readonly _emitter: EventEmitter = new EventEmitter();
  private _state: WebPubSubClientState;
  private _isStopping: boolean = false;
  private _ackId: number;

  // connection lifetime
  private _wsClient?: WebSocketClient;
  private _uri?: string;
  private _lastCloseEvent?: { code: number; reason: string };
  private _lastDisconnectedMessage?: DisconnectedMessage;
  private _connectionId?: string;
  private _reconnectionToken?: string;
  private _isInitialConnected = false;

  private nextAckId(): number {
    this._ackId = this._ackId + 1;
    return this._ackId;
  }

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
  constructor(credential: string | WebPubSubClientCredential, options?: WebPubSubClientOptions) {
    if (typeof credential === "string") {
      this._credential = { getClientAccessUrl: credential } as WebPubSubClientCredential;
    } else {
      this._credential = credential;
    }

    if (options == null) {
      options = {};
    }
    this._buildDefaultOptions(options);
    this._options = options;

    this._messageRetryPolicy = new RetryPolicy(this._options.messageRetryOptions!);
    this._reconnectRetryPolicy = new RetryPolicy(this._options.reconnectRetryOptions!);

    this._protocol = this._options.protocol!;
    this._groupMap = new Map<string, WebPubSubGroup>();
    this._ackMap = new Map<number, AckEntity>();
    this._sequenceId = new SequenceId();

    this._state = WebPubSubClientState.Stopped;
    this._ackId = 0;
  }

  /**
   * Start to start to the service.
   */
  public async start(): Promise<void> {
    if (this._isStopping) {
      throw new Error("Can't start a client during stopping");
    }

    if (this._state !== WebPubSubClientState.Stopped) {
      throw new Error("Client can be only started when it's Stopped");
    }

    try {
      await this._startCore();
    } catch (err) {
      // this two sentense should be set together. Consider client.stop() is called during _startCore()
      this._changeState(WebPubSubClientState.Stopped);
      this._isStopping = false;
      throw err;
    }
  }

  private async _startFromRestarting(): Promise<void> {
    if (this._state !== WebPubSubClientState.Disconnected) {
      throw new Error("Client can be only restarted when it's Disconnected");
    }

    try {
      await this._startCore();
    } catch (err) {
      this._changeState(WebPubSubClientState.Disconnected);
      throw err;
    }
  }

  private async _startCore(): Promise<void> {
    this._changeState(WebPubSubClientState.Connecting);

    // Reset before a pure new connection
    this._sequenceId.reset();
    this._isInitialConnected = false;
    this._lastCloseEvent = undefined;
    this._lastDisconnectedMessage = undefined;
    this._connectionId = undefined;
    this._reconnectionToken = undefined;
    this._uri = undefined;

    if (typeof this._credential.getClientAccessUrl === "string") {
      this._uri = this._credential.getClientAccessUrl;
    } else {
      this._uri = await this._credential.getClientAccessUrl();
    }

    if (typeof this._uri !== "string") {
      throw new Error(
        `The clientAccessUrl must be a string but currently it's ${typeof this._uri}`,
      );
    }
    await this._connectCore(this._uri);
  }

  /**
   * Stop the client.
   */
  public stop(): void {
    if (this._state === WebPubSubClientState.Stopped || this._isStopping) {
      return;
    }

    // TODO: Maybe we need a better logic for stopping control
    this._isStopping = true;
    if (this._wsClient && this._wsClient.isOpen()) {
      this._wsClient.close();
    } else {
      this._isStopping = false;
    }
  }

  /**
   * Add handler for connected event
   * @param event - The event name
   * @param listener - The handler
   */
  public on(event: "connected", listener: (e: OnConnectedArgs) => void): void;
  /**
   * Add handler for disconnected event
   * @param event - The event name
   * @param listener - The handler
   */
  public on(event: "disconnected", listener: (e: OnDisconnectedArgs) => void): void;
  /**
   * Add handler for stopped event
   * @param event - The event name
   * @param listener - The handler
   */
  public on(event: "stopped", listener: (e: OnStoppedArgs) => void): void;
  /**
   * Add handler for server messages
   * @param event - The event name
   * @param listener - The handler
   */
  public on(event: "server-message", listener: (e: OnServerDataMessageArgs) => void): void;
  /**
   * Add handler for group messags
   * @param event - The event name
   * @param listener - The handler
   */
  public on(event: "group-message", listener: (e: OnGroupDataMessageArgs) => void): void;
  /**
   * Add handler for rejoining group failed
   * @param event - The event name
   * @param listener - The handler
   */
  public on(event: "rejoin-group-failed", listener: (e: OnRejoinGroupFailedArgs) => void): void;
  public on(
    event:
      | "connected"
      | "disconnected"
      | "stopped"
      | "server-message"
      | "group-message"
      | "rejoin-group-failed",
    listener: (e: any) => void,
  ): void {
    this._emitter.on(event, listener);
  }

  /**
   * Remove handler for connected event
   * @param event - The event name
   * @param listener - The handler
   */
  public off(event: "connected", listener: (e: OnConnectedArgs) => void): void;
  /**
   * Remove handler for disconnected event
   * @param event - The event name
   * @param listener - The handler
   */
  public off(event: "disconnected", listener: (e: OnDisconnectedArgs) => void): void;
  /**
   * Remove handler for stopped event
   * @param event - The event name
   * @param listener - The handler
   */
  public off(event: "stopped", listener: (e: OnStoppedArgs) => void): void;
  /**
   * Remove handler for server message
   * @param event - The event name
   * @param listener - The handler
   */
  public off(event: "server-message", listener: (e: OnServerDataMessageArgs) => void): void;
  /**
   * Remove handler for group message
   * @param event - The event name
   * @param listener - The handler
   */
  public off(event: "group-message", listener: (e: OnGroupDataMessageArgs) => void): void;
  /**
   * Remove handler for rejoining group failed
   * @param event - The event name
   * @param listener - The handler
   */
  public off(event: "rejoin-group-failed", listener: (e: OnRejoinGroupFailedArgs) => void): void;
  public off(
    event:
      | "connected"
      | "disconnected"
      | "stopped"
      | "server-message"
      | "group-message"
      | "rejoin-group-failed",
    listener: (e: any) => void,
  ): void {
    this._emitter.removeListener(event, listener);
  }

  private _emitEvent(event: "connected", args: OnConnectedArgs): void;
  private _emitEvent(event: "disconnected", args: OnDisconnectedArgs): void;
  private _emitEvent(event: "stopped", args: OnStoppedArgs): void;
  private _emitEvent(event: "server-message", args: OnServerDataMessageArgs): void;
  private _emitEvent(event: "group-message", args: OnGroupDataMessageArgs): void;
  private _emitEvent(event: "rejoin-group-failed", args: OnRejoinGroupFailedArgs): void;
  private _emitEvent(
    event:
      | "connected"
      | "disconnected"
      | "stopped"
      | "server-message"
      | "group-message"
      | "rejoin-group-failed",
    args: any,
  ): void {
    this._emitter.emit(event, args);
  }

  /**
   * Send custom event to server.
   * @param eventName - The event name
   * @param content - The data content
   * @param dataType - The data type
   * @param options - The options
   */
  public async sendEvent(
    eventName: string,
    content: JSONTypes | ArrayBuffer,
    dataType: WebPubSubDataType,
    options?: SendEventOptions,
  ): Promise<WebPubSubResult> {
    return await this._operationExecuteWithRetry(
      () => this._sendEventAttempt(eventName, content, dataType, options),
    );
  }

  private async _sendEventAttempt(
    eventName: string,
    content: JSONTypes | ArrayBuffer,
    dataType: WebPubSubDataType,
    options?: SendEventOptions,
  ): Promise<WebPubSubResult> {
    const fireAndForget = options?.fireAndForget ?? false;
    if (!fireAndForget) {
      return await this._sendMessageWithAckId(
        (id) => {
          return {
            kind: "sendEvent",
            dataType: dataType,
            data: content,
            ackId: id,
            event: eventName,
          } as SendEventMessage;
        },
        options?.ackId,
      );
    }

    const message = {
      kind: "sendEvent",
      dataType: dataType,
      data: content,
      event: eventName,
    } as SendEventMessage;

    await this._sendMessage(message);
    return { isDuplicated: false };
  }

  /**
   * Join the client to group
   * @param groupName - The group name
   * @param options - The join group options
   */
  public async joinGroup(groupName: string, options?: JoinGroupOptions): Promise<WebPubSubResult> {
    return await this._operationExecuteWithRetry(
      () => this._joinGroupAttempt(groupName, options),
    );
  }

  private async _joinGroupAttempt(
    groupName: string,
    options?: JoinGroupOptions,
  ): Promise<WebPubSubResult> {
    const group = this._getOrAddGroup(groupName);
    const result = await this._joinGroupCore(groupName, options);
    group.isJoined = true;
    return result;
  }

  private async _joinGroupCore(
    groupName: string,
    options?: JoinGroupOptions,
  ): Promise<WebPubSubResult> {
    return await this._sendMessageWithAckId(
      (id) => {
        return {
          group: groupName,
          ackId: id,
          kind: "joinGroup",
        } as JoinGroupMessage;
      },
      options?.ackId,
    );
  }

  /**
   * Leave the client from group
   * @param groupName - The group name
   * @param ackId - The optional ackId. If not specified, client will generate one.
   */
  public async leaveGroup(
    groupName: string,
    options?: LeaveGroupOptions,
  ): Promise<WebPubSubResult> {
    return await this._operationExecuteWithRetry(
      () => this._leaveGroupAttempt(groupName, options),
    );
  }

  private async _leaveGroupAttempt(
    groupName: string,
    options?: LeaveGroupOptions,
  ): Promise<WebPubSubResult> {
    const group = this._getOrAddGroup(groupName);
    const result = await this._sendMessageWithAckId(
      (id) => {
        return {
          group: groupName,
          ackId: id,
          kind: "leaveGroup",
        } as LeaveGroupMessage;
      },
      options?.ackId,
    );
    group.isJoined = false;
    return result;
  }

  /**
   * Send message to group.
   * @param groupName - The group name
   * @param content - The data content
   * @param dataType - The data type
   * @param options - The options
   */
  public async sendToGroup(
    groupName: string,
    content: JSONTypes | ArrayBuffer,
    dataType: WebPubSubDataType,
    options?: SendToGroupOptions,
  ): Promise<WebPubSubResult> {
    return await this._operationExecuteWithRetry(
      () => this._sendToGroupAttempt(groupName, content, dataType, options),
    );
  }

  private async _sendToGroupAttempt(
    groupName: string,
    content: JSONTypes | ArrayBuffer,
    dataType: WebPubSubDataType,
    options?: SendToGroupOptions,
  ): Promise<WebPubSubResult> {
    const fireAndForget = options?.fireAndForget ?? false;
    const noEcho = options?.noEcho ?? false;
    if (!fireAndForget) {
      return await this._sendMessageWithAckId(
        (id) => {
          return {
            kind: "sendToGroup",
            group: groupName,
            dataType: dataType,
            data: content,
            ackId: id,
            noEcho: noEcho,
          } as SendToGroupMessage;
        },
        options?.ackId,
      );
    }

    const message = {
      kind: "sendToGroup",
      group: groupName,
      dataType: dataType,
      data: content,
      noEcho: noEcho,
    } as SendToGroupMessage;

    await this._sendMessage(message);
    return { isDuplicated: false };
  }

  private _getWebSocketClientFactory(): WebSocketClientFactory {
    return new WebSocketClientFactory();
  }

  private _connectCore(uri: string): Promise<void> {
    if (this._isStopping) {
      throw new Error("Can't start a client during stopping");
    }

    return new Promise<void>((resolve, reject) => {
      // This part is executed sync
      const client = (this._wsClient = this._getWebSocketClientFactory().create(
        uri,
        this._protocol.name,
      ));
      client.onopen(() => {
        // There's a case that client called stop() before this method. We need to check and close it if it's the case.
        if (this._isStopping) {
          try {
            client.close();
          } catch {}

          reject(new Error(`The client is stopped`));
        }
        this._changeState(WebPubSubClientState.Connected);
        if (this._protocol.isReliableSubProtocol) {
          async () => {
            const [isUpdated, seqId] = this._sequenceId.tryGetSequenceId();
            if (isUpdated) {
              const message: SequenceAckMessage = {
                kind: "sequenceAck",
                sequenceId: seqId!,
              };
              await this._sendMessage(message);
            }
        }

        resolve();
    }});

      client.onerror((e) => {
        reject(e);
      });

      client.onclose((code: number, reason: string) => {
        if (this._state === WebPubSubClientState.Connected) {
          this._lastCloseEvent = { code: code, reason: reason };
          this._handleConnectionClose.call(this);
        } else {
          reject(new Error(`Failed to start WebSocket: ${code}`));
        }
      });

      client.onmessage((data: any) => {
        const handleAckMessage = (message: AckMessage): void => {
          if (this._ackMap.has(message.ackId)) {
            const entity = this._ackMap.get(message.ackId)!;
            this._ackMap.delete(message.ackId);
            const isDuplicated: boolean =
              message.error != null && message.error.name === "Duplicate";
            if (message.success || isDuplicated) {
              entity.resolve({
                ackId: message.ackId,
                isDuplicated: isDuplicated,
              } as WebPubSubResult);
            } else {
              entity.reject(
                new SendMessageError("Failed to send message.", {
                  ackId: message.ackId,
                  errorDetail: message.error,
                } as SendMessageErrorOptions),
              );
            }
          }
        };

        const handleConnectedMessage = async (message: ConnectedMessage): Promise<void> => {
          this._connectionId = message.connectionId;
          this._reconnectionToken = message.reconnectionToken;

          if (!this._isInitialConnected) {
            this._isInitialConnected = true;

            if (this._options.autoRejoinGroups) {
              const groupPromises: Promise<void>[] = [];
              this._groupMap.forEach((g) => {
                if (g.isJoined) {
                  groupPromises.push(
                    (async () => {
                      try {
                        await this._joinGroupCore(g.name);
                      } catch (err) {
                        this._safeEmitRejoinGroupFailed(g.name, err);
                      }
                    })(),
                  );
                }
              });

              try {
                await Promise.all(groupPromises);
              } catch {}
            }

            this._safeEmitConnected(message.connectionId, message.userId);
          }
        };

        const handleDisconnectedMessage = (message: DisconnectedMessage): void => {
          this._lastDisconnectedMessage = message;
        };

        const handleGroupDataMessage = (message: GroupDataMessage): void => {
          if (message.sequenceId != null) {
            if (!this._sequenceId.tryUpdate(message.sequenceId)) {
              // drop duplicated message
              return;
            }
          }

          this._safeEmitGroupMessage(message);
        };

        const handleServerDataMessage = (message: ServerDataMessage): void => {
          if (message.sequenceId != null) {
            if (!this._sequenceId.tryUpdate(message.sequenceId)) {
              // drop duplicated message
              return;
            }
          }

          this._safeEmitServerMessage(message);
        };

        let messages: WebPubSubMessage[] | WebPubSubMessage | null;
        try {
          let convertedData: Buffer | ArrayBuffer | string;
          if (Array.isArray(data)) {
            convertedData = Buffer.concat(data);
          } else {
            convertedData = data;
          }

          messages = this._protocol.parseMessages(convertedData);
          if (messages === null) {
            // null means the message is not recognized.
            return;
          }
        } catch (err) {
          throw err;
        }

        if (!Array.isArray(messages)) {
          messages = [messages];
        }

        messages.forEach((message) => {
          try {
            switch (message.kind) {
              case "ack": {
                handleAckMessage(message as AckMessage);
                break;
              }
              case "connected": {
                handleConnectedMessage(message as ConnectedMessage);
                break;
              }
              case "disconnected": {
                handleDisconnectedMessage(message as DisconnectedMessage);
                break;
              }
              case "groupData": {
                handleGroupDataMessage(message as GroupDataMessage);
                break;
              }
              case "serverData": {
                handleServerDataMessage(message as ServerDataMessage);
                break;
              }
            }
          } catch (err) {
            /*logger.warning(
              `An error occurred while handling the message with kind: ${message.kind} from service`,
              err,
            );*/
          }
        });
      });
    });
  }

  private async _handleConnectionCloseAndNoRecovery(): Promise<void> {
    this._state = WebPubSubClientState.Disconnected;

    this._safeEmitDisconnected(this._connectionId, this._lastDisconnectedMessage);

    // Auto reconnect or stop
    if (this._options.autoReconnect) {
      await this._autoReconnect();
    } else {
      await this._handleConnectionStopped();
    }
  }

  private async _autoReconnect(): Promise<void> {
    let isSuccess = false;
    let attempt = 0;
    try {
      while (!this._isStopping) {
        try {
          await this._startFromRestarting();
          isSuccess = true;
          break;
        } catch (err) {
          attempt++;
          const delayInMs = this._reconnectRetryPolicy.nextRetryDelayInMs(attempt);

          if (delayInMs == null) {
            break;
          }

          try {
            await delay(delayInMs);
          } catch {}
        }
      }
    } finally {
      if (!isSuccess) {
        this._handleConnectionStopped();
      }
    }
  }

  private _handleConnectionStopped(): void {
    this._isStopping = false;
    this._state = WebPubSubClientState.Stopped;
    this._safeEmitStopped();
  }

  private async _sendMessage(
    message: WebPubSubMessage,
  ): Promise<void> {
    const payload = this._protocol.writeMessage(message);

    if (!this._wsClient || !this._wsClient.isOpen()) {
      throw new Error("The connection is not connected.");
    }
    await this._wsClient!.send(payload);
  }

  private async _sendMessageWithAckId(
    messageProvider: (ackId: number) => WebPubSubMessage,
    ackId?: number,
  ): Promise<WebPubSubResult> {
    if (ackId == null) {
      ackId = this.nextAckId();
    }

    const message = messageProvider(ackId);
    if (!this._ackMap.has(ackId)) {
      this._ackMap.set(ackId, new AckEntity(ackId));
    }
    const entity = this._ackMap.get(ackId)!;

    try {
      await this._sendMessage(message);
    } catch (error) {
      this._ackMap.delete(ackId);

      let errorMessage: string = "";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      throw new SendMessageError(errorMessage, { ackId: ackId });
    }
    return await entity.promise();
  }

  private async _handleConnectionClose(): Promise<void> {
    // Clean ack cache
    this._ackMap.forEach((value, key) => {
      if (this._ackMap.delete(key)) {
        value.reject(
          new SendMessageError("Connection is disconnected before receive ack from the service", {
            ackId: value.ackId,
          } as SendMessageErrorOptions),
        );
      }
    });

    if (this._isStopping) {
      this._handleConnectionCloseAndNoRecovery();
      return;
    }

    if (this._lastCloseEvent && this._lastCloseEvent.code === 1008) {
      this._handleConnectionCloseAndNoRecovery();
      return;
    }

    if (!this._protocol.isReliableSubProtocol) {
      this._handleConnectionCloseAndNoRecovery();
      return;
    }

    // Build recovery uri
    const recoveryUri = this._buildRecoveryUri();
    if (!recoveryUri) {
      this._handleConnectionCloseAndNoRecovery();
      return;
    }

    // Try recover connection
    let recovered = false;
    this._state = WebPubSubClientState.Recovering;
    try {
      while (this._isStopping) {
        try {
          await this._connectCore.call(this, recoveryUri);
          recovered = true;
          return;
        } catch {
          await delay(1000);
        }
      }
    } finally {
      if (!recovered) {
        this._handleConnectionCloseAndNoRecovery();
      }
    }
  }

  private _safeEmitConnected(connectionId: string, userId: string): void {
    this._emitEvent("connected", {
      connectionId: connectionId,
      userId: userId,
    } as OnConnectedArgs);
  }

  private _safeEmitDisconnected(
    connectionId: string | undefined,
    lastDisconnectedMessage: DisconnectedMessage | undefined,
  ): void {
    this._emitEvent("disconnected", {
      connectionId: connectionId,
      message: lastDisconnectedMessage,
    } as OnDisconnectedArgs);
  }

  private _safeEmitGroupMessage(message: GroupDataMessage): void {
    this._emitEvent("group-message", {
      message: message,
    } as OnGroupDataMessageArgs);
  }

  private _safeEmitServerMessage(message: ServerDataMessage): void {
    this._emitEvent("server-message", {
      message: message,
    } as OnServerDataMessageArgs);
  }

  private _safeEmitStopped(): void {
    this._emitEvent("stopped", {});
  }

  private _safeEmitRejoinGroupFailed(groupName: string, err: unknown): void {
    this._emitEvent("rejoin-group-failed", {
      group: groupName,
      error: err,
    } as OnRejoinGroupFailedArgs);
  }

  private _buildDefaultOptions(clientOptions: WebPubSubClientOptions): WebPubSubClientOptions {
    if (clientOptions.autoReconnect == null) {
      clientOptions.autoReconnect = true;
    }

    if (clientOptions.autoRejoinGroups == null) {
      clientOptions.autoRejoinGroups = true;
    }

    if (clientOptions.protocol == null) {
      clientOptions.protocol = WebPubSubJsonReliableProtocol();
    }

    this._buildMessageRetryOptions(clientOptions);
    this._buildReconnectRetryOptions(clientOptions);

    return clientOptions;
  }

  private _buildMessageRetryOptions(clientOptions: WebPubSubClientOptions): void {
    if (!clientOptions.messageRetryOptions) {
      clientOptions.messageRetryOptions = {};
    }

    if (
      clientOptions.messageRetryOptions.maxRetries == null ||
      clientOptions.messageRetryOptions.maxRetries < 0
    ) {
      clientOptions.messageRetryOptions.maxRetries = 3;
    }

    if (
      clientOptions.messageRetryOptions.retryDelayInMs == null ||
      clientOptions.messageRetryOptions.retryDelayInMs < 0
    ) {
      clientOptions.messageRetryOptions.retryDelayInMs = 1000;
    }

    if (
      clientOptions.messageRetryOptions.maxRetryDelayInMs == null ||
      clientOptions.messageRetryOptions.maxRetryDelayInMs < 0
    ) {
      clientOptions.messageRetryOptions.maxRetryDelayInMs = 30000;
    }

    if (clientOptions.messageRetryOptions.mode == null) {
      clientOptions.messageRetryOptions.mode = "Fixed";
    }
  }

  private _buildReconnectRetryOptions(clientOptions: WebPubSubClientOptions): void {
    if (!clientOptions.reconnectRetryOptions) {
      clientOptions.reconnectRetryOptions = {};
    }

    if (
      clientOptions.reconnectRetryOptions.maxRetries == null ||
      clientOptions.reconnectRetryOptions.maxRetries < 0
    ) {
      clientOptions.reconnectRetryOptions.maxRetries = Number.MAX_VALUE;
    }

    if (
      clientOptions.reconnectRetryOptions.retryDelayInMs == null ||
      clientOptions.reconnectRetryOptions.retryDelayInMs < 0
    ) {
      clientOptions.reconnectRetryOptions.retryDelayInMs = 1000;
    }

    if (
      clientOptions.reconnectRetryOptions.maxRetryDelayInMs == null ||
      clientOptions.reconnectRetryOptions.maxRetryDelayInMs < 0
    ) {
      clientOptions.reconnectRetryOptions.maxRetryDelayInMs = 30000;
    }

    if (clientOptions.reconnectRetryOptions.mode == null) {
      clientOptions.reconnectRetryOptions.mode = "Fixed";
    }
  }

  private _buildRecoveryUri(): string | null {
    if (this._connectionId && this._reconnectionToken && this._uri) {
      const url = new URL(this._uri);
      url.searchParams.append("awps_connection_id", this._connectionId);
      url.searchParams.append("awps_reconnection_token", this._reconnectionToken);
      return url.toString();
    }
    return null;
  }

  private _getOrAddGroup(name: string): WebPubSubGroup {
    if (!this._groupMap.has(name)) {
      this._groupMap.set(name, new WebPubSubGroup(name));
    }
    return this._groupMap.get(name) as WebPubSubGroup;
  }

  private _changeState(newState: WebPubSubClientState): void {
    this._state = newState;
  }

  private async _operationExecuteWithRetry<T>(
    inner: () => Promise<T>,
  ): Promise<T> {
    let retryAttempt = 0;

    while (true) {
      try {
        return await inner.call(this);
      } catch (err) {
        retryAttempt++;
        const delayInMs = this._messageRetryPolicy.nextRetryDelayInMs(retryAttempt);
        if (delayInMs == null) {
          throw err;
        }

        await delay(delayInMs);
      }
    }
  }
}

class RetryPolicy {
  private _retryOptions: WebPubSubRetryOptions;
  private _maxRetriesToGetMaxDelay: number;

  public constructor(retryOptions: WebPubSubRetryOptions) {
    this._retryOptions = retryOptions;
    this._maxRetriesToGetMaxDelay = Math.ceil(
      Math.log2(this._retryOptions.maxRetryDelayInMs!) -
        Math.log2(this._retryOptions.retryDelayInMs!) +
        1,
    );
  }

  public nextRetryDelayInMs(retryAttempt: number): number | null {
    if (retryAttempt > this._retryOptions.maxRetries!) {
      return null;
    } else {
      if (this._retryOptions.mode! === "Fixed") {
        return this._retryOptions.retryDelayInMs!;
      } else {
        return this._calculateExponentialDelay(retryAttempt);
      }
    }
  }

  private _calculateExponentialDelay(attempt: number): number {
    if (attempt >= this._maxRetriesToGetMaxDelay) {
      return this._retryOptions.maxRetryDelayInMs!;
    } else {
      return (1 << (attempt - 1)) * this._retryOptions.retryDelayInMs!;
    }
  }
}

class WebPubSubGroup {
  public readonly name: string;
  public isJoined = false;

  constructor(name: string) {
    this.name = name;
  }
}

class AckEntity {
  private readonly _promise: Promise<WebPubSubResult>;
  private _resolve?: (value: WebPubSubResult | PromiseLike<WebPubSubResult>) => void;
  private _reject?: (reason?: any) => void;

  constructor(ackId: number) {
    this._promise = new Promise<WebPubSubResult>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.ackId = ackId;
  }

  public ackId;

  public promise(): Promise<WebPubSubResult> {
    return this._promise;
  }

  public resolve(value: WebPubSubResult | PromiseLike<WebPubSubResult>): void {
    this._resolve!(value);
  }

  public reject(reason?: any): void {
    this._reject!(reason);
  }
}

class SequenceId {
  private _sequenceId: number;
  private _isUpdate: boolean;

  constructor() {
    this._sequenceId = 0;
    this._isUpdate = false;
  }

  public tryUpdate(sequenceId: number): boolean {
    this._isUpdate = true;
    if (sequenceId > this._sequenceId) {
      this._sequenceId = sequenceId;
      return true;
    }
    return false;
  }

  public tryGetSequenceId(): [boolean, number | null] {
    if (this._isUpdate) {
      this._isUpdate = false;
      return [true, this._sequenceId];
    }

    return [false, null];
  }

  public reset(): void {
    this._sequenceId = 0;
    this._isUpdate = false;
  }
}

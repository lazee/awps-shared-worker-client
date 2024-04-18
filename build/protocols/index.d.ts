/// <reference types="node" />
import { WebPubSubMessage } from "../models/messages";
/**
 * The interface to be implemented for a web pubsub subprotocol
 */
export interface WebPubSubClientProtocol {
    /**
     * The name of subprotocol. Name will be used in websocket subprotocol
     */
    readonly name: string;
    /**
     * True if the protocol supports reliable features
     */
    readonly isReliableSubProtocol: boolean;
    /**
     * Creates WebPubSubMessage objects from the specified serialized representation.
     * @param input - The serialized representation
     */
    parseMessages(input: string | ArrayBuffer | Buffer): WebPubSubMessage[] | WebPubSubMessage | null;
    /**
     * Write WebPubSubMessage to string or ArrayBuffer
     * @param message - The message to be written
     */
    writeMessage(message: WebPubSubMessage): string | ArrayBuffer;
}
/**
 * Return the "json.webpubsub.azure.v1" protocol
 */
export declare const WebPubSubJsonProtocol: () => WebPubSubClientProtocol;
/**
 * Return the "json.reliable.webpubsub.azure.v1" protocol
 */
export declare const WebPubSubJsonReliableProtocol: () => WebPubSubClientProtocol;

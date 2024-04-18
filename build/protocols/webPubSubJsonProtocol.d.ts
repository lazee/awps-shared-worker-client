import { WebPubSubClientProtocol } from ".";
import { WebPubSubMessage } from "../models/messages";
/**
 * The "json.webpubsub.azure.v1" protocol
 */
export declare class WebPubSubJsonProtocolImpl implements WebPubSubClientProtocol {
    /**
     * True if the protocol supports reliable features
     */
    readonly isReliableSubProtocol = false;
    /**
     * The name of subprotocol. Name will be used in websocket subprotocol
     */
    readonly name = "json.webpubsub.azure.v1";
    /**
     * Creates WebPubSubMessage objects from the specified serialized representation.
     * @param input - The serialized representation
     */
    parseMessages(input: string): WebPubSubMessage | null;
    /**
     * Write WebPubSubMessage to string
     * @param message - The message to be written
     */
    writeMessage(message: WebPubSubMessage): string;
}

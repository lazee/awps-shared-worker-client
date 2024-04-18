import { WebPubSubMessage } from "../models/messages";
export declare function parseMessages(input: string): WebPubSubMessage | null;
export declare function writeMessage(message: WebPubSubMessage): string;

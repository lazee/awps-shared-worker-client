import { AckMessageError } from "../models/messages";
/**
 * Error when sending message failed
 */
export declare class SendMessageError extends Error {
    /**
     * Error name
     */
    name: string;
    /**
     * The ack id of the message
     */
    ackId?: number;
    /**
     * The error details from the service
     */
    errorDetail?: AckMessageError;
    /**
     * Initialize a SendMessageError
     * @param message - The error message
     * @param ackMessage - The ack message
     */
    constructor(message: string, options: SendMessageErrorOptions);
}
export interface SendMessageErrorOptions {
    /**
     * The ack id of the message
     */
    ackId?: number;
    /**
     * The error details from the service
     */
    errorDetail?: AckMessageError;
}

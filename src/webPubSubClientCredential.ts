// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { GetClientAccessUrlOptions } from "./models";

/**
 * The WebPubSubClient credential
 */
export interface WebPubSubClientCredential {
  /**
   * Gets an `getClientAccessUrl` which is used in connecting to the service
   */
  getClientAccessUrl: string | ((options?: GetClientAccessUrlOptions) => Promise<string>);
}
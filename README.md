# awps-shared-worker-client

An Azure Web PubSub Client that works on shared workers.

## Background

The official [@azure/web-pubsub-client](https://www.npmjs.com/package/@azure/web-pubsub-client) doesn't run in web workers due to
limited AbortController support inside workers in most browsers.

We will try to get in touch with the developers at Microsoft to see if it is possible to solve the issue in the official package. But until then, we will maintain this package.

## What it is

This package is a copy of the [official web-pubsub-client](https://github.com/Azure/azure-sdk-for-js/tree/main/sdk/web-pubsub/web-pubsub-client), but where we have stripped away all abort logic.

Our focus is running the client in web workers. You should stick to the official package if you want to use the client in Node.js or outside workers in your javascript code.


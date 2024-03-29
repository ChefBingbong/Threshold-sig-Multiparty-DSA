import axios, { AxiosResponse } from "axios";
import { AppLogger } from "../http/middleware/logger";
import { Logger } from "winston";
import { tryNTimes } from "./utils/helpers";

const generatePayload = (method: string, params?: unknown) => ({
      id: 1,
      jsonrpc: "2.0",
      method,
      params,
});

export interface Provider<
      Requests extends { [event: string]: any } = {},
      Responses extends { [event: string]: any } = {}
> {
      sendMessage<Method extends keyof Requests & string>(
            method: Method,
            request: Requests[Method],
            retry?: number,
            timeout?: number
      ): Promise<Responses[Method]>;
}

export class JsonRpcProvider<
      Requests extends { [event: string]: any } = {},
      Responses extends { [event: string]: any } = {}
> implements Provider<Requests, Responses>
{
      public readonly endpointOrProvider: Provider<Requests, Responses> | string;
      public readonly logger: Logger;

      public constructor(endpointOrProvider: Provider<Requests, Responses> | string) {
            this.logger = new AppLogger().getLogger("rpc");

            if (typeof endpointOrProvider === "string" && endpointOrProvider.indexOf("://") === -1) {
                  throw new Error(`Invalid node URL without protocol: ${endpointOrProvider}.`);
            }
            this.endpointOrProvider = endpointOrProvider;
      }

      public sendMessage = async <Method extends keyof Requests & string>(
            method: Method,
            request: Requests[Method],
            retry = 2,
            timeout = 120 * 1000
      ): Promise<Responses[Method]> => {
            const endpoint = this.endpointOrProvider;
            if (typeof endpoint !== "string") {
                  return endpoint.sendMessage(method, request, retry, timeout);
            }

            const payload = generatePayload(method, request);

            this.logger.debug("[request]", JSON.stringify(payload, null, "    "));
            try {
                  const response = await tryNTimes(
                        async () =>
                              axios.post<JSONRPCResponse<Responses[Method]>>(
                                    endpoint,
                                    payload,
                                    // Use a 120 second timeout. This could be reduced, but
                                    // should be done based on the method, since some requests
                                    // may take a long time, especially on a slow connection.
                                    { timeout }
                              ),
                        retry,
                        1 * 1000
                  );
                  if (response.status !== 200) {
                        throw this.responseError(
                              `Unexpected status code ${String(response.status)} returned from node.`,
                              response
                        );
                  }
                  if (response.data.error) {
                        throw new Error(response.data.error);
                  }
                  if (response.data.result === undefined) {
                        throw new Error(`Empty result returned from node.`);
                  }
                  this.logger.debug("[response]", JSON.stringify(response.data.result, null, "    "));

                  return response.data.result;
            } catch (error: unknown) {
                  // Emit debug log of the endpoint and payload.
                  try {
                        this.logger.debug(endpoint, JSON.stringify(payload));
                  } catch (_errorInner: unknown) {
                        // Ignore.
                  }

                  // Re-throw error to avoid internal axios stack-trace.
                  throw new Error(error as any);
            }
      };

      private readonly responseError = (msg: string, response: AxiosResponse): ResponseError => {
            const error = new Error(msg) as ResponseError;
            error.response = response;
            return error;
      };
}

interface ResponseError extends Error {
      response: AxiosResponse;
}

export type JSONRPCResponse<T> =
      | {
              jsonrpc: string;
              version: string;
              result: T;
              error: undefined;
              id: number;
        }
      | {
              jsonrpc: string;
              version: string;
              result: undefined;
              error: any;
              id: number;
        };

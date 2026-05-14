import type {
  GenerateObjectRequest,
  GenerateObjectResponse,
  ProviderAdapter,
} from "./types.js";

export interface MockProviderOptions {
  id?: string;
  mode?: "api" | "cli";
  /** Static response value returned for every call. */
  response: unknown;
}

export function createMockProvider(opts: MockProviderOptions): ProviderAdapter & {
  /** Captured request history for assertions in tests. */
  history: GenerateObjectRequest[];
} {
  const history: GenerateObjectRequest[] = [];
  return {
    id: opts.id ?? "mock.fixture",
    mode: opts.mode ?? "api",
    history,
    async generateObject<T>(req: GenerateObjectRequest): Promise<GenerateObjectResponse<T>> {
      history.push(req);
      return { value: opts.response as T };
    },
  };
}

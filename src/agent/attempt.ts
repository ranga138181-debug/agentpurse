export const MODEL_TIMEOUT_MS = 3500;
export const SEARCH_TIMEOUT_MS = 2000;

export interface Deadline {
  signal: AbortSignal;
  remainingMs: () => number;
}

export class DeadlineExceeded extends Error {
  name = "DeadlineExceeded";
}

export class AttemptsExhausted extends Error {
  name = "AttemptsExhausted";

  constructor(
    readonly cause: unknown,
    readonly attempts: number,
  ) {
    super("All attempts failed");
  }
}

// Adapters may ignore the abort signal, so the call is also raced against it.
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), {
      once: true,
    });
    promise.then(resolve, reject);
  });
}

export async function withTimeout<T>(
  call: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  deadline: Deadline,
): Promise<T> {
  if (deadline.signal.aborted) throw new DeadlineExceeded();
  const signal = AbortSignal.any([
    deadline.signal,
    AbortSignal.timeout(timeoutMs),
  ]);
  try {
    return await abortable(call(signal), signal);
  } catch (error) {
    if (deadline.signal.aborted) throw new DeadlineExceeded();
    throw error;
  }
}

export async function withRetry<T>(
  call: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  deadline: Deadline,
): Promise<T> {
  for (let attempts = 1; ; attempts++) {
    try {
      return await withTimeout(call, timeoutMs, deadline);
    } catch (error) {
      if (error instanceof DeadlineExceeded) throw error;
      if (attempts === 2 || deadline.remainingMs() < timeoutMs) {
        throw new AttemptsExhausted(error, attempts);
      }
    }
  }
}

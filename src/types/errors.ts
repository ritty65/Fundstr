export type FundstrErrorCode =
  | "NDK_INIT_FAILED"
  | "NDK_SIGNER_FAILED"
  | "CASHU_NETWORK"
  | "CASHU_PARSE"
  | "WORKER_RETRYABLE"
  | "WORKER_FATAL";

export class FundstrError extends Error {
  code: FundstrErrorCode;
  retryable: boolean;

  constructor(message: string, code: FundstrErrorCode, retryable = false, cause?: unknown) {
    super(message);
    this.name = "FundstrError";
    this.code = code;
    this.retryable = retryable;
    if (cause) this.cause = cause;
  }
}

export class NetworkError extends FundstrError {
  constructor(message: string, code: FundstrErrorCode, cause?: unknown) {
    super(message, code, true, cause);
    this.name = "NetworkError";
  }
}

export class ParsingError extends FundstrError {
  constructor(message: string, code: FundstrErrorCode, cause?: unknown) {
    super(message, code, false, cause);
    this.name = "ParsingError";
  }
}

export class WorkerBoundaryError extends FundstrError {
  constructor(message: string, code: FundstrErrorCode, retryable = true, cause?: unknown) {
    super(message, code, retryable, cause);
    this.name = "WorkerBoundaryError";
  }
}

export class CashuNetworkError extends NetworkError {
  constructor(message: string, cause?: unknown) {
    super(message, "CASHU_NETWORK", cause);
    this.name = "CashuNetworkError";
  }
}

export class CashuParsingError extends ParsingError {
  constructor(message: string, cause?: unknown) {
    super(message, "CASHU_PARSE", cause);
    this.name = "CashuParsingError";
  }
}

export const toFundstrError = (err: unknown): FundstrError | null => {
  if (err instanceof FundstrError) return err;
  if (err instanceof Error) return new FundstrError(err.message, "WORKER_FATAL", false, err);
  return null;
};

export const isRetryableError = (err: unknown): boolean => {
  const typed = toFundstrError(err);
  return typed?.retryable === true;
};

import type { ApiErrorBody } from "./types.js";

export class ApiError extends Error {
  readonly body: ApiErrorBody;

  constructor(readonly status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.body = { error: { code, message } };
  }
}

export const badRequest = (code: string, message: string) => new ApiError(400, code, message);
export const unauthorized = () => new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
export const forbidden = (code = "PLAN_REQUIRED", message = "Your plan does not grant access to this resource.") =>
  new ApiError(403, code, message);
export const notFound = (code: string, message: string) => new ApiError(404, code, message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const unprocessable = (code: string, message: string) => new ApiError(422, code, message);

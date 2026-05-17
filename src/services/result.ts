export interface OperationResult<T = void> {
  ok: boolean;
  data?: T;
  message: string;
  errors?: Array<{ target: string; error: string }>;
}

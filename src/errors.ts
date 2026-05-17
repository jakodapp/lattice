export type CcmErrorCode =
  | 'SCAN_FAILED'
  | 'COPY_FAILED'
  | 'MOVE_FAILED'
  | 'DELETE_FAILED'
  | 'FILE_NOT_FOUND'
  | 'PATH_OUTSIDE_ROOTS'
  | 'SYMLINK_FAILED'
  | 'CLONE_FAILED'
  | 'IMPORT_FAILED'
  | 'CONVERT_FAILED'
  | 'MISSING_COPY_FN';

export class CcmError extends Error {
  constructor(
    message: string,
    public readonly code: CcmErrorCode,
    public readonly context?: Record<string, string>,
  ) {
    super(message);
    this.name = 'CcmError';
  }
}

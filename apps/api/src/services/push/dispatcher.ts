export interface PushMessage {
  token: string;
  /** Data-only payload; values must be strings. Opaque ids/versions only. */
  data: Record<string, string>;
}
export type PushResult =
  | { ok: true }
  | { ok: false; retryable: boolean; tokenInvalid?: boolean; code: string };

export interface PushDispatcher {
  readonly enabled: boolean;
  send(message: PushMessage): Promise<PushResult>;
}

export class NoopPushDispatcher implements PushDispatcher {
  readonly enabled = false;
  async send(): Promise<PushResult> {
    return { ok: true };
  }
}

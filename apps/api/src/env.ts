/// <reference types="@cloudflare/workers-types" />
import type { Services } from './services';
import type { CaregiverActor, DeviceActor } from './lib/actors';

export interface Env {
  DB: D1Database;
  ENVIRONMENT?: string;
  /** Comma-separated browser origins allowed by CORS. Empty/unset = no CORS headers. */
  ALLOWED_ORIGINS?: string;
  /** Secrets (wrangler secret put). Never put these in wrangler.jsonc. */
  JWT_SECRET?: string;
  PAIRING_PEPPER?: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  /** Optional tuning (vars). */
  ACCESS_TOKEN_TTL_SECONDS?: string;
  PASSWORD_HASH_ITERATIONS?: string;
  /** Shown on the public /privacy and /delete-account pages. */
  SUPPORT_EMAIL?: string;
  OPERATOR_NAME?: string;
}

export type AppContext = {
  Bindings: Env;
  Variables: {
    requestId: string;
    svc: Services;
    caregiver?: CaregiverActor;
    device?: DeviceActor;
    relationship?: import('./repos/relationships').CaregiverRelationshipRow;
  };
};

import type {
  PlanSnapshotV2,
  DevicePlanReport,
  RelationshipSummary,
  PatientRelationship,
  PlanCommandState,
  PermissionKey,
} from '@medchain/contracts';

// react-native / expo-constants are loaded lazily so this module also runs under Bun tests and headless tasks
function platformOS(): string {
  try {
    return require('react-native').Platform.OS;
  } catch {
    return 'android';
  }
}
function expoExtra(): any {
  try {
    return require('expo-constants').default?.expoConfig?.extra;
  } catch {
    return undefined;
  }
}

export type FetchFunction = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

// ---------------------------------------------------------------------------
// Credentials: bearer tokens for caregivers, a device secret for patient devices.
// Secrets live in the OS keystore (expo-secure-store), never in SQLite or logs.
// ---------------------------------------------------------------------------

export interface DeviceCredential {
  deviceId: string;
  deviceSecret: string;
}

export interface CaregiverSession {
  caregiver: { id: string; email: string; displayName: string };
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface CredentialStore {
  getDevice(): Promise<DeviceCredential | null>;
  setDevice(c: DeviceCredential | null): Promise<void>;
  getCaregiver(): Promise<CaregiverSession | null>;
  setCaregiver(s: CaregiverSession | null): Promise<void>;
}

export class MemoryCredentialStore implements CredentialStore {
  private device: DeviceCredential | null = null;
  private caregiver: CaregiverSession | null = null;
  async getDevice() {
    return this.device;
  }
  async setDevice(c: DeviceCredential | null) {
    this.device = c;
  }
  async getCaregiver() {
    return this.caregiver;
  }
  async setCaregiver(s: CaregiverSession | null) {
    this.caregiver = s;
  }
}

export class SecureStoreCredentialStore implements CredentialStore {
  private async store() {
    return await import('expo-secure-store');
  }
  private async read<T>(key: string): Promise<T | null> {
    try {
      const raw = await (await this.store()).getItemAsync(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  private async write(key: string, value: unknown | null): Promise<void> {
    const s = await this.store();
    if (value === null) await s.deleteItemAsync(key);
    else await s.setItemAsync(key, JSON.stringify(value));
  }
  getDevice() {
    return this.read<DeviceCredential>('medchain.device');
  }
  setDevice(c: DeviceCredential | null) {
    return this.write('medchain.device', c);
  }
  getCaregiver() {
    return this.read<CaregiverSession>('medchain.caregiver');
  }
  setCaregiver(s: CaregiverSession | null) {
    return this.write('medchain.caregiver', s);
  }
}

// ---------------------------------------------------------------------------

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
    public retryAfterSeconds?: number,
    public fieldErrors?: Array<{ field: string; message: string }>
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get isNetwork() {
    return this.status === 0;
  }
}

/** Resolves the API base URL: EXPO_PUBLIC_API_URL, then app config `extra.apiBaseUrl`, then a dev default. */
export function resolveApiBaseUrl(): string {
  const fromEnv = (process.env as any)?.EXPO_PUBLIC_API_URL as string | undefined;
  const fromConfig = expoExtra()?.apiBaseUrl as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (fromConfig && !fromConfig.includes('.example')) return fromConfig.replace(/\/$/, '');
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return platformOS() === 'android' ? 'http://10.0.2.2:8787' : 'http://localhost:8787';
  }
  // A production build without a configured backend must say so instead of calling a made-up host.
  return '';
}

export interface ApiClientConfig {
  baseUrl?: string;
  fetchFn?: FetchFunction;
  credentials?: CredentialStore;
  timeoutMs?: number;
}

type AuthKind = 'none' | 'device' | 'caregiver';

export interface PlanStateResponse {
  latestPlanVersion: number;
  lastAppliedVersion: number;
  isApplied: boolean;
  planSnapshot: PlanSnapshotV2 | null;
  deviceReport?: (DevicePlanReport & { version?: number; reportedAt?: string }) | null;
  pendingCommand: null | { commandId: string; status: string };
}

export interface PairingSessionView {
  sessionId: string;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  incomingRequest: null | {
    requestId: string;
    status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
    caregiverDisplayName: string;
    caregiverEmail: string;
    requestedPermissions: PermissionKey[];
    requestedAt: string;
    relationshipId: string | null;
  };
}

export interface ChangesResponse {
  pendingCommands: Array<{
    commandId: string;
    relationshipId: string;
    planVersion: number;
    baseVersion: number;
    status: string;
    planSnapshot: unknown;
    createdAt: string;
  }>;
  nextCursor: string;
}

export interface DoseEventUploadItem {
  eventId: string;
  occurrenceId: string;
  medicationId: string;
  eventType: string;
  scheduledAt?: string;
  actionTimestamp: string;
  timezoneId: string;
  medicationName?: string;
  dosageText?: string;
}

export interface ActivityResponse {
  items: Array<{
    eventId: string;
    relationshipId: string;
    patientDisplayName: string;
    medicationId: string;
    medicationName: string | null;
    dosageText: string | null;
    occurrenceId: string;
    eventType: string;
    statusLabel: string;
    scheduledAt: string | null;
    actionTimestamp: string;
    timezoneId: string;
    receivedAt: string;
  }>;
  nextCursor: string | null;
}

export class ApiClient {
  private baseUrl: string;
  private fetchFn: FetchFunction;
  private creds: CredentialStore;
  private timeoutMs: number;
  private refreshing: Promise<CaregiverSession | null> | null = null;

  constructor(config: ApiClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? resolveApiBaseUrl()).replace(/\/$/, '');
    this.fetchFn = config.fetchFn || globalThis.fetch.bind(globalThis);
    this.creds = config.credentials ?? new SecureStoreCredentialStore();
    this.timeoutMs = config.timeoutMs ?? 15000;
  }

  get isConfigured(): boolean {
    return this.baseUrl.length > 0;
  }

  /** Server origin, for the public privacy and deletion pages. */
  get publicBaseUrl(): string {
    return this.baseUrl;
  }

  get credentials(): CredentialStore {
    return this.creds;
  }

  // ---- core -------------------------------------------------------------

  private async authHeader(kind: AuthKind): Promise<Record<string, string>> {
    if (kind === 'device') {
      const d = await this.creds.getDevice();
      if (!d) throw new ApiError(0, 'NO_DEVICE_CREDENTIAL', 'Family sharing is not set up on this phone.');
      return { Authorization: `Device ${d.deviceId}.${d.deviceSecret}` };
    }
    if (kind === 'caregiver') {
      const s = await this.creds.getCaregiver();
      if (!s) throw new ApiError(401, 'NOT_SIGNED_IN', 'Sign in to continue.');
      return { Authorization: `Bearer ${s.accessToken}` };
    }
    return {};
  }

  private async rawRequest(
    method: string,
    path: string,
    opts: { body?: unknown; auth: AuthKind; headers?: Record<string, string>; query?: Record<string, string | number | undefined> }
  ): Promise<Response> {
    if (!this.isConfigured) {
      throw new ApiError(0, 'API_NOT_CONFIGURED', 'The DoseSaathi server address is not configured in this build.');
    }
    let url = `${this.baseUrl}/api/v1${path}`;
    if (opts.query) {
      const qs = Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(await this.authHeader(opts.auth)),
      ...opts.headers,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, {
        method,
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err: any) {
      throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }
  }

  private async toError(res: Response): Promise<ApiError> {
    let code = 'HTTP_ERROR';
    let message = `Request failed (${res.status})`;
    let requestId: string | undefined;
    let fieldErrors: Array<{ field: string; message: string }> | undefined;
    try {
      const j: any = await res.json();
      if (j?.error) {
        code = j.error.code ?? code;
        message = j.error.message ?? message;
        requestId = j.error.requestId;
        fieldErrors = j.error.fieldErrors;
      }
    } catch {}
    const ra = res.headers.get('Retry-After');
    return new ApiError(res.status, code, message, requestId, ra ? Number(ra) : undefined, fieldErrors);
  }

  private async refreshCaregiver(): Promise<CaregiverSession | null> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const current = await this.creds.getCaregiver();
      if (!current) return null;
      try {
        const res = await this.rawRequest('POST', '/auth/refresh', { auth: 'none', body: { refreshToken: current.refreshToken } });
        if (!res.ok) {
          await this.creds.setCaregiver(null);
          return null;
        }
        const next = (await res.json()) as CaregiverSession;
        await this.creds.setCaregiver(next);
        return next;
      } catch {
        // Network failure: keep the session so the user is not signed out by a dead connection
        return current;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; auth?: AuthKind; headers?: Record<string, string>; query?: Record<string, string | number | undefined> } = {}
  ): Promise<T> {
    const auth = opts.auth ?? 'none';
    let res = await this.rawRequest(method, path, { ...opts, auth });
    if (res.status === 401 && auth === 'caregiver') {
      const refreshed = await this.refreshCaregiver();
      if (!refreshed) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has ended. Please sign in again.');
      res = await this.rawRequest(method, path, { ...opts, auth });
    }
    if (!res.ok) throw await this.toError(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ---- health -----------------------------------------------------------

  health() {
    return this.request<{ status: string }>('GET', '/health');
  }

  // ---- caregiver account -------------------------------------------------

  async register(params: { email: string; password: string; displayName: string }): Promise<CaregiverSession> {
    const s = await this.request<CaregiverSession>('POST', '/auth/register', { body: params });
    await this.creds.setCaregiver(s);
    return s;
  }

  async login(params: { email: string; password: string }): Promise<CaregiverSession> {
    const s = await this.request<CaregiverSession>('POST', '/auth/login', { body: params });
    await this.creds.setCaregiver(s);
    return s;
  }

  async logout(): Promise<void> {
    const s = await this.creds.getCaregiver();
    try {
      if (s) await this.request('POST', '/auth/logout', { body: { refreshToken: s.refreshToken } });
    } catch {
      // Local sign-out must always succeed
    } finally {
      await this.creds.setCaregiver(null);
    }
  }

  /** Permanently deletes the caregiver account on the server (password required), then signs out locally. */
  async deleteCaregiverAccount(password: string): Promise<void> {
    await this.request('DELETE', '/auth/me', { auth: 'caregiver', body: { password } });
    await this.creds.setCaregiver(null);
  }

  async currentCaregiver(): Promise<CaregiverSession['caregiver'] | null> {
    const s = await this.creds.getCaregiver();
    if (!s) return null;
    try {
      const r = await this.request<{ caregiver: CaregiverSession['caregiver'] }>('GET', '/auth/me', { auth: 'caregiver' });
      return r.caregiver;
    } catch (e) {
      if (e instanceof ApiError && e.isNetwork) return s.caregiver; // offline: trust the stored session
      return null;
    }
  }

  // ---- patient device -----------------------------------------------------

  /** Creates the device identity (secret shown once, kept in SecureStore) or refreshes an existing one. */
  async registerDevice(params: { displayName?: string; appVersion: string; pushToken?: string }): Promise<{ deviceId: string }> {
    const existing = await this.creds.getDevice();
    const body = { platform: platformOS() === 'ios' ? 'ios' : 'android', ...params };
    if (existing) {
      const r = await this.request<{ deviceId: string }>('POST', '/devices/register', { body, auth: 'device' });
      return { deviceId: r.deviceId };
    }
    const r = await this.request<{ deviceId: string; deviceSecret: string }>('POST', '/devices/register', { body });
    await this.creds.setDevice({ deviceId: r.deviceId, deviceSecret: r.deviceSecret });
    return { deviceId: r.deviceId };
  }

  getDeviceProfile() {
    return this.request<{
      deviceId: string;
      displayName: string | null;
      planVersion: number;
      lastAppliedVersion: number;
      lastSyncedAt: string | null;
    }>('GET', '/devices/current', { auth: 'device' });
  }

  patchDevice(patch: { displayName?: string; pushToken?: string | null; appVersion?: string }) {
    return this.request('PATCH', '/devices/current', { auth: 'device', body: patch });
  }

  async unregisterDevice(): Promise<void> {
    await this.request('DELETE', '/devices/current', { auth: 'device' });
    await this.creds.setDevice(null);
  }

  /** Erases every record the server holds for this phone, then forgets the device credential. */
  async purgeDeviceData(): Promise<void> {
    await this.request('DELETE', '/devices/current', { auth: 'device', query: { purge: 'true' } });
    await this.creds.setDevice(null);
  }

  async hasDeviceIdentity(): Promise<boolean> {
    return !!(await this.creds.getDevice());
  }

  uploadDevicePlan(baseVersion: number, planSnapshot: DevicePlanReport) {
    return this.request<{ planVersion: number; lastAppliedVersion: number }>('PUT', '/devices/current/plan', {
      auth: 'device',
      body: { baseVersion, report: planSnapshot },
    });
  }

  fetchChanges(cursor?: string) {
    return this.request<ChangesResponse>('GET', '/devices/current/changes', { auth: 'device', query: { cursor } });
  }

  acknowledge(acks: Array<{ commandId: string; status: 'RECEIVED' | 'APPLIED' | 'REJECTED'; appliedVersion?: number; reasonCode?: string }>, cursor?: string) {
    return this.request('POST', '/devices/current/acks', { auth: 'device', body: { acks, cursor } });
  }

  // ---- pairing: patient side ------------------------------------------------

  createPairingSession() {
    return this.request<{ sessionId: string; pairingCode: string; qrPayload: string; expiresAt: string; expiresInSeconds: number }>(
      'POST',
      '/pairing/sessions',
      { auth: 'device' }
    );
  }

  getPairingSession(sessionId: string) {
    return this.request<PairingSessionView>('GET', `/pairing/sessions/${sessionId}`, { auth: 'device' });
  }

  regeneratePairingSession(sessionId: string) {
    return this.request<{ sessionId: string; pairingCode: string; qrPayload: string; expiresAt: string; expiresInSeconds: number }>(
      'POST',
      `/pairing/sessions/${sessionId}/regenerate`,
      { auth: 'device' }
    );
  }

  approvePairingRequest(requestId: string, params: { approvedPermissions: PermissionKey[]; relationshipLabel: string }) {
    return this.request<{ relationshipId: string; status: string; permissions: PermissionKey[]; confirmedAt: string }>(
      'POST',
      `/pairing/requests/${requestId}/approve`,
      { auth: 'device', body: params }
    );
  }

  declinePairingRequest(requestId: string) {
    return this.request<{ status: string }>('POST', `/pairing/requests/${requestId}/decline`, { auth: 'device' });
  }

  patientRelationships() {
    return this.request<{ items: PatientRelationship[] }>('GET', '/patient/relationships', { auth: 'device' });
  }

  revokeRelationship(relationshipId: string) {
    return this.request<{ status: string }>('POST', `/patient/relationships/${relationshipId}/revoke`, { auth: 'device' });
  }

  restrictRelationship(relationshipId: string, permissions: PermissionKey[]) {
    return this.request('PATCH', `/patient/relationships/${relationshipId}`, { auth: 'device', body: { permissions } });
  }

  // ---- pairing: caregiver side ------------------------------------------------

  validatePairing(credential: { code: string } | { sessionId: string; secret: string }) {
    return this.request<{ valid: true; sessionId: string; patientDisplayName: string; expiresAt: string }>('POST', '/pairing/validate', {
      auth: 'caregiver',
      body: credential,
    });
  }

  createPairingRequest(credential: { code: string } | { sessionId: string; secret: string }, requestedPermissions: PermissionKey[]) {
    return this.request<{ requestId: string; sessionId: string; status: string; expiresAt: string; patientDisplayName: string }>(
      'POST',
      '/pairing/requests',
      { auth: 'caregiver', body: { ...credential, requestedPermissions } }
    );
  }

  getPairingRequestStatus(requestId: string) {
    return this.request<{
      requestId: string;
      status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
      expiresAt: string;
      respondedAt: string | null;
      relationshipId: string | null;
      relationship: RelationshipSummary | null;
    }>('GET', `/pairing/requests/${requestId}/status`, { auth: 'caregiver' });
  }

  cancelPairingRequest(requestId: string) {
    return this.request('DELETE', `/pairing/requests/${requestId}`, { auth: 'caregiver' });
  }

  // ---- relationships (caregiver) ------------------------------------------------

  listRelationships() {
    return this.request<{ items: RelationshipSummary[] }>('GET', '/relationships', { auth: 'caregiver' });
  }

  getRelationship(relationshipId: string) {
    return this.request<{ relationship: RelationshipSummary }>('GET', `/relationships/${relationshipId}`, { auth: 'caregiver' });
  }

  disconnectRelationship(relationshipId: string) {
    return this.request<{ status: string }>('DELETE', `/relationships/${relationshipId}`, { auth: 'caregiver' });
  }

  // ---- plans and commands ------------------------------------------------------

  getPlan(relationshipId: string) {
    return this.request<PlanStateResponse>('GET', `/relationships/${relationshipId}/medications`, { auth: 'caregiver' });
  }

  submitPlanCommand(relationshipId: string, params: { baseVersion: number; planSnapshot: PlanSnapshotV2 }, idempotencyKey: string) {
    return this.request<{ commandId: string; status: string; planVersion: number; syncState: string; createdAt: string }>(
      'POST',
      `/relationships/${relationshipId}/plan-commands`,
      { auth: 'caregiver', body: params, headers: { 'Idempotency-Key': idempotencyKey } }
    );
  }

  getPlanCommand(relationshipId: string, commandId: string) {
    return this.request<PlanCommandState>('GET', `/relationships/${relationshipId}/plan-commands/${commandId}`, { auth: 'caregiver' });
  }

  // ---- dose events and activity -----------------------------------------------

  uploadDoseEvents(events: DoseEventUploadItem[]) {
    return this.request<{
      accepted: number;
      duplicates: number;
      processedCount: number;
      failedEvents: Array<{ index: number; eventId: string | null; code: string; message: string }>;
    }>('POST', '/sync/dose-events', { auth: 'device', body: { events } });
  }

  getActivity(relationshipId: string, params: { limit?: number; cursor?: string } = {}) {
    return this.request<ActivityResponse>('GET', `/relationships/${relationshipId}/activity`, {
      auth: 'caregiver',
      query: { limit: params.limit ?? 50, cursor: params.cursor },
    });
  }
}

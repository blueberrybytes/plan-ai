import axios from "axios";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { google } from "googleapis";
import { IntegrationProvider, IntegrationStatus, type UserIntegration } from "@prisma/client";
import prisma from "../prisma/prismaClient";
import EnvUtils from "../utils/EnvUtils";
import { logger } from "../utils/logger";
import { decryptSecret, encryptSecret } from "../utils/secretCrypto";
import {
  CURRENT_MEETING_WINDOW_MS,
  normalizeGoogleEvent,
  normalizeOutlookEvent,
  selectCurrentMeeting,
  type CalendarEventCandidate,
  type CalendarProvider,
  type CurrentMeeting,
  type GoogleCalendarEvent,
  type OutlookCalendarEvent,
} from "./calendarEvents";

/**
 * Google Calendar and Outlook Calendar connections. They are personal
 * (UserIntegration, one per user and provider) and separate from Google Drive
 * and OneDrive, so connecting a calendar never touches the Drive grant.
 *
 * Read only: we list events around "now" to tell the recorder which meeting is
 * on. Tokens are stored encrypted with secretCrypto.
 */

export const CALENDAR_PROVIDERS: CalendarProvider[] = ["GOOGLE_CALENDAR", "OUTLOOK_CALENDAR"];

const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  // Same as the Drive flow: only used to show which account is connected.
  "https://www.googleapis.com/auth/userinfo.email",
];
const OUTLOOK_CALENDAR_SCOPES = ["Calendars.Read", "User.Read", "offline_access"];

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const GRAPH_CALENDAR_VIEW_URL = "https://graph.microsoft.com/v1.0/me/calendarView";
const GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me";

/** Per HTTP call to Google or Microsoft. */
const HTTP_TIMEOUT_MS = 5000;
/** Whole lookup for one calendar, refresh included. Clients give up at 15 s. */
const CALENDAR_LOOKUP_TIMEOUT_MS = 10000;
/** Refresh this long before the access token expires. */
const TOKEN_EXPIRY_MARGIN_MS = 60 * 1000;
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

/** Frontend tab for each provider, used in /integrations/<slug>. */
const PROVIDER_SLUG: Record<CalendarProvider, string> = {
  GOOGLE_CALENDAR: "google-calendar",
  OUTLOOK_CALENDAR: "outlook-calendar",
};

export interface CalendarOAuthState {
  userId: string;
  workspaceId: string;
  provider: CalendarProvider;
  redirectPath?: string;
  /** Where the provider sent the browser back. The code exchange must repeat it. */
  redirectUri?: string;
  nonce: string;
  issuedAt: number;
}

export interface CalendarCallbackParams {
  code?: string;
  state?: string;
  error?: string;
}

export interface CalendarConnectResult {
  connected: boolean;
  /** OAuthDeclined, MissingParams, InvalidState, MissingScope or ExchangeFailed. */
  errorReason?: string;
  /** Path inside the web app to show next. */
  redirectPath?: string;
}

interface ExchangedTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  accountId?: string;
  accountName?: string;
}

/** A failure the user should see as a reason on the integrations page. */
class CalendarConnectError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}

/** Status, provider error code and message of an HTTP error, without tokens or headers. */
export const describeHttpError = (
  error: unknown,
): { status?: number; code?: string; message: string } => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { error?: string | { code?: string; message?: string }; error_description?: string }
      | undefined;
    const code = typeof data?.error === "string" ? data.error : data?.error?.code;
    return { status: error.response?.status, code, message: error.message };
  }
  // googleapis throws GaxiosError: same idea, different shape.
  const gaxios = error as { response?: { status?: number; data?: { error?: string } } };
  return {
    status: gaxios?.response?.status,
    code:
      typeof gaxios?.response?.data?.error === "string" ? gaxios.response.data.error : undefined,
    message: error instanceof Error ? error.message : String(error),
  };
};

/** Only a relative path inside the web app, never another site. */
const safeRedirectPath = (path: string | undefined): string | undefined => {
  if (!path || path.length > 500) return undefined;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return undefined;
  return path;
};

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

class CalendarService {
  /** One refresh at a time per integration, so parallel requests share it. */
  private readonly refreshes = new Map<string, Promise<string | null>>();

  // ── Configuration ───────────────────────────────────────────────────────────

  private appUrl(): string {
    return EnvUtils.get("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
  }

  /**
   * Web app origins the provider may send the browser back to. The web runs
   * on more than one domain (plan-ai.blueberrybytes.com and a white-label
   * one), and Firebase keeps the session per domain, so the user must come
   * back to the domain they started from. Taken from CORS_ORIGINS, APP_URL
   * and FRONTEND_URL; with no CORS_ORIGINS, outside production, any
   * localhost port (local development).
   */
  public isAllowedAppOrigin(origin: string | undefined): origin is string {
    if (!origin) return false;
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      return false;
    }
    if (parsed.origin !== origin.replace(/\/+$/, "")) return false;
    const cors = EnvUtils.get("CORS_ORIGINS", "")
      .split(",")
      .map((s) => s.trim().replace(/\/+$/, ""))
      .filter(Boolean);
    const allowed = new Set(
      [...cors, this.appUrl(), EnvUtils.get("FRONTEND_URL", "").replace(/\/+$/, "")].filter(
        Boolean,
      ),
    );
    if (allowed.has(parsed.origin)) return true;
    return (
      cors.length === 0 &&
      process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1")
    );
  }

  /**
   * The provider sends the browser back to the web app, not to the API. The
   * app then posts the code to /api/calendar/{provider}/connect with the
   * user's own session, so the connection lands on whoever finishes it.
   * Every origin used here must be registered in Google Cloud and Azure.
   */
  public buildRedirectUri(provider: CalendarProvider, appOrigin?: string): string {
    const slug = PROVIDER_SLUG[provider];
    if (this.isAllowedAppOrigin(appOrigin)) {
      return `${appOrigin.replace(/\/+$/, "")}/integrations/${slug}`;
    }
    return provider === "GOOGLE_CALENDAR"
      ? EnvUtils.get("GOOGLE_CALENDAR_REDIRECT_URI", `${this.appUrl()}/integrations/${slug}`)
      : EnvUtils.get("MICROSOFT_CALENDAR_REDIRECT_URI", `${this.appUrl()}/integrations/${slug}`);
  }

  private googleCredentials(): { clientId: string; clientSecret: string } {
    return {
      clientId: EnvUtils.get("GOOGLE_CLIENT_ID", ""),
      clientSecret: EnvUtils.get("GOOGLE_CLIENT_SECRET", ""),
    };
  }

  private microsoftCredentials(): { clientId: string; clientSecret: string; tenantId: string } {
    return {
      clientId: EnvUtils.get("MICROSOFT_CLIENT_ID", ""),
      clientSecret: EnvUtils.get("MICROSOFT_CLIENT_SECRET", ""),
      tenantId: EnvUtils.get("MICROSOFT_TENANT_ID", "") || "common",
    };
  }

  public isConfigured(provider: CalendarProvider): boolean {
    const { clientId, clientSecret } =
      provider === "GOOGLE_CALENDAR" ? this.googleCredentials() : this.microsoftCredentials();
    return Boolean(clientId && clientSecret);
  }

  private microsoftTokenUrl(): string {
    return `https://login.microsoftonline.com/${this.microsoftCredentials().tenantId}/oauth2/v2.0/token`;
  }

  // ── Signed OAuth state ──────────────────────────────────────────────────────

  private stateSecret(provider: CalendarProvider): string {
    const secret =
      process.env.CALENDAR_STATE_SECRET ||
      (provider === "GOOGLE_CALENDAR"
        ? this.googleCredentials().clientSecret
        : this.microsoftCredentials().clientSecret);
    if (!secret) throw new Error("Calendar OAuth is not configured on this server");
    return secret;
  }

  // Prefixed so a calendar state never passes the Drive or OneDrive check,
  // which may use the same client secret as key.
  private signState(provider: CalendarProvider, payload: string): string {
    return createHmac("sha256", this.stateSecret(provider))
      .update(`calendar:${provider}\n${payload}`)
      .digest("base64url");
  }

  public createStateToken(input: Omit<CalendarOAuthState, "nonce" | "issuedAt">): string {
    const payload: CalendarOAuthState = {
      ...input,
      redirectPath: safeRedirectPath(input.redirectPath),
      nonce: randomUUID(),
      issuedAt: Date.now(),
    };
    const serialized = JSON.stringify(payload);
    return `${Buffer.from(serialized).toString("base64url")}.${this.signState(input.provider, serialized)}`;
  }

  /** The state payload when the signature, provider and age check out, else null. */
  public parseStateToken(
    token: string | undefined,
    provider: CalendarProvider,
  ): CalendarOAuthState | null {
    if (!token) return null;
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;

    const serialized = Buffer.from(encoded, "base64url").toString("utf8");
    const expected = Buffer.from(this.signState(provider, serialized));
    const provided = Buffer.from(signature);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      logger.warn("[Calendar] OAuth state signature mismatch", { provider });
      return null;
    }

    try {
      const parsed = JSON.parse(serialized) as CalendarOAuthState;
      if (!parsed.userId || !parsed.workspaceId || parsed.provider !== provider) return null;
      if (!parsed.issuedAt || Date.now() - parsed.issuedAt > STATE_MAX_AGE_MS) {
        logger.warn("[Calendar] OAuth state expired", { provider });
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // ── Disconnect ──────────────────────────────────────────────────────────────

  /**
   * Withdraws Plan AI's access at Google before the stored tokens are
   * deleted, so disconnecting also removes the app from the user's Google
   * account. Best effort: a failure is logged and the disconnect goes on.
   * Microsoft has no per-app revoke for delegated tokens; the user removes
   * the app at myapps.microsoft.com.
   */
  public async revokeGoogleAccess(userId: string): Promise<void> {
    const integration = await prisma.userIntegration.findFirst({
      where: { userId, provider: "GOOGLE_CALENDAR" },
      select: { accessToken: true, refreshToken: true },
    });
    if (!integration) return;
    try {
      // Revoking the refresh token also ends every access token issued from it.
      const token =
        decryptSecret(integration.refreshToken) || decryptSecret(integration.accessToken);
      if (!token) return;
      await axios.post(GOOGLE_REVOKE_URL, new URLSearchParams({ token }), {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: HTTP_TIMEOUT_MS,
      });
    } catch (error) {
      logger.warn("[Calendar] Could not revoke the Google token", describeHttpError(error));
    }
  }

  // ── Connect ─────────────────────────────────────────────────────────────────

  public getAuthorizationUrl(
    provider: CalendarProvider,
    userId: string,
    workspaceId: string,
    redirectPath?: string,
    appOrigin?: string,
  ): string {
    if (!this.isConfigured(provider)) {
      throw new Error(
        `${provider === "GOOGLE_CALENDAR" ? "Google" : "Microsoft"} Calendar is not configured on this server`,
      );
    }
    const redirectUri = this.buildRedirectUri(provider, appOrigin);
    const state = this.createStateToken({
      userId,
      workspaceId,
      provider,
      redirectPath,
      redirectUri,
    });

    if (provider === "GOOGLE_CALENDAR") {
      const { clientId, clientSecret } = this.googleCredentials();
      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      return client.generateAuthUrl({
        access_type: "offline",
        // Always ask, so Google sends a refresh token even on a second connect.
        prompt: "consent",
        scope: GOOGLE_CALENDAR_SCOPES,
        state,
      });
    }

    const { clientId, tenantId } = this.microsoftCredentials();
    const url = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", OUTLOOK_CALENDAR_SCOPES.join(" "));
    url.searchParams.set("state", state);
    return url.toString();
  }

  /**
   * Finishes a connection with the code the provider sent back to the web
   * app. The state must have been issued to this same user: a connect link
   * forwarded to someone else cannot put their calendar in the sender's
   * account. Never throws: every failure becomes an `errorReason`.
   */
  public async completeOAuth(
    provider: CalendarProvider,
    userId: string,
    params: CalendarCallbackParams,
  ): Promise<CalendarConnectResult> {
    if (params.error) {
      logger.warn("[Calendar] OAuth returned an error", { provider, error: params.error });
      return { connected: false, errorReason: "OAuthDeclined" };
    }
    if (!params.code || !params.state) {
      return { connected: false, errorReason: "MissingParams" };
    }

    let state: CalendarOAuthState | null = null;
    try {
      state = this.parseStateToken(params.state, provider);
    } catch (error) {
      logger.warn("[Calendar] Could not verify OAuth state", error);
    }
    if (!state) {
      return { connected: false, errorReason: "InvalidState" };
    }
    if (state.userId !== userId) {
      logger.warn("[Calendar] OAuth state was issued to another user", { provider });
      return { connected: false, errorReason: "InvalidState" };
    }
    // Signed in the state, so it cannot point anywhere else.
    const redirectUri = state.redirectUri ?? this.buildRedirectUri(provider);

    try {
      const tokens =
        provider === "GOOGLE_CALENDAR"
          ? await this.exchangeGoogleCode(params.code, redirectUri)
          : await this.exchangeMicrosoftCode(params.code, redirectUri);
      await this.saveConnection(state.userId, provider, tokens);
      logger.info("[Calendar] Calendar connected", {
        provider,
        userId: state.userId,
        workspaceId: state.workspaceId,
      });
      return { connected: true, redirectPath: state.redirectPath };
    } catch (error) {
      if (error instanceof CalendarConnectError) {
        return { connected: false, errorReason: error.reason, redirectPath: state.redirectPath };
      }
      logger.error("[Calendar] OAuth code exchange failed", {
        provider,
        ...describeHttpError(error),
      });
      return { connected: false, errorReason: "ExchangeFailed", redirectPath: state.redirectPath };
    }
  }

  private async exchangeGoogleCode(code: string, redirectUri: string): Promise<ExchangedTokens> {
    const { clientId, clientSecret } = this.googleCredentials();
    const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await client.getToken(code);

    // Google lets people untick scopes on the consent screen.
    const granted = (tokens.scope ?? "").split(" ");
    const canReadEvents = granted.some((scope) =>
      [
        "https://www.googleapis.com/auth/calendar.events.readonly",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar",
      ].includes(scope),
    );
    if (!tokens.access_token || !canReadEvents) {
      throw new CalendarConnectError("MissingScope");
    }

    let accountId: string | undefined;
    let accountName: string | undefined;
    try {
      client.setCredentials(tokens);
      const userInfo = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
      accountId = userInfo.data.id ?? undefined;
      accountName = userInfo.data.email ?? undefined;
    } catch (error) {
      // The email is only a label on the integrations page.
      logger.warn("[Calendar] Could not read the Google account email", describeHttpError(error));
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined,
      scope: tokens.scope ?? undefined,
      accountId,
      accountName,
    };
  }

  private async exchangeMicrosoftCode(code: string, redirectUri: string): Promise<ExchangedTokens> {
    const { clientId, clientSecret } = this.microsoftCredentials();
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: OUTLOOK_CALENDAR_SCOPES.join(" "),
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const response = await axios.post(this.microsoftTokenUrl(), params, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 15000,
    });
    const { access_token, refresh_token, expires_in, scope } = response.data as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    if (!access_token || !/calendars\.read/i.test(scope ?? "")) {
      throw new CalendarConnectError("MissingScope");
    }

    let accountId: string | undefined;
    let accountName: string | undefined;
    try {
      const profile = await axios.get(GRAPH_ME_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { $select: "id,mail,userPrincipalName" },
        timeout: 15000,
      });
      accountId = profile.data?.id ?? undefined;
      accountName = profile.data?.mail || profile.data?.userPrincipalName || undefined;
    } catch (error) {
      logger.warn(
        "[Calendar] Could not read the Microsoft account email",
        describeHttpError(error),
      );
    }

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
      scope,
      accountId,
      accountName,
    };
  }

  private async saveConnection(
    userId: string,
    provider: CalendarProvider,
    tokens: ExchangedTokens,
  ): Promise<void> {
    const data = {
      status: IntegrationStatus.CONNECTED,
      accessToken: encryptSecret(tokens.accessToken),
      expiresAt: tokens.expiresAt ?? null,
      scope: tokens.scope ?? null,
      accountId: tokens.accountId ?? null,
      accountName: tokens.accountName ?? null,
    };
    const encryptedRefresh = encryptSecret(tokens.refreshToken ?? null);

    await prisma.userIntegration.upsert({
      where: { userId_provider: { userId, provider: IntegrationProvider[provider] } },
      // Keep the old refresh token when the provider does not send a new one.
      update: { ...data, ...(encryptedRefresh ? { refreshToken: encryptedRefresh } : {}) },
      create: {
        ...data,
        userId,
        provider: IntegrationProvider[provider],
        refreshToken: encryptedRefresh,
      },
    });
  }

  // ── Tokens ──────────────────────────────────────────────────────────────────

  /**
   * A usable access token, refreshed when it is about to expire. Null when the
   * calendar cannot be read now. A refresh token the provider rejects
   * (invalid_grant) marks the integration ERROR so the user reconnects.
   */
  public async getAccessToken(
    integration: UserIntegration,
    forceRefresh = false,
  ): Promise<string | null> {
    if (!forceRefresh) {
      const expiresAtMs = integration.expiresAt?.getTime();
      if (!expiresAtMs || expiresAtMs - TOKEN_EXPIRY_MARGIN_MS > Date.now()) {
        return decryptSecret(integration.accessToken) || null;
      }
    }

    const pending = this.refreshes.get(integration.id);
    if (pending) return pending;

    const refresh = this.refreshAccessToken(integration).finally(() =>
      this.refreshes.delete(integration.id),
    );
    this.refreshes.set(integration.id, refresh);
    return refresh;
  }

  private async refreshAccessToken(integration: UserIntegration): Promise<string | null> {
    const provider = integration.provider as CalendarProvider;
    const refreshToken = decryptSecret(integration.refreshToken);
    if (!refreshToken) {
      logger.warn("[Calendar] Access token expired and there is no refresh token", {
        provider,
        integrationId: integration.id,
      });
      await this.markError(integration.id);
      return null;
    }

    try {
      const params =
        provider === "GOOGLE_CALENDAR"
          ? new URLSearchParams({
              client_id: this.googleCredentials().clientId,
              client_secret: this.googleCredentials().clientSecret,
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            })
          : new URLSearchParams({
              client_id: this.microsoftCredentials().clientId,
              client_secret: this.microsoftCredentials().clientSecret,
              scope: OUTLOOK_CALENDAR_SCOPES.join(" "),
              refresh_token: refreshToken,
              grant_type: "refresh_token",
            });
      const response = await axios.post(
        provider === "GOOGLE_CALENDAR" ? GOOGLE_TOKEN_URL : this.microsoftTokenUrl(),
        params,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: HTTP_TIMEOUT_MS,
        },
      );
      const { access_token, refresh_token, expires_in } = response.data as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!access_token) throw new Error("Token endpoint returned no access token");

      await prisma.userIntegration.updateMany({
        where: { id: integration.id },
        data: {
          accessToken: encryptSecret(access_token),
          // Microsoft sends a new refresh token, Google keeps the old one.
          refreshToken: encryptSecret(refresh_token || refreshToken),
          expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
          status: IntegrationStatus.CONNECTED,
        },
      });
      return access_token;
    } catch (error) {
      const details = describeHttpError(error);
      if (details.code === "invalid_grant") {
        logger.warn("[Calendar] Refresh token rejected, marking the integration ERROR", {
          provider,
          integrationId: integration.id,
          ...details,
        });
        await this.markError(integration.id);
      } else {
        logger.warn("[Calendar] Token refresh failed", {
          provider,
          integrationId: integration.id,
          ...details,
        });
      }
      return null;
    }
  }

  private async markError(integrationId: string): Promise<void> {
    try {
      await prisma.userIntegration.updateMany({
        where: { id: integrationId },
        data: { status: IntegrationStatus.ERROR },
      });
    } catch (error) {
      logger.warn("[Calendar] Could not mark the integration ERROR", error);
    }
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  private async fetchGoogleEvents(
    accessToken: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<GoogleCalendarEvent[]> {
    const response = await axios.get(GOOGLE_EVENTS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        // timeMin filters on the end and timeMax on the start, so events
        // already running are included.
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
        maxResults: 50,
      },
      timeout: HTTP_TIMEOUT_MS,
    });
    return (response.data?.items ?? []) as GoogleCalendarEvent[];
  }

  private async fetchOutlookEvents(
    accessToken: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<OutlookCalendarEvent[]> {
    const response = await axios.get(GRAPH_CALENDAR_VIEW_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      params: {
        startDateTime: timeMin.toISOString(),
        endDateTime: timeMax.toISOString(),
        $select:
          "subject,start,end,isAllDay,isCancelled,showAs,responseStatus,attendees,organizer,onlineMeeting,onlineMeetingUrl,location,bodyPreview",
        $orderby: "start/dateTime",
        $top: 50,
      },
      timeout: HTTP_TIMEOUT_MS,
    });
    return (response.data?.value ?? []) as OutlookCalendarEvent[];
  }

  private async fetchCandidates(
    integration: UserIntegration,
    accessToken: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<CalendarEventCandidate[]> {
    if (integration.provider === IntegrationProvider.GOOGLE_CALENDAR) {
      const events = await this.fetchGoogleEvents(accessToken, timeMin, timeMax);
      return events.map(normalizeGoogleEvent).filter((e): e is CalendarEventCandidate => !!e);
    }
    const events = await this.fetchOutlookEvents(accessToken, timeMin, timeMax);
    return events.map(normalizeOutlookEvent).filter((e): e is CalendarEventCandidate => !!e);
  }

  /** Events of one calendar. Never throws: a failure is logged and gives []. */
  private async loadCalendar(
    integration: UserIntegration,
    timeMin: Date,
    timeMax: Date,
  ): Promise<CalendarEventCandidate[]> {
    const context = { provider: integration.provider, integrationId: integration.id };
    try {
      const token = await this.getAccessToken(integration);
      if (!token) return [];
      try {
        return await this.fetchCandidates(integration, token, timeMin, timeMax);
      } catch (error) {
        // A 401 before the stored expiry means the token was revoked or the
        // clock is off. One forced refresh tells the two apart.
        if (describeHttpError(error).status !== 401) throw error;
        const fresh = await this.getAccessToken(integration, true);
        if (!fresh) return [];
        return await this.fetchCandidates(integration, fresh, timeMin, timeMax);
      }
    } catch (error) {
      logger.warn("[Calendar] Could not read calendar events", {
        ...context,
        ...describeHttpError(error),
      });
      return [];
    }
  }

  /**
   * The meeting the user is in now, or the next one within 15 minutes,
   * across every connected calendar of the user. Null when there is none or
   * the calendars cannot be read. Never throws.
   */
  public async getCurrentMeeting(
    userId: string,
    workspaceId: string,
    now: Date = new Date(),
  ): Promise<CurrentMeeting | null> {
    try {
      const integrations = await prisma.userIntegration.findMany({
        where: {
          userId,
          provider: { in: CALENDAR_PROVIDERS.map((p) => IntegrationProvider[p]) },
          status: IntegrationStatus.CONNECTED,
        },
      });
      if (integrations.length === 0) return null;

      const timeMin = new Date(now.getTime() - CURRENT_MEETING_WINDOW_MS);
      const timeMax = new Date(now.getTime() + CURRENT_MEETING_WINDOW_MS);

      const perCalendar = await Promise.all(
        integrations.map((integration) =>
          withTimeout(
            this.loadCalendar(integration, timeMin, timeMax),
            CALENDAR_LOOKUP_TIMEOUT_MS,
            [] as CalendarEventCandidate[],
          ),
        ),
      );
      return selectCurrentMeeting(perCalendar.flat(), now);
    } catch (error) {
      logger.warn("[Calendar] Current meeting lookup failed", {
        userId,
        workspaceId,
        ...describeHttpError(error),
      });
      return null;
    }
  }
}

export const calendarService = new CalendarService();

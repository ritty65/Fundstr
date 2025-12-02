import type { App } from "vue";
import type { Router } from "vue-router";
import * as Sentry from "@sentry/vue";

const TELEMETRY_SESSION_KEY = "cashu.telemetry.session";
let sentryReady = false;

export function isTelemetryReady() {
  return sentryReady;
}

function doNotTrackEnabled(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const dntValues = [navigator.doNotTrack, (window as any)?.doNotTrack, (navigator as any)?.msDoNotTrack].filter(
    (value): value is string => typeof value === "string",
  );

  return dntValues.some((value) => value === "1" || value.toLowerCase() === "yes");
}

function getTelemetrySessionId(): string | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  const existing = window.localStorage.getItem(TELEMETRY_SESSION_KEY);
  if (typeof existing === "string" && existing.trim()) {
    return existing;
  }

  let generated: string;
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    generated = crypto.randomUUID();
  } else {
    generated = Math.random().toString(36).slice(2);
  }

  try {
    window.localStorage.setItem(TELEMETRY_SESSION_KEY, generated);
  } catch (error) {
    console.debug("[telemetry] Failed to persist session identifier", error);
  }

  return generated;
}

function sanitizeContext(context?: Record<string, unknown>) {
  if (!context) {
    return undefined;
  }

  try {
    return JSON.parse(
      JSON.stringify(context, (_key, value) => {
        if (Array.isArray(value)) {
          return { count: value.length };
        }

        if (typeof value === "string" && value.length > 256) {
          return `${value.slice(0, 252)}…`;
        }

        return value;
      }),
    );
  } catch (error) {
    console.debug("[telemetry] Failed to sanitize context payload", error);
    return undefined;
  }
}

export function initSentry(app: App, router: Router) {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const telemetryDisabled = import.meta.env.VITE_SENTRY_ENABLED === "false";

  if (!dsn || telemetryDisabled || doNotTrackEnabled()) {
    return;
  }

  const release =
    import.meta.env.VITE_SENTRY_RELEASE ??
    import.meta.env.VITE_COMMIT_SHA ??
    import.meta.env.VITE_APP_VERSION ??
    undefined;
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE;
  const traceSample = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0);

    Sentry.init({
      app,
      dsn,
      release,
      environment,
      sendDefaultPii: false,
      integrations: [
        Sentry.browserTracingIntegration({
          router,
          tracePropagationTargets: [/^https?:\/\//, /^\//],
        }),
      ],
      tracesSampleRate: Number.isFinite(traceSample) ? traceSample : 0,
      beforeSend(event) {
        if (doNotTrackEnabled() || telemetryDisabled) {
          return null;
        }

        if (event.user) {
          event.user.ip_address = undefined;
        }

        return event;
      },
    });

  const sessionId = getTelemetrySessionId();
  if (sessionId) {
    Sentry.setUser({ id: sessionId });
    Sentry.setTag("telemetry_session", sessionId);
  }

  Sentry.setTag("build_mode", import.meta.env.MODE);

  Sentry.addBreadcrumb({
    category: "session",
    level: "info",
    message: "Telemetry session initialized",
  });

  sentryReady = true;
}

export function addTelemetryBreadcrumb(
  message: string,
  data?: Record<string, unknown>,
  level: Sentry.SeverityLevel = "info",
) {
  if (!sentryReady) {
    return;
  }

  Sentry.addBreadcrumb({
    category: "user",
    message,
    data: sanitizeContext(data),
    level,
  });
}

export function captureTelemetryWarning(message: string, context?: Record<string, unknown>) {
  if (!sentryReady) {
    return;
  }

  Sentry.withScope((scope) => {
    const sanitized = sanitizeContext(context);
    if (sanitized) {
      scope.setContext("details", sanitized);
    }
    scope.setLevel("warning");
    Sentry.captureMessage(message);
  });
}

import type { PiniaPluginContext } from "pinia";
import { addTelemetryBreadcrumb, captureTelemetryWarning, isTelemetryReady } from "src/utils/telemetry/sentry";

export function createTelemetryPlugin(): (ctx: PiniaPluginContext) => void {
  return ({ store }: PiniaPluginContext) => {
    store.$onAction(({ name, args, onError }) => {
      addTelemetryBreadcrumb(`store:${store.$id}.${name}`, { args });

      onError((error) => {
        if (!isTelemetryReady()) return;

        const payload: Record<string, unknown> = { store: store.$id, action: name };

        try {
          payload.args = JSON.parse(JSON.stringify(args ?? []));
        } catch {
          // fall back to structural info only
          payload.args = { count: Array.isArray(args) ? args.length : 0 };
        }

        captureTelemetryWarning(`[store:${store.$id}.${name}] action failed`, {
          ...payload,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      });
    });
  };
}

export default createTelemetryPlugin;

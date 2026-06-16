/**
 * config.js — backend base-URL resolution for the UniGarden app.
 *
 * ONE shared resolver for BOTH portals (youth + worker). Every service client
 * (engagement/pinboard, calendar, peer-forum, journaling, user, house) builds
 * its URL via baseUrl() below — no host is hardcoded anywhere.
 *
 * The backend is a set of microservices, each on its own port:
 *   user        :4001    house     :4002    journaling :4003
 *   engagement  :4004    calendar  :4005
 *
 * HOST RESOLUTION (the tricky part for mobile):
 *   - On a physical phone via Expo Go, `localhost` points at the PHONE, not your
 *     dev machine. We derive the dev machine's LAN IP from the Metro bundler URL
 *     Expo already knows (`Constants.expoConfig.hostUri`, e.g. "192.168.1.20:8081")
 *     and reuse that IP for the API ports.
 *   - On Expo web / iOS simulator, that host is `localhost` and works directly.
 *   - On an Android emulator, the host loopback is `10.0.2.2`.
 *
 * OVERRIDE: set EXPO_PUBLIC_API_HOST (e.g. "192.168.1.20") to force a host.
 * Needed when Metro runs in "localhost" mode or through a tunnel, where the
 * bundler host can't be reused as a LAN address.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Per-service ports (must match each service's `index.ts` default PORT).
export const SERVICE_PORTS = {
  user: 4001,
  house: 4002,
  journaling: 4003,
  engagement: 4004,
  calendar: 4005,
};

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '']);

/** Pull the raw "host:port" Metro is served from, across Expo SDK shapes. */
function bundlerHostUri() {
  return (
    Constants.expoConfig?.hostUri || // SDK 49+ (Expo Go & dev builds)
    Constants.expoGoConfig?.debuggerHost || // Expo Go fallback
    Constants.expoConfig?.developer?.host ||
    '' // (Constants.manifest is intentionally avoided — deprecated/removed)
  );
}

/** Strip any scheme + port, leaving just the host (IP or hostname). */
function hostOnly(uri) {
  if (!uri) return '';
  const noScheme = uri.includes('://') ? uri.split('://')[1] : uri;
  return noScheme.split(':')[0].trim();
}

/**
 * Resolve the dev-machine host the device should hit for the backend.
 * Returns { host, source } so callers can surface how it was derived.
 */
function resolveHost() {
  // 1. Explicit override always wins.
  const override = process.env.EXPO_PUBLIC_API_HOST;
  if (override) return { host: override, source: 'EXPO_PUBLIC_API_HOST' };

  // 2. On the web build, the page origin's host is correct (localhost is fine).
  if (Platform.OS === 'web') return { host: 'localhost', source: 'web' };

  // 3. Derive from the Metro bundler URL — the LAN IP on a real device.
  const host = hostOnly(bundlerHostUri());

  if (host && !LOOPBACK.has(host)) {
    return { host, source: 'expo.hostUri' };
  }

  // 4. The bundler reported a loopback host (Metro in "localhost" mode) or
  //    nothing at all. A phone can't reach the dev machine via either.
  if (Platform.OS === 'android') {
    // Android emulator reaches the host loopback through 10.0.2.2.
    return { host: '10.0.2.2', source: 'android-emulator-fallback' };
  }
  return { host: 'localhost', source: 'loopback-fallback' };
}

const { host: HOST, source: HOST_SOURCE } = resolveHost();

// One-time diagnostic so the resolved target is visible in the Metro/JS console.
// If you see a loopback host on a physical device, set EXPO_PUBLIC_API_HOST.
if (
  Platform.OS !== 'web' &&
  LOOPBACK.has(HOST) &&
  HOST_SOURCE.includes('fallback')
) {
  console.warn(
    `[api] Backend host resolved to "${HOST}" (${HOST_SOURCE}). A physical ` +
      `device cannot reach your computer at this address. Start Expo in LAN ` +
      `mode, or set EXPO_PUBLIC_API_HOST to your computer's LAN IP.`
  );
} else {
  console.log(`[api] Backend host: ${HOST} (via ${HOST_SOURCE})`);
}

/** Base URL (no trailing slash) for a given service key. */
export function baseUrl(service) {
  const port = SERVICE_PORTS[service];
  if (!port) throw new Error(`Unknown backend service: "${service}"`);
  return `http://${HOST}:${port}`;
}

export const API_HOST = HOST;
export const API_HOST_SOURCE = HOST_SOURCE;

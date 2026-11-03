const SDK_URL = 'https://pixel-manager.web.app/sdk/landing-tracking-sdk.iife.js';
const CONFIG_URL = 'https://pixel-manager.web.app/tracking-config';
const DIAGNOSTIC_URL = 'https://pixel-manager.web.app/tracking-diagnostic';
const SITE_ID = import.meta.env.VITE_LTM_SITE_ID?.trim();
const TEST_ALLOW_WITHOUT_CONSENT =
  SITE_ID === 'test' && import.meta.env.VITE_LTM_TEST_ALLOW_WITHOUT_CONSENT === 'true';

interface TrackingInstance {
  start(): Promise<void>;
}

interface TrackingDiagnosticSignal {
  kind: string;
  siteId: string;
  releaseVersion?: number;
  provider?: string;
}

interface TrackingBundle {
  TrackingSdk: new (options: {
    siteId: string;
    configUrl: string;
    adapters: { meta: unknown; karrot: unknown };
    hasConsent: () => boolean;
    verifyCompletionToken: () => null;
    onDiagnostic: (signal: TrackingDiagnosticSignal) => void;
    onError: (error: Error) => void;
  }) => TrackingInstance;
  createMetaAdapter(): unknown;
  createKarrotAdapter(): unknown;
}

declare global {
  interface Window {
    LandingTrackingSdk?: TrackingBundle;
  }
}

let scriptPromise: Promise<TrackingBundle> | null = null;
let instancePromise: Promise<TrackingInstance> | null = null;
let startPromise: Promise<void> | null = null;
let consentProvider: (() => boolean) | null = null;

// A real consent provider overrides the temporary test-site default.
export function setLandingTrackingConsentProvider(provider: (() => boolean) | null): void {
  consentProvider = provider;
  if (hasAdvertisingConsent()) void startLandingTracking();
}

function hasAdvertisingConsent(): boolean {
  try {
    return consentProvider ? consentProvider() === true : TEST_ALLOW_WITHOUT_CONSENT;
  } catch {
    return false;
  }
}

function sendDiagnostic(signal: TrackingDiagnosticSignal): void {
  void fetch(DIAGNOSTIC_URL, {
    method: 'POST',
    mode: 'cors',
    keepalive: true,
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(signal),
  }).catch((error: unknown) => console.error('Landing tracking diagnostic failed', error));
}

function loadBundle(): Promise<TrackingBundle> {
  if (window.LandingTrackingSdk) return Promise.resolve(window.LandingTrackingSdk);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TrackingBundle>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.LandingTrackingSdk) resolve(window.LandingTrackingSdk);
      else reject(new Error('Landing Tracking SDK global is unavailable'));
    };
    script.onerror = () => reject(new Error('Landing Tracking SDK failed to load'));
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    scriptPromise = null;
    document.querySelector(`script[src="${SDK_URL}"]`)?.remove();
    throw error;
  });
  return scriptPromise;
}

export function startLandingTracking(): Promise<void> {
  if (!SITE_ID || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(SITE_ID)) return Promise.resolve();
  if (startPromise) return startPromise;

  startPromise = (async () => {
    try {
      instancePromise ??= loadBundle().then(
        (bundle) =>
          new bundle.TrackingSdk({
            siteId: SITE_ID,
            configUrl: CONFIG_URL,
            adapters: {
              meta: bundle.createMetaAdapter(),
              karrot: bundle.createKarrotAdapter(),
            },
            hasConsent: hasAdvertisingConsent,
            // No consultation flow or /complete route exists in this app.
            verifyCompletionToken: () => null,
            onDiagnostic: sendDiagnostic,
            onError: () => {},
          }),
      );
      const instance = await instancePromise;
      await instance.start();
    } catch {
      // A missing published config or failed script must not affect portfolio actions.
      instancePromise = null;
    } finally {
      startPromise = null;
    }
  })();
  return startPromise;
}

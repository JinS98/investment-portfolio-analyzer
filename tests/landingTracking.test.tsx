import { beforeEach, describe, expect, it, vi } from 'vitest';

const SDK_URL = 'https://pixel-manager.web.app/sdk/landing-tracking-sdk.iife.js';

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.stubEnv('VITE_LTM_SITE_ID', 'test');
  vi.stubEnv('VITE_LTM_TEST_ALLOW_WITHOUT_CONSENT', 'true');
  document.head.querySelectorAll(`script[src="${SDK_URL}"]`).forEach((script) => script.remove());
  delete window.LandingTrackingSdk;
});

describe('Landing Tracking Manager common script', () => {
  it('loads once, passes published-config options and allows the test-site override', async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const TrackingSdk = vi.fn(function (options: unknown) {
      void options;
      return { start };
    });
    const tracking = await import('../src/services/landingTracking');

    const first = tracking.startLandingTracking();
    const second = tracking.startLandingTracking();
    const scripts = document.head.querySelectorAll(`script[src="${SDK_URL}"]`);
    expect(scripts).toHaveLength(1);

    Object.defineProperty(window, 'LandingTrackingSdk', {
      configurable: true,
      value: { TrackingSdk },
    });
    scripts[0].dispatchEvent(new Event('load'));
    await Promise.all([first, second]);

    expect(TrackingSdk).toHaveBeenCalledTimes(1);
    const options = TrackingSdk.mock.calls[0][0] as {
      siteId: string;
      configUrl: string;
      hasConsent: () => boolean;
      verifyCompletionToken: () => null;
      onDiagnostic: (signal: { kind: string; siteId: string; releaseVersion: number }) => void;
    };
    expect(options.siteId).toBe('test');
    expect(options.configUrl).toBe('https://pixel-manager.web.app/tracking-config');
    expect(options).not.toHaveProperty('adapters');
    expect(options.hasConsent()).toBe(true);
    expect(options.verifyCompletionToken()).toBeNull();

    const diagnosticFetch = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal('fetch', diagnosticFetch);
    options.onDiagnostic({ kind: 'ready', siteId: 'test', releaseVersion: 1 });
    expect(diagnosticFetch).toHaveBeenCalledWith(
      'https://pixel-manager.web.app/tracking-diagnostic',
      {
        method: 'POST',
        mode: 'cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ kind: 'ready', siteId: 'test', releaseVersion: 1 }),
      },
    );

    tracking.setLandingTrackingConsentProvider(() => false);
    expect(options.hasConsent()).toBe(false);
    tracking.setLandingTrackingConsentProvider(() => true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    expect(options.hasConsent()).toBe(true);
  });

  it('does not apply the test override to another site ID', async () => {
    vi.stubEnv('VITE_LTM_SITE_ID', 'production-site');
    const TrackingSdk = vi.fn(function (options: unknown) {
      void options;
      return { start: vi.fn().mockResolvedValue(undefined) };
    });
    Object.defineProperty(window, 'LandingTrackingSdk', {
      configurable: true,
      value: {
        TrackingSdk,
      },
    });
    const tracking = await import('../src/services/landingTracking');
    await tracking.startLandingTracking();
    const options = TrackingSdk.mock.calls[0][0] as { hasConsent: () => boolean };
    expect(options.hasConsent()).toBe(false);
  });

  it('does not interrupt the app when the SDK script fails to load', async () => {
    const tracking = await import('../src/services/landingTracking');
    const pending = tracking.startLandingTracking();
    const script = document.head.querySelector(`script[src="${SDK_URL}"]`);
    expect(script).not.toBeNull();
    script?.dispatchEvent(new Event('error'));
    await expect(pending).resolves.toBeUndefined();
    expect(document.head.querySelector(`script[src="${SDK_URL}"]`)).toBeNull();
  });

  it('does not interrupt the app when a published config is unavailable', async () => {
    const start = vi.fn().mockRejectedValue(new Error('Config HTTP 404'));
    Object.defineProperty(window, 'LandingTrackingSdk', {
      configurable: true,
      value: {
        TrackingSdk: function () {
          return { start };
        },
      },
    });
    const tracking = await import('../src/services/landingTracking');
    await expect(tracking.startLandingTracking()).resolves.toBeUndefined();
    expect(start).toHaveBeenCalledOnce();
  });
});

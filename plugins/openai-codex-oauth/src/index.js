import { createController, KEY, PROVIDER } from './host/controller.js';
import { createHandler, PATH } from './host/routes.js';
import { openBrowser } from './host/browser.js';

export const name = 'wangzf-openai-codex-oauth';
const required = {
  authorization: ['describe', 'begin'], credentials: ['describeRecord'], llm: ['listConfigurableProviders'],
  settings: ['describe'], connection: ['requestRejection', 'admit'], webServer: ['register', 'getOrigin'],
};
export const inject = Object.keys(required);

// DSH supplies these Services. No SDK or pi-ai duplicate is bundled/imported.
export function metadataReader(ctx) {
  return async () => {
    const entries = ctx.llm.listConfigurableProviders().filter(p => p.provider === PROVIDER);
    const entry = entries.length === 1 ? entries[0] : undefined;
    const record = await ctx.credentials.describeRecord(KEY);
    const descriptor = entry ? ctx.settings.describe({ redactSecrets: true }).find(d => d.ns === entry.settingsNs) : undefined;
    let profile = descriptor?.value;
    for (const segment of entry?.settingsPath ?? []) profile = profile?.[segment];
    // Only presence, never reference names, masked previews, values or entire descriptors.
    const override = descriptor ? Boolean(profile && Object.hasOwn(profile, 'apiKeyEnv')) : null;
    return {
      settingsNs: entry?.settingsNs ?? null,
      configured: record.configured === true,
      grantSaved: record.configured === false || record.kind === 'api-key' ? false
        : record.configured === true && record.kind === 'grant' ? true : null,
      writable: record.writable === true && process.platform === 'darwin',
      apiKeyOverride: override,
    };
  };
}
export function apply(ctx) {
  ctx.effect(() => {
    // Cordis checks service presence; also reject renamed/missing methods before exposing the route.
    for (const [key, methods] of Object.entries(required)) {
      if (!methods.every(method => typeof ctx[key]?.[method] === 'function')) throw new Error('UNAVAILABLE');
    }
    const controller = createController({ authorization: ctx.authorization, metadata: metadataReader(ctx),
      openBrowser, callbackHost: () => process.env.PI_OAUTH_CALLBACK_HOST });
    let unregister;
    try {
      unregister = ctx.webServer.register({ kind: 'exact', path: PATH,
        handler: createHandler({ connection: ctx.connection, getOrigin: () => ctx.webServer.getOrigin(), controller }) });
    } catch (error) { controller.dispose(); throw error; }
    return () => { unregister(); controller.dispose(); };
  }, 'codex entry: owner-only route and attempt lifetime');
}

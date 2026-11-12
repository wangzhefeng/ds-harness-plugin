// This factory is assembled with the browser-only modules and dictionaries.
// React is the only module-table import; no private Harness Client imports.
export function entryFactory(require, createEntryClient, createEntryViews, dictionaries) {
  const React = require('react');
  return {
    inject: ['slots', 'locale'],
    apply(ctx) {
      ctx.effect(() => {
        const ns = 'wangzf.codex-entry';
        const locales = [ctx.locale.register(ns, 'zh', dictionaries.zh), ctx.locale.register(ns, 'en', dictionaries.en)];
        const client = createEntryClient({ fetch: window.fetch.bind(window), crypto: window.crypto });
        const views = createEntryViews(React, client, ctx.locale, ctx.locale.bind(ns));
        let currentKey, cardDispose;
        const sync = () => {
          const key = client.getSnapshot().settingsNs;
          if (!key || key === currentKey) return;
          cardDispose?.();
          currentKey = key;
          cardDispose = ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
            name: 'settings.models.provider-card', key,
          }, views.Card));
        };
        const unsubscribe = client.subscribe(sync);
        const footerDispose = ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
          name: 'settings.models.footer', id: 'wangzf-codex-entry-connection', order: 90,
        }, views.Fallback));
        const pagehide = () => { void client.cancel(); }; // Keep BFCache-restored pages usable.
        window.addEventListener('pagehide', pagehide);
        void client.refresh();
        return () => {
          window.removeEventListener('pagehide', pagehide);
          unsubscribe(); cardDispose?.(); footerDispose(); client.dispose();
          for (const dispose of locales) dispose();
        };
      }, 'codex entry: UI, ephemeral transport and locale');
    },
  };
}

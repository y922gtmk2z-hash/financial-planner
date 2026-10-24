/* Settings: how the planner looks on this device. Not part of your plan. */
(function (FP) {
  'use strict';

  const { h } = FP.dom;

  function render(root) {
    FP.dom.add(root,
      h('h1', null, 'Settings'),
      h('p', { class: 'lead' }, 'These apply to this browser only. They don’t change your figures or your plan.'),
      h('section', { class: 'card', 'aria-labelledby': 'set-look' },
        h('h2', { id: 'set-look' }, 'Appearance'),
        FP.field.render({
          label: 'Theme', type: 'toggle',
          help: 'System follows your device’s light or dark setting.',
          options: [{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
        }, { value: FP.theme.get(), onChange: (v) => FP.theme.set(v) })),
      h('p', { class: 'muted small' }, 'Whether projections show today’s money or future money is in ', h('a', { href: '#setup/projections' }, 'Your figures'), '. Backups, import and clearing your data are in ', h('a', { href: '#data' }, 'Your data'), '.'));
  }

  FP.screens = FP.screens || {};
  FP.screens.settings = { title: 'Settings', render };
})(globalThis.FP = globalThis.FP || {});

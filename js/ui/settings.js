/* Settings: how the planner looks and shows amounts on this device. Not part of your plan. */
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
      h('section', { class: 'card', id: 'projections', 'aria-labelledby': 'set-proj' },
        h('h2', { id: 'set-proj' }, 'Projections'),
        FP.field.render({
          label: 'Show amounts in', type: 'toggle',
          help: 'Today\u2019s money removes inflation so amounts are comparable with now. Future money shows the actual pounds in each year. You can also switch on Future and Scenarios.',
          options: [{ value: 'real', label: 'Today\u2019s money' }, { value: 'nominal', label: 'Future money' }],
        }, { value: FP.screens.future.getView(), onChange: (v) => FP.screens.future.setView(v) })),
      h('p', { class: 'muted small' }, 'Backups, import and clearing your data are in ', h('a', { href: '#data' }, 'Your data'), '.'));
  }

  FP.screens = FP.screens || {};
  FP.screens.settings = { title: 'Settings', render };
})(globalThis.FP = globalThis.FP || {});

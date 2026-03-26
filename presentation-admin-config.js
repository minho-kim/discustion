window.PRESENTATION_ADMIN_CONFIG = Object.freeze({
  enabled: true,
  rememberMinutes: 480,
  pages: Object.freeze({
    input: Object.freeze({
      scope: 'input',
      storageKey: 'discussion_presentation_input_admin_session'
    }),
    control: Object.freeze({
      scope: 'control',
      storageKey: 'discussion_presentation_control_admin_session'
    })
  })
});

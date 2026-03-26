window.PRESENTATION_ADMIN_CONFIG = Object.freeze({
  enabled: true,
  rememberMinutes: 480,
  pages: Object.freeze({
    input: Object.freeze({
      pin: '1111',
      storageKey: 'discussion_presentation_input_unlock_until'
    }),
    control: Object.freeze({
      pin: '3333',
      storageKey: 'discussion_presentation_control_unlock_until'
    })
  })
});

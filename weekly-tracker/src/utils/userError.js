const SAFE_MESSAGES = {
  auth: 'We could not sign you in. Check your email and password, then try again.',
  password: 'We could not update your password. Please try again.',
  load: 'We could not load this information. Please try again.',
  save: 'We could not save your changes. Your input is still available; please try again.',
  upload: 'The photo could not be uploaded. Check your connection and try again.',
};

export function userSafeError(context = 'load') {
  return SAFE_MESSAGES[context] ?? 'Something went wrong. Please try again.';
}

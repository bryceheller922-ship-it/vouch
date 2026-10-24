/** Maps RPC exception codes (raised in SQL) to friendly copy. */
const MESSAGES: Record<string, string> = {
  not_authenticated: 'Your session expired. Log in again.',
  onboarding_required: 'Finish setting up your profile first.',
  school_not_found: 'We couldn’t find that school.',
  school_locked: 'You’re already locked in to a school. Contact support to switch.',
  school_email_required: 'This school requires signing in with your school email.',
  invalid_instagram_handle: 'That doesn’t look like an Instagram handle.',
  instagram_handle_taken: 'That @ is already claimed. If it’s yours, contact support.',
  invalid_display_name: 'Add your first name (1–40 characters).',
  grade_and_gender_required: 'Pick your grade and gender to continue.',
  poll_not_found: 'That poll disappeared. Loading a new one…',
  poll_closed: 'That poll just closed. Loading the next one…',
  cannot_vote_for_self: 'Nice try. You can’t vote for yourself 😅',
  nominee_not_found: 'That person isn’t available anymore.',
  vote_not_found: 'We couldn’t find that vote.',
  share_link_not_found: 'Share link expired. Try again.',
  share_link_already_used: 'That share already unlocked a hint. Share again for another.',
  all_hints_unlocked: 'You’ve unlocked every hint for this one.',
}

export function friendlyError(error: unknown, fallback = 'Something went wrong. Try again.') {
  const raw =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : ''
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k))
  return code ? MESSAGES[code] : raw && raw.length < 140 ? raw : fallback
}

export function errorCode(error: unknown) {
  const raw = error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : ''
  return Object.keys(MESSAGES).find((k) => raw.includes(k)) ?? null
}

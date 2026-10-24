export type Grade = 'freshman' | 'sophomore' | 'junior' | 'senior' | 'grad'
export type Gender = 'guy' | 'girl' | 'nonbinary'
export type RevealType = 'gender' | 'grade' | 'initial'
export type PollCategory = 'vibes' | 'style' | 'brains' | 'hype' | 'funny' | 'kind' | 'future'

export const GRADES: Grade[] = ['freshman', 'sophomore', 'junior', 'senior', 'grad']
export const GENDERS: Gender[] = ['guy', 'girl', 'nonbinary']
export const REVEAL_ORDER: RevealType[] = ['gender', 'grade', 'initial']

/** Shape returned by `rpc('get_my_profile')`. */
export interface MyProfile {
  id: string
  email: string | null
  instagram_handle: string | null
  display_name: string | null
  school_id: string | null
  school_name: string | null
  school_city: string | null
  school_student_count: number | null
  grade: Grade | null
  gender: Gender | null
  avatar_url: string | null
  vote_points: number
  invite_code: string
  onboarded: boolean
  votes_received: number
  unread_count: number
  friends_invited: number
}

/** Row returned by `rpc('search_schools')`. */
export interface SchoolOption {
  id: string
  name: string
  city: string
  student_count: number
  requires_school_email: boolean
  email_domain: string | null
  email_matches: boolean
}

export interface Nominee {
  id: string
  display_name: string
  instagram_handle: string
  avatar_url: string | null
  grade: Grade
}

export interface Poll {
  id: string
  question_text: string
  emoji: string
  category: PollCategory
  active_until: string
}

/** Shape returned by `get_next_round` / `cast_vote` / `skip_poll`. */
export interface Round {
  poll: Poll | null
  nominees: Nominee[]
  progress: { answered: number; total: number }
  classmates: number
  next_drop_at: string
}

export type Hints = Partial<Record<RevealType, string>>

/** Row returned by `rpc('get_my_inbox')`. Never contains voter identity. */
export interface InboxItem {
  vote_id: string
  poll_id: string
  question_text: string
  emoji: string
  category: PollCategory
  received_at: string
  is_new: boolean
  hints: Hints
  next_reveal: RevealType | null
}

export interface Trophy {
  question_text: string
  emoji: string
  category: PollCategory
  vote_count: number
  last_received_at: string
}

export interface SharePreview {
  kind: 'vote' | 'invite'
  code: string
  question_text: string | null
  emoji: string | null
  school_name: string | null
  display_name: string | null
  instagram_handle: string | null
  vote_count: number
}

export interface UnlockResult {
  vote_id: string
  reveal_type: RevealType
  hint_value: string
  hints: Hints
  next_reveal: RevealType | null
}

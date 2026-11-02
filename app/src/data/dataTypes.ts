export interface ProfileRow {
  id: string
  created_at: string
  updated_at: string
  last_active_deck_id: string | null
  user_deck_preferences?: DeckPreferenceRow[]
  pending?: 0 | 1
  revision?: number
}

export interface DeckPreferenceRow {
  user_id: string
  deck_id: string
  last_selected_direction_id: string | null
  last_selected_tag_id: string | null
  updated_at: string
  pending?: 0 | 1
  revision?: number
}

export interface DeckRow {
  id: string
  user_id: string
  title: string
  side_labels: string[]
  created_at: string
  updated_at: string
}

export interface CardRow {
  id: string
  deck_id: string
  user_id: string
  content: Record<string, string>
  created_at: string
  updated_at: string
}

export interface CardRowWithTagIds extends CardRow {
  tag_ids: string[]
}

export interface TagRow {
  id: string
  deck_id: string
  name: string
  created_at: string
}

export interface DirectionRow {
  id: string
  deck_id: string
  configuration: Array<{ side: number; role: 'question' | 'answer' | 'extra' }>
  created_at: string
}

export interface ProgressRow {
  id: string
  user_id: string
  card_id: string
  direction_id: string
  counter: number
  last_updated: string
}

export interface LocalProgressRow extends ProgressRow {
  pending: 0 | 1
  revision: number
}

export interface LocalProfileRow extends ProfileRow {
  pending: 0 | 1
  revision: number
}

export interface LocalDeckPreferenceRow extends DeckPreferenceRow {
  pending: 0 | 1
  revision: number
}

export interface PendingChanges {
  progress: LocalProgressRow[]
  profiles: LocalProfileRow[]
  preferences: LocalDeckPreferenceRow[]
}

export interface GlobalSyncData {
  profile: ProfileRow
  preferences: DeckPreferenceRow[]
  decks: DeckRow[]
}

export interface DeckSyncData {
  cards: CardRowWithTagIds[]
  tags: TagRow[]
  directions: DirectionRow[]
  progress: ProgressRow[]
}

export interface SyncUnit {
  global: GlobalSyncData
  deck: (DeckRow & DeckSyncData) | null
}

// Character activity log (step 5b): posts about a character, notes and the
// existing history entries, merged newest first. Pure functions, no I/O.
import type { CharacterEvent, CharacterSummary } from '../characters/characterModel'

export const NOTE_VISIBILITIES = ['author', 'gm', 'everyone'] as const
export type NoteVisibility = (typeof NOTE_VISIBILITIES)[number]

export function isNoteVisibility(value: unknown): value is NoteVisibility {
  return typeof value === 'string' && (NOTE_VISIBILITIES as readonly string[]).includes(value)
}

/** Who may see a note, as its writer reads it. */
export const NOTE_VISIBILITY_LABELS: Record<NoteVisibility, string> = {
  author: 'Me and the GM',
  gm: 'GM only',
  everyone: 'Everyone',
}

/** The choices a writer has: the GM (GM only / everyone), a player (me + GM / everyone). */
export function noteChoices(isGM: boolean): NoteVisibility[] {
  return isGM ? ['gm', 'everyone'] : ['author', 'everyone']
}

export const POST_KINDS = ['spoke', 'posted', 'mentioned'] as const
export type PostKind = (typeof POST_KINDS)[number]

export function isPostKind(value: unknown): value is PostKind {
  return typeof value === 'string' && (POST_KINDS as readonly string[]).includes(value)
}

export interface ActivityPost {
  id: string
  kind: PostKind
  senderId: string | null
  type: string
  content: string
  npcName: string | null
  subChannelId: string | null
  whisper: boolean
  createdAt: string
}

/** What a note from elsewhere was written on (a note that tags this subject). */
export interface NoteAbout {
  type: 'character' | 'record'
  id: string
  /** Null when the viewer can't see it (hidden since). */
  name: string | null
  /** 'pc' / 'npc' for characters, the record kind for records. */
  kind: string
}

export interface ActivityNote {
  id: string
  authorId: string | null
  authorCharacterName: string | null
  body: string
  visibility: NoteVisibility
  inGameDay: number | null
  createdAt: string
  edited: boolean
  /** Set for a note written elsewhere that tags this subject; it is changed on its own page. */
  about?: NoteAbout
}

/** A history entry of a character (or, for records, a record): anything with an id and a time. */
export interface ActivityChange {
  id: string
  createdAt: string
}

export type ActivityEntry<E extends ActivityChange = CharacterEvent> =
  | { kind: 'post'; at: string; post: ActivityPost }
  | { kind: 'note'; at: string; note: ActivityNote }
  | { kind: 'change'; at: string; event: E }

export const FILTERS = ['all', 'posts', 'mentions', 'notes', 'changes'] as const
export type ActivityFilter = (typeof FILTERS)[number]

export const FILTER_LABELS: Record<ActivityFilter, string> = {
  all: 'All',
  posts: 'Posts',
  mentions: 'Mentions',
  notes: 'Notes',
  changes: 'Changes',
}

function matches<E extends ActivityChange>(entry: ActivityEntry<E>, filter: ActivityFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'posts':
      return entry.kind === 'post' && entry.post.kind !== 'mentioned'
    case 'mentions':
      return (entry.kind === 'post' && entry.post.kind === 'mentioned') || (entry.kind === 'note' && !!entry.note.about)
    case 'notes':
      return entry.kind === 'note'
    case 'changes':
      return entry.kind === 'change'
  }
}

/**
 * Everything merged, newest first. Changes and notes older than the oldest
 * loaded post are held back while older posts remain to be loaded, so the list
 * never shows a gap that "Load older posts" would later fill in the middle.
 */
export function buildActivity<E extends ActivityChange = CharacterEvent>(
  posts: ActivityPost[],
  notes: ActivityNote[],
  events: E[],
  filter: ActivityFilter,
  morePosts: boolean,
): ActivityEntry<E>[] {
  const oldestPost = posts.length > 0 ? posts[posts.length - 1].createdAt : null
  const cutoff = morePosts && oldestPost ? Date.parse(oldestPost) : null
  const all: ActivityEntry<E>[] = [
    ...posts.map(post => ({ kind: 'post' as const, at: post.createdAt, post })),
    ...notes.map(note => ({ kind: 'note' as const, at: note.createdAt, note })),
    ...events.map(event => ({ kind: 'change' as const, at: event.createdAt, event })),
  ]
  return all
    .filter(entry => matches(entry, filter))
    .filter(entry => entry.kind === 'post' || cutoff === null || Date.parse(entry.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
}

/**
 * Words to look for in posts: the name, and for the GM the aliases (which are
 * GM secrets, so players never search for them). Very short names are skipped.
 */
export function searchTerms(subject: Pick<CharacterSummary, 'name' | 'aliases'>, isGM: boolean): string[] {
  const names = [subject.name, ...(isGM ? (subject.aliases ?? []) : [])]
  return [...new Set(names.map(n => n.trim()).filter(n => n.length >= 2))]
}

// cspell:words unlinkify
import { useMemo, useState, type ReactNode } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { useAuthorLookup } from '../authorship/authorshipContext'
import { useCalendar } from '../calendar/calendarContext'
import { dateAt, dayToIso, formatDay, isoToDay } from '../calendar/calendarModel'
import { HistoryEntry } from '../characters/CharacterHistory'
import type { CharacterEvent, CharacterSummary } from '../characters/characterModel'
import { BADGE, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import * as api from './activityApi'
import {
  FILTERS,
  FILTER_LABELS,
  NOTE_VISIBILITY_LABELS,
  buildActivity,
  noteChoices,
  searchTerms,
  type ActivityChange,
  type ActivityFilter,
  type ActivityNote,
  type ActivityPost,
  type NoteVisibility,
} from './activityModel'
import { useOpenPost } from './openPostContext'
import { NoteBody, PostBody, isLongPost } from './PostBody'
import { useNpcTags } from '../npcTags/npcTagContext'
import { unlinkifyNpcTags } from '../npcTags/npcTagModel'
import { TagTextarea } from '../npcTags/TagTextarea'
import type { ActivityData } from './useActivity'
import { useCharacterActivity } from './useCharacterActivity'

interface CharacterActivityProps {
  channelId: string
  character: CharacterSummary
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
  /** History entries (status, role, profile and sheet changes). */
  events: CharacterEvent[]
  nameOf: (userId: string) => string
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const ENTRY = 'border-l-2 pl-3'
/** Notes are stored with their tags as links; the database allows 2,000 characters. */
const NOTE_MAX = 2000

/** How notes are written for one subject (a character or a record). */
export interface NoteActions {
  add: (body: string, visibility: NoteVisibility, day: number | null) => Promise<void>
  update: (noteId: string, body: string, visibility: NoteVisibility, day: number | null) => Promise<void>
  remove: (noteId: string) => Promise<void>
}

/**
 * A character's Activity tab (step 5b): posts as or about them, notes and
 * history, newest first. Everything is loaded with the viewer's own access.
 */
export function CharacterActivity({ channelId, character, isGM, isArchived, myUserId, events, nameOf }: CharacterActivityProps) {
  const terms = useMemo(() => searchTerms(character, isGM), [character, isGM])
  const npcName = character.kind === 'npc' ? character.name : null
  const data = useCharacterActivity(channelId, character.id, npcName, terms)
  const notes = useMemo<NoteActions>(
    () => ({
      add: (body, visibility, day) => api.addNote(character.id, body, visibility, day),
      update: api.updateNote,
      remove: api.deleteNote,
    }),
    [character.id],
  )
  return (
    <ActivityLog
      data={data}
      events={events}
      renderChange={(event, extra) => <HistoryEntry event={event} isGM={isGM} nameOf={nameOf} extra={extra} />}
      subjectName={character.name}
      subjectNoun="character"
      isGM={isGM}
      isArchived={isArchived}
      myUserId={myUserId}
      nameOf={nameOf}
      notes={notes}
    />
  )
}

interface ActivityLogProps<E extends ActivityChange> {
  data: ActivityData
  /** History entries, drawn by `renderChange` (with the in-game date as `extra`). */
  events: E[]
  renderChange: (event: E, extra: ReactNode) => ReactNode
  /** "Dr Hale spoke…" */
  subjectName: string
  /** Used in the note box: "Add a note about this character / record". */
  subjectNoun: string
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
  nameOf: (userId: string) => string
  notes: NoteActions
  /** Filter buttons to offer (records have no "Posts", only mentions). */
  filters?: readonly ActivityFilter[]
}

/** The shared Activity list (characters and records): note box, filters, posts, notes and history. */
export function ActivityLog<E extends ActivityChange>({
  data,
  events,
  renderChange,
  subjectName,
  subjectNoun,
  isGM,
  isArchived,
  myUserId,
  nameOf,
  notes: noteActions,
  filters = FILTERS,
}: ActivityLogProps<E>) {
  const { posts, notes, rooms, morePosts, loading, loadingOlder, error, reload, loadOlder } = data
  const { changes } = useCalendar()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const entries = useMemo(() => buildActivity(posts, notes, events, filter, morePosts), [posts, notes, events, filter, morePosts])

  const inGameAt = (at: string, subChannelId: string | null) => {
    const date = dateAt(changes, subChannelId, Date.parse(at))
    return date ? formatDay(date.day) : null
  }

  return (
    <div className="space-y-3">
      {!isArchived && (
        <NoteForm
          isGM={isGM}
          subjectNoun={subjectNoun}
          defaultDay={dateAt(changes, null)?.day ?? null}
          onSave={async (body, visibility, day) => {
            await noteActions.add(body, visibility, day)
            reload()
          }}
        />
      )}

      <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
        {filters.map(f => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600'
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span>Couldn't load the activity.</span>
          <button type="button" onClick={reload} className={BTN_SECONDARY}>
            Retry
          </button>
        </div>
      )}

      {loading && posts.length === 0 && notes.length === 0 ? (
        <div className="animate-pulse space-y-3" aria-label="Loading activity">
          <div className="h-4 w-3/4 rounded bg-surface-200 dark:bg-surface-700" />
          <div className="h-4 w-1/2 rounded bg-surface-200 dark:bg-surface-700" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-surface-500 dark:text-surface-400">{filter === 'all' ? 'Nothing yet.' : `No ${FILTER_LABELS[filter].toLowerCase()} yet.`}</p>
      ) : (
        <ol className="space-y-3" aria-label="Activity">
          {entries.map(entry =>
            entry.kind === 'post' ? (
              <li key={`p-${entry.post.id}`} className={`${ENTRY} border-primary-300 dark:border-primary-700`}>
                <PostEntry post={entry.post} subjectName={subjectName} roomName={entry.post.subChannelId ? (rooms.get(entry.post.subChannelId) ?? 'a room') : 'Main'} inGame={inGameAt(entry.at, entry.post.subChannelId)} nameOf={nameOf} />
              </li>
            ) : entry.kind === 'note' ? (
              <li key={`n-${entry.note.id}`} className={`${ENTRY} border-amber-300 dark:border-amber-700`}>
                <NoteEntry note={entry.note} isGM={isGM} subjectNoun={subjectNoun} mine={!!myUserId && entry.note.authorId === myUserId} canChange={!isArchived} nameOf={nameOf} actions={noteActions} onChanged={reload} />
              </li>
            ) : (
              <li key={`c-${entry.event.id}`} className={`${ENTRY} border-surface-200 dark:border-surface-700`}>
                {renderChange(entry.event, <InGame label={inGameAt(entry.at, null)} />)}
              </li>
            ),
          )}
        </ol>
      )}

      {morePosts && (
        <button type="button" className={BTN_SECONDARY} onClick={() => void loadOlder()} disabled={loadingOlder}>
          {loadingOlder ? 'Loading…' : 'Load older posts'}
        </button>
      )}
    </div>
  )
}

export function InGame({ label }: { label: string | null }) {
  return label ? <span>· In game: {label}</span> : null
}

const POST_VERB: Record<ActivityPost['kind'], string> = { spoke: 'spoke', posted: 'posted', mentioned: 'Mentioned' }

function PostEntry({
  post,
  subjectName,
  roomName,
  inGame,
  nameOf,
}: {
  post: ActivityPost
  subjectName: string
  roomName: string
  inGame: string | null
  nameOf: (userId: string) => string
}) {
  const openPost = useOpenPost()
  const authorAt = useAuthorLookup()
  const [expanded, setExpanded] = useState(false)
  const writer =
    post.type === 'npc'
      ? (post.npcName ?? 'An NPC')
      : (authorAt(post.senderId, post.createdAt)?.name ?? (post.senderId ? nameOf(post.senderId) : 'Someone'))
  const long = isLongPost(post.content)

  return (
    <>
      <p className="text-xs font-medium text-surface-600 dark:text-surface-300">
        {post.kind === 'mentioned' ? `Mentioned by ${writer}` : `${subjectName} ${POST_VERB[post.kind]}`} in {roomName}
        {post.whisper && <span className={`${BADGE} ml-1 bg-surface-100 dark:bg-surface-700`}>Whisper</span>}
      </p>
      <PostBody content={post.content} collapsed={long && !expanded} />
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
        <time dateTime={post.createdAt}>{dateFormat.format(new Date(post.createdAt))}</time>
        <InGame label={inGame} />
        {long && (
          <button type="button" className="text-primary-600 hover:underline dark:text-primary-400" onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Show less' : 'Show all'}
          </button>
        )}
        {openPost && (
          <button type="button" className="text-primary-600 hover:underline dark:text-primary-400" onClick={() => openPost(post.id, post.subChannelId)}>
            Go to post
          </button>
        )}
      </p>
    </>
  )
}

function NoteEntry({
  note,
  isGM,
  subjectNoun,
  mine,
  canChange,
  nameOf,
  actions,
  onChanged,
}: {
  note: ActivityNote
  isGM: boolean
  subjectNoun: string
  mine: boolean
  canChange: boolean
  nameOf: (userId: string) => string
  actions: NoteActions
  onChanged: () => void
}) {
  const { addToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const author = note.authorId ? nameOf(note.authorId) : 'A former player'
  const by = note.authorCharacterName ? `${author} (as ${note.authorCharacterName})` : author

  if (editing) {
    return (
      <NoteForm
        isGM={isGM}
        subjectNoun={subjectNoun}
        initial={note}
        defaultDay={note.inGameDay}
        onCancel={() => setEditing(false)}
        onSave={async (body, visibility, day) => {
          await actions.update(note.id, body, visibility, day)
          setEditing(false)
          onChanged()
        }}
      />
    )
  }

  const remove = async () => {
    try {
      await actions.remove(note.id)
      addToast('Note deleted.', 'success')
      onChanged()
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not delete the note.', 'error')
    }
  }

  return (
    <>
      <p className="text-xs font-medium text-surface-600 dark:text-surface-300">
        Note by {by}
        <span className={`${BADGE} ml-1 bg-surface-100 dark:bg-surface-700`}>{NOTE_VISIBILITY_LABELS[note.visibility]}</span>
      </p>
      <NoteBody content={note.body} />
      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
        <time dateTime={note.createdAt}>{dateFormat.format(new Date(note.createdAt))}</time>
        {note.inGameDay !== null && <span>· In game: {formatDay(note.inGameDay)}</span>}
        {note.edited && <span>(edited)</span>}
        {canChange && mine && (
          <button type="button" className="text-primary-600 hover:underline dark:text-primary-400" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        {canChange && (mine || isGM) && !confirming && (
          <button type="button" className="text-red-600 hover:underline dark:text-red-400" onClick={() => setConfirming(true)}>
            Delete
          </button>
        )}
        {confirming && (
          <span className="flex items-center gap-2">
            Delete this note?
            <button type="button" className="font-medium text-red-600 hover:underline dark:text-red-400" onClick={() => void remove()}>
              Yes, delete
            </button>
            <button type="button" className="hover:underline" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        )}
      </p>
    </>
  )
}

function NoteForm({
  isGM,
  subjectNoun,
  initial,
  defaultDay,
  onSave,
  onCancel,
}: {
  isGM: boolean
  subjectNoun: string
  initial?: ActivityNote
  defaultDay: number | null
  onSave: (body: string, visibility: NoteVisibility, day: number | null) => Promise<void>
  onCancel?: () => void
}) {
  const { addToast } = useToast()
  const choices = noteChoices(isGM)
  const tags = useNpcTags()
  const [body, setBody] = useState(initial ? unlinkifyNpcTags(initial.body) : '')
  const [visibility, setVisibility] = useState<NoteVisibility>(initial && choices.includes(initial.visibility) ? initial.visibility : choices[0])
  const [iso, setIso] = useState(defaultDay !== null ? dayToIso(defaultDay) : '')
  const [saving, setSaving] = useState(false)
  const day = iso.trim() ? isoToDay(iso) : null
  const badDate = iso.trim() !== '' && day === null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!body.trim() || badDate) return
    setSaving(true)
    try {
      const text = tags ? await tags.linkify(body.trim()) : body.trim()
      if (text.length > NOTE_MAX) {
        addToast('This note is too long once its tags are added. Shorten it a little.', 'error')
        return
      }
      await onSave(text, visibility, day)
      if (!initial) {
        setBody('')
        addToast('Note added.', 'success')
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Could not save the note.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-surface-200 p-2 dark:border-surface-700" aria-label={initial ? 'Edit note' : 'Add a note'}>
      <TagTextarea
        value={body}
        onChange={setBody}
        maxLength={NOTE_MAX}
        rows={2}
        placeholder={isGM ? `Add a note about this ${subjectNoun}` : 'Note what your character learned'}
        aria-label={initial ? 'Note text' : 'New note'}
        className={INPUT}
      />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${LABEL} w-auto`}>
          Who can see it
          <select value={visibility} onChange={e => setVisibility(e.target.value as NoteVisibility)} className={`${INPUT} mt-1 w-auto py-1`}>
            {choices.map(v => (
              <option key={v} value={v}>
                {NOTE_VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={`${LABEL} w-auto`}>
          In-game date
          <input type="date" value={iso} onChange={e => setIso(e.target.value)} className={`${INPUT} mt-1 w-auto py-1`} aria-invalid={badDate} />
        </label>
        <button type="submit" className={BTN_PRIMARY} disabled={saving || !body.trim() || badDate}>
          {saving ? 'Saving…' : initial ? 'Save' : 'Add note'}
        </button>
        {onCancel && (
          <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
      {badDate && <p className="text-xs text-red-600 dark:text-red-400">Enter a full date, or leave it empty.</p>}
    </form>
  )
}

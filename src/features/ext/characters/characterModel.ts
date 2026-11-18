// Pure data model for the characters panel: labels, roles, editing drafts and
// the plain-language text for warnings and history. No Supabase access here.

export type CharacterKind = 'pc' | 'npc'
export type Visibility = 'players' | 'owner' | 'gm'
export type ItemType = 'field' | 'heading'
/**
 * Roles as the app shows them. In the database a PC is either in play or out
 * of play; an in-play PC whose status isn't Active is shown as Reserve
 * (backup, wounded, on hiatus). Out of play is shown as Retired.
 */
export type Role = 'pc_in_play' | 'pc_reserve' | 'pc_out_of_play' | 'npc'

export const STATUSES = [
  'active',
  'backup',
  'unavailable',
  'incapacitated',
  'missing',
  'insane',
  'retired',
  'deceased',
] as const
export type Status = (typeof STATUSES)[number]

export const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  backup: 'Backup',
  unavailable: 'Temporarily unavailable',
  incapacitated: 'Incapacitated',
  missing: 'Missing',
  insane: 'Insane',
  retired: 'Retired',
  deceased: 'Deceased',
}

/** Statuses a player may set on their own in-play PC (the rest are GM-only). */
export const TEMPORARY_STATUSES: readonly Status[] = ['active', 'backup', 'unavailable', 'incapacitated']

export function isTemporaryStatus(status: Status | null): boolean {
  return status !== null && TEMPORARY_STATUSES.includes(status)
}

export const ROLE_LABELS: Record<Role, string> = {
  pc_in_play: 'PC – active',
  pc_reserve: 'PC – reserve',
  pc_out_of_play: 'PC – retired',
  npc: 'NPC',
}

/** Longer labels for the GM's role dropdown. */
export const ROLE_OPTION_LABELS: Record<Role, string> = {
  pc_in_play: 'PC – active (in play, can be posted as)',
  pc_reserve: 'PC – reserve (backup, wounded, on hiatus)',
  pc_out_of_play: 'PC – retired (dead, insane, left the story)',
  npc: 'NPC',
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  players: 'Everyone',
  owner: 'Owner',
  gm: 'GM only',
}

export const VISIBILITY_HINTS: Record<Visibility, string> = {
  players: 'All players can read these.',
  owner: "This character's player and the GM.",
  gm: 'Only the GM.',
}

// Database limits (see the ext_ migrations).
export const LIMITS = {
  name: 80,
  label: 60,
  body: 8000,
  alias: 40,
  aliases: 10,
  tag: 40,
  note: 2000,
  roleNote: 500,
  portraitUrl: 500,
  // Upstream shows at most 20 characters of a posting name.
  postingName: 20,
} as const

/** One character as the list shows it. GM-only fields are absent for players. */
export interface CharacterSummary {
  id: string
  kind: CharacterKind
  inPlay: boolean
  name: string
  portraitUrl: string | null
  /** null when the viewer may not see the status. */
  status: Status | null
  ownerId: string | null
  isMine: boolean
  updatedAt: string
  // GM-only extras (undefined for players).
  revealed?: boolean
  statusVisible?: boolean
  aliases?: string[]
  tagIds?: string[]
}

export interface CharacterField {
  id: string
  characterId: string
  channelId: string
  itemType: ItemType
  fieldKey: string | null
  label: string
  body: string
  visibility: Visibility
  private: boolean
  sortOrder: number
}

export interface CharacterEvent {
  id: string
  eventType: string
  details: Record<string, unknown>
  note: string | null
  visibility: Visibility
  actorId: string | null
  createdAt: string
}

export interface Tag {
  id: string
  name: string
}

/**
 * The role shown for a character. An in-play PC is Reserve when its status
 * is known and not Active; when the viewer can't see the status it counts as
 * in play (see `roleLabel`).
 */
export function roleOf(c: { kind: CharacterKind; inPlay: boolean; status?: Status | null }): Role {
  if (c.kind === 'npc') return 'npc'
  if (!c.inPlay) return 'pc_out_of_play'
  return c.status && c.status !== 'active' ? 'pc_reserve' : 'pc_in_play'
}

/** Badge text; neutral "PC – in play" when the viewer can't see the status. */
export function roleLabel(c: { kind: CharacterKind; inPlay: boolean; status?: Status | null }): string {
  const role = roleOf(c)
  if (role === 'pc_in_play' && !c.status) return 'PC – in play'
  return ROLE_LABELS[role]
}

/**
 * Arguments for ext_set_role. Moving between Active and Reserve changes the
 * status in the same step (Reserve starts as Backup); otherwise the status is
 * left alone (`status` undefined).
 */
export function roleToArgs(
  role: Role,
  current?: { kind: CharacterKind; inPlay: boolean; status?: Status | null },
): { kind: CharacterKind; inPlay: boolean; status?: Status } {
  if (role === 'npc') return { kind: 'npc', inPlay: true }
  if (role === 'pc_out_of_play') return { kind: 'pc', inPlay: false }
  const currentRole = current ? roleOf(current) : null
  if (role === 'pc_in_play') {
    return current?.status && current.status !== 'active' ? { kind: 'pc', inPlay: true, status: 'active' } : { kind: 'pc', inPlay: true }
  }
  return currentRole === 'pc_reserve' ? { kind: 'pc', inPlay: true } : { kind: 'pc', inPlay: true, status: 'backup' }
}

export function isStatus(value: unknown): value is Status {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

/** The visibility columns a character's profile can have, left to right. */
export function columnsFor(kind: CharacterKind): Visibility[] {
  return kind === 'npc' ? ['players', 'gm'] : ['players', 'owner', 'gm']
}

/** Columns this viewer may move fields into while editing. */
export function editableColumns(kind: CharacterKind, isGM: boolean): Visibility[] {
  return columnsFor(kind).filter(v => isGM || v !== 'gm')
}

// ---------------------------------------------------------------------------
// Editing drafts
// ---------------------------------------------------------------------------

export interface DraftItem {
  /** Stable React key: the field id, or a temporary id for new items. */
  key: string
  id: string | null
  itemType: ItemType
  fieldKey: string | null
  label: string
  body: string
  visibility: Visibility
  private: boolean
}

export function toDraft(fields: CharacterField[]): DraftItem[] {
  return [...fields]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(f => ({
      key: f.id,
      id: f.id,
      itemType: f.itemType,
      fieldKey: f.fieldKey,
      label: f.label,
      body: f.body,
      visibility: f.visibility,
      private: f.private,
    }))
}

let tempCounter = 0
export function newDraftItem(itemType: ItemType, visibility: Visibility): DraftItem {
  tempCounter += 1
  return {
    key: `new-${tempCounter}`,
    id: null,
    itemType,
    fieldKey: null,
    label: itemType === 'heading' ? 'New heading' : 'New field',
    body: '',
    visibility,
    private: false,
  }
}

/** Items of one column, in display order. */
export function itemsIn(draft: DraftItem[], visibility: Visibility): DraftItem[] {
  return draft.filter(d => d.visibility === visibility)
}

/** Move an item up (-1) or down (+1) within its column. */
export function moveItem(draft: DraftItem[], key: string, direction: -1 | 1): DraftItem[] {
  const index = draft.findIndex(d => d.key === key)
  if (index < 0) return draft
  const column = draft[index].visibility
  let target = index + direction
  while (target >= 0 && target < draft.length && draft[target].visibility !== column) {
    target += direction
  }
  if (target < 0 || target >= draft.length) return draft
  const next = [...draft]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Move an item to another column (placed at the bottom of it). */
export function moveToColumn(draft: DraftItem[], key: string, visibility: Visibility): DraftItem[] {
  const item = draft.find(d => d.key === key)
  if (!item || item.visibility === visibility) return draft
  const moved = { ...item, visibility, private: visibility === 'owner' ? item.private : false }
  return [...draft.filter(d => d.key !== key), moved]
}

export function updateItem(draft: DraftItem[], key: string, patch: Partial<DraftItem>): DraftItem[] {
  return draft.map(d => (d.key === key ? { ...d, ...patch } : d))
}

export function removeItem(draft: DraftItem[], key: string): DraftItem[] {
  return draft.filter(d => d.key !== key)
}

/** May this viewer delete the item? Owners may only delete their custom items. */
export function canRemove(item: DraftItem, isGM: boolean): boolean {
  return isGM || item.fieldKey === null
}

export interface FieldInsert {
  item_type: ItemType
  label: string
  body: string
  visibility: Visibility
  private: boolean
  sort_order: number
}

export interface FieldChanges {
  deletes: string[]
  updates: { id: string; patch: Partial<FieldInsert> }[]
  inserts: FieldInsert[]
}

/** Per-column position → sort_order (10, 20, 30… within each column). */
function sortOrders(draft: DraftItem[]): Map<string, number> {
  const orders = new Map<string, number>()
  const counters: Record<string, number> = {}
  for (const item of draft) {
    counters[item.visibility] = (counters[item.visibility] ?? 0) + 1
    orders.set(item.key, counters[item.visibility] * 10)
  }
  return orders
}

/**
 * Work out the database writes needed to turn `original` into `draft`.
 * Only items that changed are written, so the GM's change log stays meaningful.
 */
export function diffFields(original: CharacterField[], draft: DraftItem[]): FieldChanges {
  const orders = sortOrders(draft)
  const draftIds = new Set(draft.filter(d => d.id).map(d => d.id))
  const changes: FieldChanges = {
    deletes: original.filter(f => !draftIds.has(f.id)).map(f => f.id),
    updates: [],
    inserts: [],
  }
  const byId = new Map(original.map(f => [f.id, f]))

  for (const item of draft) {
    const sortOrder = orders.get(item.key) ?? 0
    const label = item.label.trim()
    const body = item.itemType === 'heading' ? '' : item.body
    const isPrivate = item.visibility === 'owner' && item.private
    if (!item.id) {
      changes.inserts.push({
        item_type: item.itemType,
        label,
        body,
        visibility: item.visibility,
        private: isPrivate,
        sort_order: sortOrder,
      })
      continue
    }
    const before = byId.get(item.id)
    if (!before) continue
    const patch: Partial<FieldInsert> = {}
    if (label !== before.label) patch.label = label
    if (body !== before.body) patch.body = body
    if (item.visibility !== before.visibility) patch.visibility = item.visibility
    if (isPrivate !== before.private) patch.private = isPrivate
    if (sortOrder !== before.sortOrder) patch.sort_order = sortOrder
    if (Object.keys(patch).length > 0) changes.updates.push({ id: item.id, patch })
  }
  return changes
}

export function hasChanges(changes: FieldChanges): boolean {
  return changes.deletes.length + changes.updates.length + changes.inserts.length > 0
}

/** First problem with a draft, or null when it can be saved. */
export function validateDraft(draft: DraftItem[]): string | null {
  for (const item of draft) {
    const label = item.label.trim()
    if (!label) return 'Every field and heading needs a title.'
    if (label.length > LIMITS.label) return `Titles can be at most ${LIMITS.label} characters ("${label.slice(0, 20)}…").`
    if (item.body.length > LIMITS.body) return `"${label}" is too long (${LIMITS.body} characters maximum).`
  }
  return null
}

// ---------------------------------------------------------------------------
// Role change warnings
// ---------------------------------------------------------------------------

export interface RoleState {
  kind: CharacterKind
  inPlay: boolean
  ownerId: string | null
  status?: Status | null
}

/**
 * Plain-language consequences of a role change, shown before the GM saves.
 * Empty when nothing changes.
 */
export function describeRoleChange(
  characterName: string,
  from: RoleState,
  to: RoleState,
  nameOf: (userId: string) => string,
): string[] {
  const fromRole = roleOf(from)
  const toRole = roleOf(to)
  const toOwner = to.kind === 'npc' ? null : to.ownerId
  if (fromRole === toRole && from.ownerId === toOwner) return []

  const lines: string[] = []
  const oldOwner = from.ownerId ? nameOf(from.ownerId) : null
  const newOwner = toOwner ? nameOf(toOwner) : null
  const ownerChanged = from.ownerId !== toOwner

  if (toRole === 'npc') {
    lines.push(`${characterName} becomes an NPC.`)
    if (oldOwner) lines.push(`${oldOwner} can no longer post as, edit or see the Owner fields of ${characterName}.`)
    if (from.kind === 'pc') {
      lines.push('Owner fields become GM only. This stays so even if you change the role back.')
      lines.push(`${characterName} is added to the NPC posting names (GM Tools → NPCs).`)
    }
    return lines
  }

  if (ownerChanged && oldOwner) {
    lines.push(`${oldOwner} loses ${characterName}: no more posting, editing or Owner fields.`)
  }

  if (toRole === 'pc_in_play') {
    if (fromRole === 'pc_reserve') lines.push(`${characterName}'s status becomes Active.`)
    if (newOwner) {
      lines.push(
        `${newOwner} can edit ${characterName} and post as them${ownerChanged || fromRole !== 'pc_in_play' ? ' (straight away if not posting as anyone else)' : ''}. This counts toward their limit of 3 active characters.`,
      )
    } else {
      lines.push(`No player controls ${characterName}.`)
    }
    if (fromRole === 'pc_out_of_play') {
      lines.push('Owner fields go back to being seen only by the owner and you.')
    }
  } else if (toRole === 'pc_reserve') {
    if (fromRole !== 'pc_reserve') lines.push(`${characterName}'s status becomes Backup (you can change it to e.g. Incapacitated afterwards).`)
    if (newOwner) {
      lines.push(
        `${newOwner} keeps control of ${characterName} and can edit them, but can't post as them until they're active again. Reserve characters don't count toward the limit of 3 active characters.`,
      )
      if (fromRole === 'pc_in_play' && !ownerChanged) {
        lines.push(`If ${newOwner} is posting as ${characterName}, they switch to another active character of theirs (if they have one).`)
      }
    } else {
      lines.push(`No player controls ${characterName}.`)
    }
    if (fromRole === 'pc_out_of_play') {
      lines.push('Owner fields go back to being seen only by the owner and you.')
    }
  } else {
    // Retired (out of play).
    if (fromRole !== 'pc_out_of_play' && !ownerChanged && oldOwner) {
      lines.push(
        `${oldOwner} can no longer post as or edit ${characterName}, but keeps a read-only view. If ${oldOwner} is posting as ${characterName}, they switch to another active character of theirs (or their own name).`,
      )
    } else if (newOwner) {
      lines.push(`${newOwner} gets a read-only view of ${characterName}.`)
    }
    lines.push('All players can now read the Owner fields and the sheet, except fields marked Private.')
    lines.push('Retired characters do not count toward the limit of 3 active characters.')
  }
  if (from.kind === 'npc') {
    lines.push('Fields that were GM only stay GM only. Move any the player should see.')
  }
  return lines
}

// ---------------------------------------------------------------------------
// History entries
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function statusLabel(value: unknown): string {
  return isStatus(value) ? STATUS_LABELS[value] : str(value) || 'unknown'
}

function roleDescription(value: unknown, nameOf: (userId: string) => string): string {
  if (!value || typeof value !== 'object') return 'unknown'
  const v = value as { kind?: unknown; in_play?: unknown; owner_id?: unknown }
  // Role entries don't record the status, so an in-play PC reads "PC – in play".
  const state = { kind: v.kind === 'npc' ? ('npc' as const) : ('pc' as const), inPlay: v.in_play !== false }
  const owner = typeof v.owner_id === 'string' ? ` (${nameOf(v.owner_id)})` : ' (no player)'
  return `${roleLabel(state)}${state.kind === 'npc' ? '' : owner}`
}

/** One-line description of a history entry. */
export function describeEvent(event: CharacterEvent, nameOf: (userId: string) => string): string {
  const d = event.details ?? {}
  switch (event.eventType) {
    case 'created':
      return `Created as ${d.kind === 'npc' ? 'an NPC' : 'a PC'}.`
    case 'renamed':
      return `Renamed from "${str(d.from)}" to "${str(d.to)}".`
    case 'status_changed':
      return `Status changed from ${statusLabel(d.from)} to ${statusLabel(d.to)}.`
    case 'revealed':
      return 'Revealed to players.'
    case 'hidden':
      return 'Hidden from players.'
    case 'note':
      return event.note ?? ''
    case 'posting_started':
      return `${typeof d.user_id === 'string' ? nameOf(d.user_id) : 'A player'} started posting as this character.`
    case 'posting_ended':
      return `${typeof d.user_id === 'string' ? nameOf(d.user_id) : 'A player'} stopped posting as this character.`
    case 'role_changed':
      return `Role changed from ${roleDescription(d.from, nameOf)} to ${roleDescription(d.to, nameOf)}.`
    case 'field_visibility_changed': {
      const from = VISIBILITY_LABELS[d.from as Visibility] ?? str(d.from)
      const to = VISIBILITY_LABELS[d.to as Visibility] ?? str(d.to)
      const privateNote =
        d.private_to === true && d.private_from !== true
          ? ' and marked Private'
          : d.private_from === true && d.private_to !== true
            ? ' and no longer Private'
            : ''
      if (from === to) return `"${str(d.label)}" ${privateNote ? privateNote.replace(/^ and /, '') : 'changed'}.`
      return `"${str(d.label)}" moved from ${from} to ${to}${privateNote}.`
    }
    case 'field_edited': {
      const kind = d.item_type === 'heading' ? 'heading' : 'field'
      if (d.action === 'added') return `Added ${kind} "${str(d.label)}".`
      if (d.action === 'removed') return `Removed ${kind} "${str(d.label)}".`
      if (d.old_label && d.old_label !== d.label) return `Renamed field "${str(d.old_label)}" to "${str(d.label)}".`
      return `Edited "${str(d.label)}".`
    }
    case 'sheet_edited': {
      if (d.action === 'created') return 'Sheet created.'
      if (d.action === 'removed') return 'Sheet removed.'
      const total = typeof d.total === 'number' ? d.total : Array.isArray(d.changes) ? d.changes.length : 0
      return `Sheet edited (${total} ${total === 1 ? 'change' : 'changes'}).`
    }
    case 'given':
    case 'taken':
    case 'converted_to_npc':
      return 'Role changed (earlier version).'
    default:
      return event.eventType
  }
}

export interface SheetChange {
  path: string
  from: string | null
  to: string | null
}

/** The value changes of a sheet edit (as logged by the database), else []. */
export function sheetChanges(event: CharacterEvent): SheetChange[] {
  if (event.eventType !== 'sheet_edited' || !Array.isArray(event.details?.changes)) return []
  return (event.details.changes as unknown[]).flatMap(c => {
    if (!c || typeof c !== 'object') return []
    const o = c as Record<string, unknown>
    if (typeof o.path !== 'string') return []
    return [{ path: o.path, from: typeof o.from === 'string' ? o.from : null, to: typeof o.to === 'string' ? o.to : null }]
  })
}

/** Old/new text of an edit, for the GM's expandable change log. */
export function editDetails(event: CharacterEvent): { before: string; after: string } | null {
  if (event.eventType !== 'field_edited') return null
  const d = event.details ?? {}
  const before = str(d.old_body)
  const after = str(d.new_body)
  if (!before && !after) return null
  return { before, after }
}

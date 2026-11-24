import { useCallback, useContext, useEffect, useId, useState } from 'react'
import { useToast } from '../../../contexts/ToastContext'
import { BADGE, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SECTION_TITLE } from '../characters/ui'
import { NpcFace } from '../npcTags/NpcTags'
import { OpenCharacterContext, requestCharacter } from '../npcTags/characterOpener'
import { KIND_ICONS } from '../records/RecordIcon'
import { KIND_LABELS } from '../records/recordModel'
import { OpenRecordContext, requestRecord } from '../records/recordOpener'
import * as api from './linkApi'
import {
  LINK_LABEL_MAX,
  LINK_VISIBILITY_LABELS,
  SUGGESTED_LABELS,
  describeLink,
  isRecordTarget,
  sortLinks,
  sortTargets,
  validateLinkLabel,
  type CampaignLink,
  type LinkEnd,
  type LinkTarget,
  type LinkVisibility,
} from './linkModel'

interface LinksSectionProps {
  channelId: string
  subject: LinkEnd
  subjectName: string
  isGM: boolean
  isArchived: boolean
  myUserId: string | undefined
  /** Called after any change, e.g. so the profile's history shows it. */
  onChanged?: () => void
}

function useLinks(subject: LinkEnd) {
  const [links, setLinks] = useState<CampaignLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [token, setToken] = useState(0)
  const { type, id } = subject

  useEffect(() => {
    let mounted = true
    setLoading(true)
    api
      .listLinks({ type, id })
      .then(list => {
        if (!mounted) return
        setLinks(sortLinks(list))
        setError(false)
      })
      .catch(err => {
        console.error('Failed to load links:', err)
        if (mounted) setError(true)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [type, id, token])

  const reload = useCallback(() => setToken(t => t + 1), [])
  return { links, loading, error, reload }
}

/**
 * The Links section of a character or record profile (Phase 2b step 3): links
 * shown on both ends; the GM adds, labels, shows / hides and removes them.
 */
export function LinksSection({ channelId, subject, subjectName, isGM, isArchived, myUserId, onChanged }: LinksSectionProps) {
  const { links, loading, error, reload } = useLinks(subject)
  const { addToast } = useToast()
  const [adding, setAdding] = useState(false)
  const canManage = isGM && !isArchived

  const run = async (action: () => Promise<void>, success: string): Promise<boolean> => {
    try {
      await action()
      addToast(success, 'success')
      reload()
      onChanged?.()
      return true
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Something went wrong.', 'error')
      return false
    }
  }

  // Players only get the section when there is something to see.
  if (!isGM && !error && links.length === 0) return null

  return (
    <section aria-label="Links" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className={SECTION_TITLE}>Links</h4>
        {canManage && !adding && (
          <button type="button" className={BTN_SECONDARY} onClick={() => setAdding(true)}>
            Add link
          </button>
        )}
      </div>
      {isGM && <p className="text-xs text-surface-500 dark:text-surface-400">Players see a shown link only when they can see both ends.</p>}
      {canManage && <LabelSuggestions />}

      {adding && (
        <AddLinkForm
          channelId={channelId}
          subject={subject}
          subjectName={subjectName}
          onCancel={() => setAdding(false)}
          onAdd={async (draft) => {
            if (!myUserId) {
              addToast('You need to be signed in.', 'error')
              return
            }
            const ok = await run(
              () => api.addLink({ channelId, ...draft, userId: myUserId }),
              'Link added.',
            )
            if (ok) setAdding(false)
          }}
        />
      )}

      {error ? (
        <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          <span>Couldn't load the links.</span>
          <button type="button" onClick={reload} className={BTN_SECONDARY}>
            Retry
          </button>
        </div>
      ) : loading && links.length === 0 ? (
        <div className="h-4 w-1/2 animate-pulse rounded bg-surface-200 dark:bg-surface-700" aria-label="Loading links" />
      ) : links.length === 0 ? (
        <p className="text-sm text-surface-400 dark:text-surface-500">No links yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {links.map(link => (
            <LinkItem
              key={link.id}
              link={link}
              subjectName={subjectName}
              isGM={isGM}
              canManage={canManage}
              onRelabel={label => run(() => api.updateLink(link.id, { label }), 'Link saved.')}
              onVisibility={visibility =>
                run(() => api.updateLink(link.id, { visibility }), visibility === 'players' ? 'Link shown to players.' : 'Link hidden from players.')
              }
              onReverse={() => run(() => api.reverseLink(link.id), 'Link reversed.')}
              onRemove={() => run(() => api.deleteLink(link.id), 'Link removed.')}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function TargetIcon({ target }: { target: LinkTarget }) {
  if (isRecordTarget(target)) {
    const Icon = KIND_ICONS[target.kind]
    return <Icon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
  }
  return <NpcFace npc={{ name: target.name, portraitUrl: target.pictureUrl }} className="h-4 w-4" />
}

const CHIP =
  'inline-flex items-center gap-1 rounded bg-teal-50 px-1.5 py-0.5 align-baseline font-medium text-teal-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-teal-950 dark:text-teal-200'

/** The other end of a link (also used for notes from elsewhere): opens it in this panel when it can, else in its own. */
export function OtherEnd({ target }: { target: LinkTarget }) {
  const openCharacterHere = useContext(OpenCharacterContext)
  const openRecordHere = useContext(OpenRecordContext)
  const open = () => {
    if (target.type === 'record') (openRecordHere ?? requestRecord)(target.id)
    else (openCharacterHere ?? requestCharacter)(target.id)
  }
  return (
    <button type="button" onClick={open} title={`Open ${target.name}`} className={CHIP}>
      <TargetIcon target={target} />
      {target.name}
    </button>
  )
}

interface LinkItemProps {
  link: CampaignLink
  subjectName: string
  isGM: boolean
  canManage: boolean
  onRelabel: (label: string) => Promise<boolean>
  onVisibility: (visibility: LinkVisibility) => Promise<boolean>
  onReverse: () => Promise<boolean>
  onRemove: () => Promise<boolean>
}

function LinkItem({ link, subjectName, isGM, canManage, onRelabel, onVisibility, onReverse, onRemove }: LinkItemProps) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(link.label)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const sentence = describeLink(link, subjectName)
  const subject = <span className="font-medium text-surface-900 dark:text-surface-100">{subjectName}</span>
  const other = <OtherEnd target={link.other} />
  const problem = editing ? validateLinkLabel(label) : null

  const act = async (action: () => Promise<boolean>) => {
    setBusy(true)
    const ok = await action()
    setBusy(false)
    return ok
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-surface-700 dark:text-surface-300">
      {editing ? (
        <span className="flex flex-wrap items-center gap-1.5">
          {link.outgoing ? subject : other}
          <span aria-hidden="true">—</span>
          <input
            aria-label="Link label"
            className={`${INPUT} w-40`}
            value={label}
            maxLength={LINK_LABEL_MAX}
            list="ext-link-label-suggestions"
            onChange={e => setLabel(e.target.value)}
          />
          <span aria-hidden="true">→</span>
          {link.outgoing ? other : subject}
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5">
          {link.outgoing ? subject : other}
          <span aria-hidden="true">—</span>
          <span className="italic">{sentence.label}</span>
          <span aria-hidden="true">→</span>
          {link.outgoing ? other : subject}
        </span>
      )}
      {isGM && (
        <span
          className={`${BADGE} ${
            link.visibility === 'players'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
          }`}
        >
          {LINK_VISIBILITY_LABELS[link.visibility]}
        </span>
      )}
      {canManage && (
        <span className="flex flex-wrap gap-1">
          {editing ? (
            <>
              <button
                type="button"
                className={BTN_PRIMARY}
                disabled={busy || !!problem}
                onClick={async () => {
                  if (label.trim() === link.label) return setEditing(false)
                  if (await act(() => onRelabel(label))) setEditing(false)
                }}
              >
                Save
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => { setEditing(false); setLabel(link.label) }}>
                Cancel
              </button>
              {problem && <span className="w-full text-xs text-red-600 dark:text-red-400">{problem}</span>}
            </>
          ) : confirming ? (
            <>
              <button type="button" className={BTN_DANGER} disabled={busy} onClick={() => void act(onRemove)}>
                Remove link
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy}
                onClick={() => void act(() => onVisibility(link.visibility === 'players' ? 'gm' : 'players'))}
              >
                {link.visibility === 'players' ? 'Hide' : 'Show'}
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy}
                onClick={() => void act(onReverse)}
                title="Reverse (swap the two ends)"
                aria-label={`Reverse link: ${sentence.from} ${sentence.label} ${sentence.to}`}
              >
                <span aria-hidden="true">⇄</span>
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setConfirming(true)} aria-label={`Remove link: ${sentence.from} ${sentence.label} ${sentence.to}`}>
                Remove
              </button>
            </>
          )}
        </span>
      )}
    </li>
  )
}

/** One shared list of suggested labels for every label input. */
function LabelSuggestions() {
  return (
    <datalist id="ext-link-label-suggestions">
      {SUGGESTED_LABELS.map(l => (
        <option key={l} value={l} />
      ))}
    </datalist>
  )
}

interface LinkDraft {
  from: LinkEnd
  to: LinkEnd
  label: string
  visibility: LinkVisibility
}

interface AddLinkFormProps {
  channelId: string
  subject: LinkEnd
  subjectName: string
  onCancel: () => void
  onAdd: (draft: LinkDraft) => Promise<void>
}

function targetKey(t: LinkEnd): string {
  return `${t.type}:${t.id}`
}

function kindLabel(target: LinkTarget): string {
  if (isRecordTarget(target)) return KIND_LABELS[target.kind]
  return target.kind === 'pc' ? 'PC' : 'NPC'
}

function AddLinkForm({ channelId, subject, subjectName, onCancel, onAdd }: AddLinkFormProps) {
  const { type: subjectType, id: subjectId } = subject
  const ids = useId()
  const [targets, setTargets] = useState<LinkTarget[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [outgoing, setOutgoing] = useState(true)
  const [targetValue, setTargetValue] = useState('')
  const [label, setLabel] = useState('')
  const [visibility, setVisibility] = useState<LinkVisibility>('gm')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    api
      .listLinkTargets(channelId)
      .then(list => {
        if (mounted) setTargets(sortTargets(list, { type: subjectType, id: subjectId }))
      })
      .catch(err => {
        console.error('Failed to load link targets:', err)
        if (mounted) setLoadError(true)
      })
    return () => {
      mounted = false
    }
  }, [channelId, subjectType, subjectId])

  const target = targets?.find(t => targetKey(t) === targetValue)
  const problem = !target ? 'Choose what to link to.' : validateLinkLabel(label)
  const otherName = target?.name ?? '…'

  const submit = async () => {
    setTouched(true)
    if (problem || !target) return
    setSaving(true)
    const other: LinkEnd = { type: target.type, id: target.id }
    await onAdd({ from: outgoing ? subject : other, to: outgoing ? other : subject, label, visibility })
    setSaving(false)
  }

  const groups: { title: string; items: LinkTarget[] }[] = [
    { title: 'PCs', items: (targets ?? []).filter(t => t.type === 'character' && t.kind === 'pc') },
    { title: 'NPCs', items: (targets ?? []).filter(t => t.type === 'character' && t.kind === 'npc') },
    { title: 'Records', items: (targets ?? []).filter(t => t.type === 'record') },
  ]

  return (
    <form
      aria-label="Add link"
      className="space-y-2 rounded-md border border-surface-200 p-3 dark:border-surface-700"
      onSubmit={e => {
        e.preventDefault()
        void submit()
      }}
    >
      {loadError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          Couldn't load the characters and records.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-wrap items-center gap-2 rounded bg-surface-50 p-2 text-sm text-surface-700 sm:col-span-2 dark:bg-surface-800 dark:text-surface-300">
            <span aria-live="polite" data-testid="link-preview">
              <span className="font-medium">{outgoing ? subjectName : otherName}</span> — <span className="italic">{label.trim() || 'label'}</span> →{' '}
              <span className="font-medium">{outgoing ? otherName : subjectName}</span>
            </span>
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => setOutgoing(o => !o)}
              title="Swap direction"
              aria-label="Swap direction"
            >
              <span aria-hidden="true">⇄</span>
            </button>
          </div>
          <div>
            <label htmlFor={`${ids}-target`} className={LABEL}>
              Link to
            </label>
            <select
              id={`${ids}-target`}
              className={INPUT}
              value={targetValue}
              disabled={!targets}
              onChange={e => setTargetValue(e.target.value)}
            >
              <option value="">{targets ? 'Choose…' : 'Loading…'}</option>
              {groups
                .filter(g => g.items.length > 0)
                .map(g => (
                  <optgroup key={g.title} label={g.title}>
                    {g.items.map(t => (
                      <option key={targetKey(t)} value={targetKey(t)}>
                        {t.name} · {kindLabel(t)}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-label`} className={LABEL}>
              Label
            </label>
            <input
              id={`${ids}-label`}
              className={INPUT}
              value={label}
              maxLength={LINK_LABEL_MAX}
              placeholder="e.g. works for"
              list="ext-link-label-suggestions"
              onChange={e => setLabel(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor={`${ids}-vis`} className={LABEL}>
              Who can see it
            </label>
            <select id={`${ids}-vis`} className={INPUT} value={visibility} onChange={e => setVisibility(e.target.value as LinkVisibility)}>
              <option value="gm">GM only</option>
              <option value="players">Shown (players who can see both ends)</option>
            </select>
          </div>
        </div>
      )}
      {touched && problem && <p className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
      <div className="flex gap-2">
        <button type="submit" className={BTN_PRIMARY} disabled={saving || loadError}>
          Add link
        </button>
        <button type="button" className={BTN_SECONDARY} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

import { useRef, useState } from 'react'
import { IconPicker } from '../../chat/IconPicker'
import { useImageUpload } from '../../../hooks/useImageUpload'
import { Portrait } from './CharacterBadges'
import {
  LIMITS,
  VISIBILITY_HINTS,
  VISIBILITY_LABELS,
  canRemove,
  diffFields,
  editableColumns,
  itemsIn,
  moveItem,
  moveToColumn,
  newDraftItem,
  removeItem,
  toDraft,
  updateItem,
  validateDraft,
  type CharacterField,
  type CharacterSummary,
  type DraftItem,
  type FieldChanges,
  type Visibility,
} from './characterModel'
import { BTN_ICON, BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL, SECTION_TITLE } from './ui'

export interface ProfileSave {
  name: string
  portraitUrl: string | null
  changes: FieldChanges
}

interface ProfileEditorProps {
  channelId: string
  character: CharacterSummary
  fields: CharacterField[]
  isGM: boolean
  saving: boolean
  onCancel: () => void
  onSave: (save: ProfileSave) => void
}

export function ProfileEditor({ channelId, character, fields, isGM, saving, onCancel, onSave }: ProfileEditorProps) {
  const [name, setName] = useState(character.name)
  const [portraitUrl, setPortraitUrl] = useState<string | null>(character.portraitUrl)
  const [draft, setDraft] = useState<DraftItem[]>(() => toDraft(fields))
  const [error, setError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const { uploadEnabled, settingsLoading, uploading, uploadImage } = useImageUpload(channelId)

  // Owners can't see GM-only fields: those never reach the draft, so they are
  // left untouched by a save.
  const columns = editableColumns(character.kind, isGM)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('The character needs a name.')
      return
    }
    const problem = validateDraft(draft)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    onSave({ name: trimmed, portraitUrl, changes: diffFields(fields, draft) })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const path = await uploadImage(file, 'character')
      if (path) setPortraitUrl(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed. Please try again.')
    }
  }

  const renderItem = (item: DraftItem, index: number, total: number) => {
    const heading = item.itemType === 'heading'
    const labelId = `label-${item.key}`
    return (
      <li key={item.key} className="rounded-md border border-surface-200 p-2 dark:border-surface-700" data-testid="draft-item">
        <div className="flex items-center gap-1">
          <input
            id={labelId}
            value={item.label}
            onChange={e => setDraft(d => updateItem(d, item.key, { label: e.target.value }))}
            maxLength={LIMITS.label}
            aria-label={heading ? 'Heading text' : 'Field title'}
            className={`${INPUT} min-w-0 flex-1 ${heading ? 'font-semibold uppercase tracking-wide' : 'font-medium'}`}
          />
          <button
            type="button"
            className={BTN_ICON}
            onClick={() => setDraft(d => moveItem(d, item.key, -1))}
            disabled={index === 0}
            aria-label={`Move ${item.label || 'item'} up`}
          >
            ↑
          </button>
          <button
            type="button"
            className={BTN_ICON}
            onClick={() => setDraft(d => moveItem(d, item.key, 1))}
            disabled={index === total - 1}
            aria-label={`Move ${item.label || 'item'} down`}
          >
            ↓
          </button>
          {canRemove(item, isGM) && (
            <button
              type="button"
              className={`${BTN_ICON} hover:!text-red-600`}
              onClick={() => setDraft(d => removeItem(d, item.key))}
              aria-label={`Remove ${item.label || 'item'}`}
            >
              ✕
            </button>
          )}
        </div>
        {!heading && (
          <textarea
            value={item.body}
            onChange={e => setDraft(d => updateItem(d, item.key, { body: e.target.value }))}
            maxLength={LIMITS.body}
            rows={3}
            aria-label={`${item.label || 'Field'} text`}
            className={`${INPUT} mt-1`}
          />
        )}
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
          {columns.length > 1 && (
            <label className="flex items-center gap-1 text-surface-600 dark:text-surface-400">
              Who sees it
              <select
                value={item.visibility}
                onChange={e => setDraft(d => moveToColumn(d, item.key, e.target.value as Visibility))}
                className="rounded border border-surface-300 bg-white px-1 py-0.5 text-xs dark:border-surface-600 dark:bg-surface-800"
                aria-label={`Who sees ${item.label || 'this item'}`}
              >
                {columns.map(v => (
                  <option key={v} value={v}>
                    {VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>
          )}
          {item.visibility === 'owner' && !heading && (
            <label className="flex items-center gap-1 text-surface-600 dark:text-surface-400" title="Stays hidden from other players even after the character leaves play">
              <input
                type="checkbox"
                checked={item.private}
                onChange={e => setDraft(d => updateItem(d, item.key, { private: e.target.checked }))}
              />
              Private (stays hidden after the character leaves play)
            </label>
          )}
        </div>
      </li>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-label="Edit character">
      <div className="flex flex-wrap items-center gap-3">
        <Portrait character={{ name, portraitUrl }} size="lg" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={() => setPicking(true)}>
            Choose icon
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label="Upload portrait" onChange={handleUpload} />
          <button
            type="button"
            className={BTN_SECONDARY}
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !uploadEnabled || settingsLoading}
            title={!uploadEnabled && !settingsLoading ? 'Image uploads are disabled by the server admin' : undefined}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
          {portraitUrl && (
            <button type="button" className={BTN_SECONDARY} onClick={() => setPortraitUrl(null)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="ext-character-name" className={LABEL}>
          Name
        </label>
        <input
          id="ext-character-name"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={LIMITS.name}
          required
          className={`${INPUT} mt-1`}
        />
        {character.kind === 'pc' && name.trim().length > LIMITS.postingName && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Posts show only the first {LIMITS.postingName} characters: "{name.trim().slice(0, LIMITS.postingName)}".
          </p>
        )}
      </div>

      <div className={`grid gap-4 ${columns.length === 3 ? 'lg:grid-cols-3' : columns.length === 2 ? 'lg:grid-cols-2' : ''}`}>
        {columns.map(column => {
          const items = itemsIn(draft, column)
          return (
            <section key={column} aria-label={`${VISIBILITY_LABELS[column]} fields`}>
              <h4 className={SECTION_TITLE}>{VISIBILITY_LABELS[column]}</h4>
              <p className="mb-2 text-xs text-surface-500 dark:text-surface-400">{VISIBILITY_HINTS[column]}</p>
              <ul className="space-y-2">{items.map((item, i) => renderItem(item, i, items.length))}</ul>
              <div className="mt-2 flex gap-2">
                <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(d => [...d, newDraftItem('field', column)])}>
                  + Field
                </button>
                <button type="button" className={BTN_SECONDARY} onClick={() => setDraft(d => [...d, newDraftItem('heading', column)])}>
                  + Heading
                </button>
              </div>
            </section>
          )
        })}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-surface-100 bg-white py-3 dark:border-surface-700 dark:bg-surface-800">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={saving || uploading}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {picking && (
        <IconPicker
          onPick={url => {
            setPortraitUrl(url)
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </form>
  )
}

import { useId, useState, type FormEvent } from 'react'
import type { PlayerOption } from '../characters/GmControls'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, LABEL } from '../characters/ui'
import {
  ACCEPT_ATTR,
  VISIBILITY_LABELS,
  detailsProblem,
  fileProblem,
  formatSize,
  type FileDetails,
  type FileVisibility,
} from './filesModel'

const VISIBILITY_HINTS: Record<FileVisibility, string> = {
  gm: 'Your notes, or a handout you haven’t given out yet.',
  players: 'Everyone in the campaign can open it.',
  selected: 'Only the players you tick (and you) can open it.',
}

interface FileFormProps {
  mode: 'add' | 'edit'
  initial?: FileDetails
  folders: string[]
  players: PlayerOption[]
  onSave: (details: FileDetails, file: File | null) => Promise<boolean>
  onCancel: () => void
}

/** Add a file (with the picker) or edit a file's details. GM only. */
export function FileForm({ mode, initial, folders, players, onSave, onCancel }: FileFormProps) {
  const id = useId()
  const [file, setFile] = useState<File | null>(null)
  const [details, setDetails] = useState<FileDetails>(
    initial ?? { title: '', description: '', folder: '', visibility: 'gm', playerIds: [] },
  )
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<FileDetails>) => {
    setDetails(d => ({ ...d, ...patch }))
    setProblem(null)
  }

  const pick = (picked: File | null) => {
    setFile(picked)
    if (!picked) return
    const issue = fileProblem(picked)
    setProblem(issue)
    // Suggest a title from the file name when none has been typed yet.
    if (!issue && !details.title.trim()) set({ title: picked.name.replace(/\.[^.]+$/, '').slice(0, 120) })
  }

  const togglePlayer = (userId: string) =>
    set({
      playerIds: details.playerIds.includes(userId)
        ? details.playerIds.filter(p => p !== userId)
        : [...details.playerIds, userId],
    })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const issue = mode === 'add' ? (file ? fileProblem(file) : 'Choose a file to upload.') : null
    const detailIssue = issue ?? detailsProblem(details)
    if (detailIssue) {
      setProblem(detailIssue)
      return
    }
    setSaving(true)
    const ok = await onSave(
      { ...details, title: details.title.trim(), folder: details.folder.trim(), description: details.description.trim() },
      file,
    )
    setSaving(false)
    if (!ok) setProblem('Not saved. Check the message and try again.')
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{mode === 'add' ? 'Add a file' : 'Edit file details'}</h3>

      {mode === 'add' && (
        <div>
          <label htmlFor={`${id}-file`} className={LABEL}>
            File (PDF or image, up to 20 MB)
          </label>
          <input
            id={`${id}-file`}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={e => pick(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-surface-700 dark:text-surface-300"
          />
          {file && <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">{formatSize(file.size)}</p>}
        </div>
      )}

      <div>
        <label htmlFor={`${id}-title`} className={LABEL}>
          Title
        </label>
        <input id={`${id}-title`} className={`${INPUT} mt-1`} value={details.title} maxLength={120} onChange={e => set({ title: e.target.value })} />
      </div>

      <div>
        <label htmlFor={`${id}-folder`} className={LABEL}>
          Folder (optional)
        </label>
        <input
          id={`${id}-folder`}
          className={`${INPUT} mt-1`}
          value={details.folder}
          maxLength={60}
          list={`${id}-folders`}
          placeholder="e.g. Case files"
          onChange={e => set({ folder: e.target.value })}
        />
        <datalist id={`${id}-folders`}>
          {folders.map(f => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>

      <div>
        <label htmlFor={`${id}-description`} className={LABEL}>
          Description (optional)
        </label>
        <textarea
          id={`${id}-description`}
          className={`${INPUT} mt-1`}
          rows={2}
          maxLength={1000}
          value={details.description}
          onChange={e => set({ description: e.target.value })}
        />
      </div>

      <fieldset>
        <legend className={LABEL}>Who can see it</legend>
        <div className="mt-1 space-y-1">
          {(Object.keys(VISIBILITY_LABELS) as FileVisibility[]).map(v => (
            <label key={v} className="flex items-start gap-2 text-sm text-surface-800 dark:text-surface-200">
              <input
                type="radio"
                name={`${id}-visibility`}
                className="mt-1"
                checked={details.visibility === v}
                onChange={() => set({ visibility: v })}
              />
              <span>
                {VISIBILITY_LABELS[v]}
                <span className="block text-xs text-surface-500 dark:text-surface-400">{VISIBILITY_HINTS[v]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {details.visibility === 'selected' && (
        <fieldset>
          <legend className={LABEL}>Share with</legend>
          {players.length === 0 ? (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">No players have joined yet.</p>
          ) : (
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {players.map(p => (
                <label key={p.userId} className="flex items-center gap-2 text-sm text-surface-800 dark:text-surface-200">
                  <input type="checkbox" checked={details.playerIds.includes(p.userId)} onChange={() => togglePlayer(p.userId)} />
                  {p.name}
                </label>
              ))}
            </div>
          )}
          <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
            Shared with the player, so all of their characters can use it.
          </p>
        </fieldset>
      )}

      {problem && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {problem}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className={BTN_PRIMARY} disabled={saving}>
          {saving ? (mode === 'add' ? 'Uploading…' : 'Saving…') : mode === 'add' ? 'Upload' : 'Save'}
        </button>
      </div>
    </form>
  )
}

import { useMemo, useRef, useState } from 'react'
import { useEscapeToClose } from '../../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../../hooks/useFocusTrap'
import { useToast } from '../../../contexts/ToastContext'
import type { PlayerOption } from '../characters/GmControls'
import { BTN_PRIMARY, BTN_SECONDARY, INPUT, SECTION_TITLE } from '../characters/ui'
import { FileDetail } from './FileDetail'
import { FileForm } from './FileForm'
import { addFile, deleteFile, replaceFile, updateFile } from './filesApi'
import { VISIBILITY_LABELS, folderNames, groupByFolder, isImage, currentVersion, type FileDetails } from './filesModel'
import { useCampaignFiles } from './useCampaignFiles'

export interface FilesPanelProps {
  channelId: string
  isGM: boolean
  isArchived: boolean
  /** Campaign players (not the GM), for sharing with chosen players. */
  players: PlayerOption[]
  nameOf: (userId: string) => string
  onClose: () => void
}

type View = { mode: 'none' } | { mode: 'file'; id: string } | { mode: 'add' } | { mode: 'edit'; id: string }

export function FilesPanel({ channelId, isGM, isArchived, players, nameOf, onClose }: FilesPanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()
  const { files, shares, loading, error, reload } = useCampaignFiles(channelId, isGM)
  const [view, setView] = useState<View>({ mode: 'none' })
  const [search, setSearch] = useState('')
  const canManage = isGM && !isArchived
  const busyForm = view.mode === 'add' || view.mode === 'edit'

  // Escape closes the panel, except while a form is open (it would lose the input).
  useEscapeToClose(() => {
    if (!busyForm) onClose()
  })
  useFocusTrap(dialogRef)

  const groups = useMemo(() => groupByFolder(files, search), [files, search])
  const folders = useMemo(() => folderNames(files), [files])
  const selectedId = view.mode === 'file' || view.mode === 'edit' ? view.id : null
  const selected = files.find(f => f.id === selectedId) ?? null

  const fail = (err: unknown, fallback: string) => addToast(err instanceof Error ? err.message : fallback, 'error')

  const handleAdd = async (details: FileDetails, picked: File | null) => {
    if (!picked) return false
    try {
      const id = await addFile(channelId, picked, details)
      addToast(`${details.title} added.`, 'success')
      reload()
      setView({ mode: 'file', id })
      return true
    } catch (err) {
      fail(err, 'Could not add the file.')
      return false
    }
  }

  const handleEdit = async (details: FileDetails) => {
    if (!selected) return false
    try {
      await updateFile(selected.id, details)
      addToast('File details saved.', 'success')
      reload()
      setView({ mode: 'file', id: selected.id })
      return true
    } catch (err) {
      fail(err, 'Could not save the file details.')
      return false
    }
  }

  const handleReplace = async (picked: File) => {
    if (!selected) return false
    try {
      const version = await replaceFile(channelId, selected.id, picked)
      addToast(`${selected.title} replaced (version ${version}).`, 'success')
      reload()
      return true
    } catch (err) {
      fail(err, 'Could not replace the file.')
      return false
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    try {
      await deleteFile(selected.id)
      addToast(`${selected.title} deleted.`, 'success')
      setView({ mode: 'none' })
      reload()
    } catch (err) {
      fail(err, 'Could not delete the file.')
    }
  }

  const showingDetail = view.mode !== 'none'

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-surface-600 bg-opacity-75 sm:items-center dark:bg-surface-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={() => !busyForm && onClose()} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ext-files-title"
        className="relative flex h-full w-full flex-col bg-white shadow-xl sm:h-[90vh] sm:max-w-5xl sm:rounded-lg dark:bg-surface-800"
      >
        <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3 dark:border-surface-700">
          <div className="flex items-center gap-2">
            {showingDetail && (
              <button type="button" className={`${BTN_SECONDARY} md:hidden`} onClick={() => setView({ mode: 'none' })} disabled={busyForm}>
                ← List
              </button>
            )}
            <h2 id="ext-files-title" className="text-lg font-bold text-surface-900 dark:text-surface-100">
              Files
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busyForm}
            className="p-1 text-surface-400 hover:text-surface-600 disabled:opacity-30 dark:hover:text-surface-200"
            aria-label="Close files"
            title={busyForm ? 'Save or cancel the form first' : undefined}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-3">
          {error ? (
            <div role="alert" className="flex items-center justify-between rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              <span>Couldn't load the files.</span>
              <button type="button" onClick={reload} className={BTN_SECONDARY}>
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="animate-pulse space-y-3 py-2" aria-label="Loading files">
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
              <div className="h-10 rounded bg-surface-200 dark:bg-surface-700" />
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[18rem_1fr]">
              <div className={`flex min-h-0 flex-col gap-3 pb-4 ${showingDetail ? 'hidden md:flex' : ''}`}>
                {canManage && (
                  <button type="button" className={BTN_PRIMARY} onClick={() => setView({ mode: 'add' })} disabled={busyForm}>
                    + Add file
                  </button>
                )}
                {files.length > 0 && (
                  <input
                    type="search"
                    className={INPUT}
                    placeholder="Search files"
                    aria-label="Search files"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                )}
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                  {files.length === 0 ? (
                    <p className="py-6 text-center text-sm text-surface-500 dark:text-surface-400">
                      {isGM ? 'No files yet. Add handouts, case files or maps here.' : 'No files have been shared with you yet.'}
                    </p>
                  ) : groups.length === 0 ? (
                    <p className="py-6 text-center text-sm text-surface-500 dark:text-surface-400">No files match your search.</p>
                  ) : (
                    groups.map(group => (
                      <section key={group.folder || '(none)'} aria-label={group.folder || 'Not in a folder'}>
                        <h3 className={SECTION_TITLE}>{group.folder || 'Not in a folder'}</h3>
                        <ul className="mt-1 space-y-1">
                          {group.files.map(f => {
                            const v = currentVersion(f)
                            const active = f.id === selectedId
                            return (
                              <li key={f.id}>
                                <button
                                  type="button"
                                  onClick={() => !busyForm && setView({ mode: 'file', id: f.id })}
                                  aria-current={active ? 'true' : undefined}
                                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                                    active
                                      ? 'bg-primary-50 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200'
                                      : 'text-surface-800 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-700'
                                  }`}
                                >
                                  <span className="block truncate font-medium">{f.title}</span>
                                  <span className="block text-xs text-surface-500 dark:text-surface-400">
                                    {v ? (isImage(v.mimeType) ? 'Image' : 'PDF') : ''}
                                    {isGM && ` · ${VISIBILITY_LABELS[f.visibility]}`}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </section>
                    ))
                  )}
                </div>
              </div>

              <div className={`min-h-0 overflow-y-auto pb-4 ${showingDetail ? '' : 'hidden md:block'}`}>
                {view.mode === 'add' ? (
                  <FileForm mode="add" folders={folders} players={players} onSave={handleAdd} onCancel={() => setView({ mode: 'none' })} />
                ) : view.mode === 'edit' && selected ? (
                  <FileForm
                    key={selected.id}
                    mode="edit"
                    initial={{
                      title: selected.title,
                      description: selected.description,
                      folder: selected.folder,
                      visibility: selected.visibility,
                      playerIds: shares.get(selected.id) ?? [],
                    }}
                    folders={folders}
                    players={players}
                    onSave={handleEdit}
                    onCancel={() => setView({ mode: 'file', id: selected.id })}
                  />
                ) : selected ? (
                  <FileDetail
                    key={selected.id}
                    file={selected}
                    isGM={isGM}
                    canManage={canManage}
                    sharedWith={shares.get(selected.id) ?? []}
                    nameOf={nameOf}
                    onEdit={() => setView({ mode: 'edit', id: selected.id })}
                    onReplace={handleReplace}
                    onDelete={handleDelete}
                    onProblem={message => addToast(message, 'error')}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-surface-500 dark:text-surface-400">Choose a file to open it.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

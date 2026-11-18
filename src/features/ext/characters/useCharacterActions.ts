import { useMemo } from 'react'
import * as api from './characterApi'
import type { CharacterKind, FieldChanges } from './characterModel'

/**
 * The writes the characters panel can make, bound to one campaign and the
 * signed-in user. Each action throws a readable Error on failure; the
 * database decides whether the caller is allowed.
 */
export function useCharacterActions(channelId: string, userId: string | undefined) {
  return useMemo(
    () => ({
      create: (kind: CharacterKind, name: string) => {
        if (!userId) throw new Error('You need to be signed in.')
        return api.createCharacter(channelId, kind, name, userId)
      },
      updateCharacter: api.updateCharacter,
      updateMyCharacter: api.updateMyCharacter,
      deleteCharacter: api.deleteCharacter,
      setRole: api.setRole,
      setMyStatus: api.setMyStatus,
      postAs: api.postAs,
      saveFields: (characterId: string, changes: FieldChanges) => api.saveFields(characterId, channelId, changes),
      addNote: (characterId: string, note: string) => {
        if (!userId) throw new Error('You need to be signed in.')
        return api.addNote(characterId, channelId, note, userId)
      },
      createTag: (name: string) => api.createTag(channelId, name),
      setCharacterTags: api.setCharacterTags,
    }),
    [channelId, userId],
  )
}

export type CharacterActions = ReturnType<typeof useCharacterActions>

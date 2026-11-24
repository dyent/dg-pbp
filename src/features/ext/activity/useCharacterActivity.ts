import * as api from './activityApi'
import { useActivity } from './useActivity'

/**
 * Posts and notes about one character, loaded with the viewer's own access.
 * `terms` and `npcName` say what to look for (see searchTerms).
 */
export function useCharacterActivity(channelId: string, characterId: string, npcName: string | null, terms: string[]) {
  return useActivity(channelId, [characterId, npcName ?? '', ...terms].join('\u0000'), {
    posts: before =>
      before ? api.listPosts(channelId, characterId, npcName, terms, before) : api.listPosts(channelId, characterId, npcName, terms),
    notes: () => api.listNotes(characterId),
    taggedNotes: () => api.listTaggedNotes(channelId, { type: 'character', id: characterId }),
  })
}

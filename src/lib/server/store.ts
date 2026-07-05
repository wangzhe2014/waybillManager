import { mockStore } from '@/lib/server/mock-db'
import { createServerSupabaseClient, isSupabaseConfigured } from '@/lib/server/supabase'
import { createSupabaseStore } from '@/lib/server/supabase-store.mjs'

export function getStore() {
  if (!isSupabaseConfigured) {
    return mockStore
  }

  return createSupabaseStore(createServerSupabaseClient())
}

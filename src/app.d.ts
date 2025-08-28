import {
  Session,
  SupabaseClient,
  User,
  type AMREntry,
} from "@supabase/supabase-js"
import { Database } from "./DatabaseDefinitions"

declare global {
  namespace App {
    interface Locals {
      supabase: SupabaseClient<Database>
      supabaseServiceRole: SupabaseClient<Database>
      safeGetSession: () => Promise<{
        session: Session | null
        user: User | null
        amr: AMREntry[] | null
      }>
      session: Session | null
      user: User | null
    }
    interface PageData {
      session: Session | null
    }

  }
}

export {}

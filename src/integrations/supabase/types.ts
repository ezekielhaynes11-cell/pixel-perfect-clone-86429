export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_briefs: {
        Row: {
          account_id: string
          created_at: string
          created_by: string | null
          id: string
          markdown: string
          model: string
          sources: Json
          structured: Json
        }
        Insert: {
          account_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          markdown: string
          model?: string
          sources?: Json
          structured?: Json
        }
        Update: {
          account_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          markdown?: string
          model?: string
          sources?: Json
          structured?: Json
        }
        Relationships: [
          {
            foreignKeyName: "account_briefs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: string | null
          apollo_enriched_at: string | null
          apollo_org_id: string | null
          created_at: string
          domain: string | null
          employee_count: number | null
          id: string
          is_va: boolean
          name: string
          notes: string | null
          state: string | null
          system: string | null
          updated_at: string
        }
        Insert: {
          account_type?: string | null
          apollo_enriched_at?: string | null
          apollo_org_id?: string | null
          created_at?: string
          domain?: string | null
          employee_count?: number | null
          id?: string
          is_va?: boolean
          name: string
          notes?: string | null
          state?: string | null
          system?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string | null
          apollo_enriched_at?: string | null
          apollo_org_id?: string | null
          created_at?: string
          domain?: string | null
          employee_count?: number | null
          id?: string
          is_va?: boolean
          name?: string
          notes?: string | null
          state?: string | null
          system?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          read_at: string | null
          saved_search_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          read_at?: string | null
          saved_search_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          read_at?: string | null
          saved_search_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_saved_search_id_fkey"
            columns: ["saved_search_id"]
            isOneToOne: false
            referencedRelation: "saved_searches"
            referencedColumns: ["id"]
          },
        ]
      }
      briefings: {
        Row: {
          created_at: string
          date: string
          id: string
          markdown: string
          top_lead_ids: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          markdown: string
          top_lead_ids?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          markdown?: string
          top_lead_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      contact_enrichment: {
        Row: {
          created_at: string
          email: string | null
          lead_id: string
          linkedin_url: string | null
          name: string | null
          organization: string | null
          phone: string | null
          status: string
          title: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          lead_id: string
          linkedin_url?: string | null
          name?: string | null
          organization?: string | null
          phone?: string | null
          status: string
          title?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          lead_id?: string
          linkedin_url?: string | null
          name?: string | null
          organization?: string | null
          phone?: string | null
          status?: string
          title?: string | null
        }
        Relationships: []
      }
      ingestion_runs: {
        Row: {
          enriched_count: number
          error: string | null
          fetched_count: number
          finished_at: string | null
          id: string
          new_count: number
          source: string
          started_at: string
          status: string
        }
        Insert: {
          enriched_count?: number
          error?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          new_count?: number
          source: string
          started_at?: string
          status?: string
        }
        Update: {
          enriched_count?: number
          error?: string | null
          fetched_count?: number
          finished_at?: string | null
          id?: string
          new_count?: number
          source?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      keyword_lists: {
        Row: {
          active: boolean
          created_at: string
          id: string
          kind: string
          notes: string | null
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          kind: string
          notes?: string | null
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          kind?: string
          notes?: string | null
          value?: string
        }
        Relationships: []
      }
      lead_actions: {
        Row: {
          action: string
          created_at: string
          id: string
          lead_id: string
          note: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          lead_id: string
          note?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_physicians: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          match_confidence: number
          npi: string
          role: string
          role_hint: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          match_confidence?: number
          npi: string
          role?: string
          role_hint?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          match_confidence?: number
          npi?: string
          role?: string
          role_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_physicians_npi_fkey"
            columns: ["npi"]
            isOneToOne: false
            referencedRelation: "physician_contacts"
            referencedColumns: ["npi"]
          },
        ]
      }
      leads: {
        Row: {
          account_id: string | null
          account_type: string | null
          competitor_incumbent: string | null
          confidence: number
          created_at: string
          date_discovered: string
          date_ingested: string
          enriched: boolean
          entities: Json
          estimated_value_usd: number | null
          hospital: string | null
          id: string
          priority: string
          raw_payload: Json | null
          signal_type: string | null
          source: string
          source_contacts: Json | null
          source_external_id: string
          source_url: string | null
          specialty: string | null
          summary: string | null
          territory: string | null
          title: string
          updated_at: string
          vendor_mentions: string[]
          win_probability: number | null
        }
        Insert: {
          account_id?: string | null
          account_type?: string | null
          competitor_incumbent?: string | null
          confidence?: number
          created_at?: string
          date_discovered?: string
          date_ingested?: string
          enriched?: boolean
          entities?: Json
          estimated_value_usd?: number | null
          hospital?: string | null
          id?: string
          priority?: string
          raw_payload?: Json | null
          signal_type?: string | null
          source: string
          source_contacts?: Json | null
          source_external_id: string
          source_url?: string | null
          specialty?: string | null
          summary?: string | null
          territory?: string | null
          title: string
          updated_at?: string
          vendor_mentions?: string[]
          win_probability?: number | null
        }
        Update: {
          account_id?: string | null
          account_type?: string | null
          competitor_incumbent?: string | null
          confidence?: number
          created_at?: string
          date_discovered?: string
          date_ingested?: string
          enriched?: boolean
          entities?: Json
          estimated_value_usd?: number | null
          hospital?: string | null
          id?: string
          priority?: string
          raw_payload?: Json | null
          signal_type?: string | null
          source?: string
          source_contacts?: Json | null
          source_external_id?: string
          source_url?: string | null
          specialty?: string | null
          summary?: string | null
          territory?: string | null
          title?: string
          updated_at?: string
          vendor_mentions?: string[]
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_drafts: {
        Row: {
          body: string
          created_at: string
          id: string
          lead_id: string
          subject: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          lead_id: string
          subject: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          lead_id?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_drafts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      physician_contacts: {
        Row: {
          apollo_enriched_at: string | null
          apollo_id: string | null
          created_at: string
          credentials: string | null
          email: string | null
          full_name: string
          last_verified_at: string
          linkedin_url: string | null
          npi: string
          practice_address: string | null
          practice_city: string | null
          practice_phone: string | null
          practice_state: string | null
          practice_zip: string | null
          primary_specialty: string | null
          title: string | null
        }
        Insert: {
          apollo_enriched_at?: string | null
          apollo_id?: string | null
          created_at?: string
          credentials?: string | null
          email?: string | null
          full_name: string
          last_verified_at?: string
          linkedin_url?: string | null
          npi: string
          practice_address?: string | null
          practice_city?: string | null
          practice_phone?: string | null
          practice_state?: string | null
          practice_zip?: string | null
          primary_specialty?: string | null
          title?: string | null
        }
        Update: {
          apollo_enriched_at?: string | null
          apollo_id?: string | null
          created_at?: string
          credentials?: string | null
          email?: string | null
          full_name?: string
          last_verified_at?: string
          linkedin_url?: string | null
          npi?: string
          practice_address?: string | null
          practice_city?: string | null
          practice_phone?: string | null
          practice_state?: string | null
          practice_zip?: string | null
          primary_specialty?: string | null
          title?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          territory: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          territory?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          territory?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          alert_threshold: number
          alerts_enabled: boolean
          created_at: string
          filter: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          alert_threshold?: number
          alerts_enabled?: boolean
          created_at?: string
          filter?: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          alert_threshold?: number
          alerts_enabled?: boolean
          created_at?: string
          filter?: Json
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      scraped_pages: {
        Row: {
          account_id: string | null
          extracted: Json
          fetched_at: string
          id: string
          raw_text: string | null
          title: string | null
          url: string
        }
        Insert: {
          account_id?: string | null
          extracted?: Json
          fetched_at?: string
          id?: string
          raw_text?: string | null
          title?: string | null
          url: string
        }
        Update: {
          account_id?: string | null
          extracted?: Json
          fetched_at?: string
          id?: string
          raw_text?: string | null
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraped_pages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "rep"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "rep"],
    },
  },
} as const

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
      affiliate_connections: {
        Row: {
          affiliate_id: string | null
          affiliate_link: string | null
          affiliate_tag: string | null
          api_key_encrypted: string | null
          cookie_encrypted: string | null
          created_at: string
          id: string
          last_error: string | null
          platform: string
          status: string
          store_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_id?: string | null
          affiliate_link?: string | null
          affiliate_tag?: string | null
          api_key_encrypted?: string | null
          cookie_encrypted?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          platform: string
          status?: string
          store_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_id?: string | null
          affiliate_link?: string | null
          affiliate_tag?: string | null
          api_key_encrypted?: string | null
          cookie_encrypted?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          platform?: string
          status?: string
          store_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      monitored_groups: {
        Row: {
          created_at: string
          group_jid: string
          group_name: string
          id: string
          is_active: boolean
          platform: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_jid: string
          group_name: string
          id?: string
          is_active?: boolean
          platform?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_jid?: string
          group_name?: string
          id?: string
          is_active?: boolean
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          affiliate_link: string
          category: string | null
          commission_rate: number | null
          created_at: string
          id: string
          image_url: string | null
          original_price: number | null
          promo_price: number | null
          raw_link: string
          title: string
          user_id: string
        }
        Insert: {
          affiliate_link: string
          category?: string | null
          commission_rate?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          original_price?: number | null
          promo_price?: number | null
          raw_link: string
          title: string
          user_id: string
        }
        Update: {
          affiliate_link?: string
          category?: string | null
          commission_rate?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          original_price?: number | null
          promo_price?: number | null
          raw_link?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          hmac_token: string
          id: string
          last_active_at: string | null
          phone_number: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hmac_token: string
          id?: string
          last_active_at?: string | null
          phone_number?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hmac_token?: string
          id?: string
          last_active_at?: string | null
          phone_number?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shopee_affiliate_configs: {
        Row: {
          affiliate_id: string
          api_key_ciphertext: string | null
          created_at: string
          has_api_key: boolean
          last_error: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_id: string
          api_key_ciphertext?: string | null
          created_at?: string
          has_api_key?: boolean
          last_error?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_id?: string
          api_key_ciphertext?: string | null
          created_at?: string
          has_api_key?: boolean
          last_error?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          plan: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          plan?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          plan?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

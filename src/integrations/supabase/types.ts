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
      automation_configs: {
        Row: {
          channel_id: string
          created_at: string
          current_index: number
          group_id: string | null
          group_name: string | null
          hora_fim: string
          hora_inicio: string
          id: string
          intervalo_min: number
          last_error: string | null
          last_product_name: string | null
          last_sent_at: string | null
          lojas_ativas: string[]
          next_run_at: string | null
          post_loop: boolean
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          current_index?: number
          group_id?: string | null
          group_name?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_min?: number
          last_error?: string | null
          last_product_name?: string | null
          last_sent_at?: string | null
          lojas_ativas?: string[]
          next_run_at?: string | null
          post_loop?: boolean
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          current_index?: number
          group_id?: string | null
          group_name?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          intervalo_min?: number
          last_error?: string | null
          last_product_name?: string | null
          last_sent_at?: string | null
          lojas_ativas?: string[]
          next_run_at?: string | null
          post_loop?: boolean
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      automation_queue: {
        Row: {
          config_id: string
          created_at: string
          id: string
          link: string
          media_url: string | null
          order_index: number
          product_id: string | null
          sent_count: number
          store: string
          title: string
          user_id: string
        }
        Insert: {
          config_id: string
          created_at?: string
          id?: string
          link: string
          media_url?: string | null
          order_index: number
          product_id?: string | null
          sent_count?: number
          store: string
          title: string
          user_id: string
        }
        Update: {
          config_id?: string
          created_at?: string
          id?: string
          link?: string
          media_url?: string | null
          order_index?: number
          product_id?: string | null
          sent_count?: number
          store?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_queue_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "automation_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_whatsapp_connections: {
        Row: {
          channel_id: string
          connected_at: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          status: string
          token_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          connected_at?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          connected_at?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_whatsapp_session_status: {
        Row: {
          channel_id: string
          connected_at: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          phone_number: string | null
          session_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          connected_at?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          phone_number?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          connected_at?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          phone_number?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      channel_whatsapp_sessions: {
        Row: {
          channel_id: string
          created_at: string
          id: string
          session_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          id?: string
          session_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_whatsapp_sessions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadolivre_integrations: {
        Row: {
          access_token_ciphertext: string
          created_at: string
          expires_at: string
          id: string
          ml_user_id: string | null
          refresh_token_ciphertext: string | null
          scope: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_ciphertext: string
          created_at?: string
          expires_at: string
          id?: string
          ml_user_id?: string | null
          refresh_token_ciphertext?: string | null
          scope?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_ciphertext?: string
          created_at?: string
          expires_at?: string
          id?: string
          ml_user_id?: string | null
          refresh_token_ciphertext?: string | null
          scope?: string | null
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
      post_layouts: {
        Row: {
          description_template: string
          footer: string
          header: string
          hide_original: boolean
          hide_sales: boolean
          installment_template: string
          link_template: string
          original_price_template: string
          price_template: string
          sales_template: string
          title_template: string
          updated_at: string
          upper_title: boolean
          user_id: string
        }
        Insert: {
          description_template?: string
          footer?: string
          header?: string
          hide_original?: boolean
          hide_sales?: boolean
          installment_template?: string
          link_template?: string
          original_price_template?: string
          price_template?: string
          sales_template?: string
          title_template?: string
          updated_at?: string
          upper_title?: boolean
          user_id: string
        }
        Update: {
          description_template?: string
          footer?: string
          header?: string
          hide_original?: boolean
          hide_sales?: boolean
          installment_template?: string
          link_template?: string
          original_price_template?: string
          price_template?: string
          sales_template?: string
          title_template?: string
          updated_at?: string
          upper_title?: boolean
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          affiliate_link: string
          category: string | null
          commission_rate: number | null
          commission_value: number | null
          created_at: string
          id: string
          image_url: string | null
          item_id: string | null
          original_price: number | null
          platform: string
          promo_price: number | null
          raw_link: string
          sales: number | null
          store_name: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_link: string
          category?: string | null
          commission_rate?: number | null
          commission_value?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          item_id?: string | null
          original_price?: number | null
          platform?: string
          promo_price?: number | null
          raw_link: string
          sales?: number | null
          store_name?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_link?: string
          category?: string | null
          commission_rate?: number | null
          commission_value?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          item_id?: string | null
          original_price?: number | null
          platform?: string
          promo_price?: number | null
          raw_link?: string
          sales?: number | null
          store_name?: string | null
          title?: string
          updated_at?: string
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
      whatsapp_campaign_history: {
        Row: {
          caption: string | null
          config_id: string | null
          error_message: string | null
          group_id: string | null
          group_name: string | null
          id: string
          instance_name: string | null
          media_url: string | null
          product_id: string | null
          product_name: string | null
          sent_at: string
          status: string
          store: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          config_id?: string | null
          error_message?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          instance_name?: string | null
          media_url?: string | null
          product_id?: string | null
          product_name?: string | null
          sent_at?: string
          status: string
          store?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          config_id?: string | null
          error_message?: string | null
          group_id?: string | null
          group_name?: string | null
          id?: string
          instance_name?: string | null
          media_url?: string | null
          product_id?: string | null
          product_name?: string | null
          sent_at?: string
          status?: string
          store?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_history_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "automation_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_group_selections: {
        Row: {
          channel_id: string | null
          created_at: string
          group_jid: string
          group_name: string | null
          id: string
          instance_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          group_jid: string
          group_name?: string | null
          id?: string
          instance_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          group_jid?: string
          group_name?: string | null
          id?: string
          instance_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_selections_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          channel_id: string | null
          created_at: string
          id: string
          instance_name: string
          last_seen_at: string | null
          phone: string | null
          provider: string
          qr_code: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          id?: string
          instance_name: string
          last_seen_at?: string | null
          phone?: string | null
          provider?: string
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          id?: string
          instance_name?: string
          last_seen_at?: string | null
          phone?: string | null
          provider?: string
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_send_history: {
        Row: {
          caption: string | null
          error: string | null
          id: string
          instance_id: string | null
          jid: string
          media_url: string | null
          message_id: string | null
          product_id: string | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          error?: string | null
          id?: string
          instance_id?: string | null
          jid: string
          media_url?: string | null
          message_id?: string | null
          product_id?: string | null
          sent_at?: string
          status: string
          user_id: string
        }
        Update: {
          caption?: string | null
          error?: string | null
          id?: string
          instance_id?: string | null
          jid?: string
          media_url?: string | null
          message_id?: string | null
          product_id?: string | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_send_history_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_send_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          browser_id: string | null
          channel_id: string | null
          connected_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_seen_at: string | null
          name: string
          phone_number: string | null
          provider: string
          qr_code: string | null
          session_id: string | null
          session_key: string | null
          status: string
          token_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_id?: string | null
          channel_id?: string | null
          connected_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_seen_at?: string | null
          name: string
          phone_number?: string | null
          provider?: string
          qr_code?: string | null
          session_id?: string | null
          session_key?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_id?: string | null
          channel_id?: string | null
          connected_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_seen_at?: string | null
          name?: string
          phone_number?: string | null
          provider?: string
          qr_code?: string | null
          session_id?: string | null
          session_key?: string | null
          status?: string
          token_hash?: string | null
          updated_at?: string
          user_id?: string
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

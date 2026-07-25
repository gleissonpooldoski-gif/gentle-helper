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
          group_scope: string | null
          hora_fim: string
          hora_inicio: string
          id: string
          instance_id: string | null
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
          group_scope?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          instance_id?: string | null
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
          group_scope?: string | null
          hora_fim?: string
          hora_inicio?: string
          id?: string
          instance_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "automation_configs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_group_sends: {
        Row: {
          config_id: string
          id: string
          product_id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          config_id: string
          id?: string
          product_id: string
          sent_at?: string
          user_id: string
        }
        Update: {
          config_id?: string
          id?: string
          product_id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_group_sends_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "automation_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_group_sends_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
      channels: {
        Row: {
          auto_post: boolean
          created_at: string
          external_id: string | null
          id: string
          interval_min: number
          name: string
          random_order: boolean
          reports_last_sync_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_post?: boolean
          created_at?: string
          external_id?: string | null
          id?: string
          interval_min?: number
          name: string
          random_order?: boolean
          reports_last_sync_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_post?: boolean
          created_at?: string
          external_id?: string | null
          id?: string
          interval_min?: number
          name?: string
          random_order?: boolean
          reports_last_sync_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cron_secrets: {
        Row: {
          name: string
          updated_at: string
          value: string
        }
        Insert: {
          name: string
          updated_at?: string
          value: string
        }
        Update: {
          name?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      evolution_settings: {
        Row: {
          base_url: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          base_url?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          base_url?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      instabot_automations: {
        Row: {
          button_label: string
          button_url: string
          caption: string | null
          channel_id: string
          comment_replies: string[]
          comment_reply_mode: string
          created_at: string
          dm_message: string
          enabled: boolean
          id: string
          ig_media_id: string
          ig_media_url: string | null
          keywords: string[]
          posted_at: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          button_label?: string
          button_url?: string
          caption?: string | null
          channel_id: string
          comment_replies?: string[]
          comment_reply_mode?: string
          created_at?: string
          dm_message?: string
          enabled?: boolean
          id?: string
          ig_media_id: string
          ig_media_url?: string | null
          keywords?: string[]
          posted_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          button_label?: string
          button_url?: string
          caption?: string | null
          channel_id?: string
          comment_replies?: string[]
          comment_reply_mode?: string
          created_at?: string
          dm_message?: string
          enabled?: boolean
          id?: string
          ig_media_id?: string
          ig_media_url?: string | null
          keywords?: string[]
          posted_at?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instabot_automations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      instabot_clicks: {
        Row: {
          automation_id: string
          created_at: string
          event_id: string | null
          id: string
        }
        Insert: {
          automation_id: string
          created_at?: string
          event_id?: string | null
          id?: string
        }
        Update: {
          automation_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instabot_clicks_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "instabot_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instabot_clicks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "instabot_events"
            referencedColumns: ["id"]
          },
        ]
      }
      instabot_events: {
        Row: {
          automation_id: string
          button_url: string | null
          channel_id: string
          comment_id: string | null
          comment_reply: string | null
          comment_text: string | null
          created_at: string
          dm_message: string | null
          dm_sent: boolean
          error: string | null
          id: string
          ig_user_id: string | null
          ig_username: string | null
          status: string
          user_id: string
        }
        Insert: {
          automation_id: string
          button_url?: string | null
          channel_id: string
          comment_id?: string | null
          comment_reply?: string | null
          comment_text?: string | null
          created_at?: string
          dm_message?: string | null
          dm_sent?: boolean
          error?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          status?: string
          user_id: string
        }
        Update: {
          automation_id?: string
          button_url?: string | null
          channel_id?: string
          comment_id?: string | null
          comment_reply?: string | null
          comment_text?: string | null
          created_at?: string
          dm_message?: string | null
          dm_sent?: boolean
          error?: string | null
          id?: string
          ig_user_id?: string | null
          ig_username?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instabot_events_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "instabot_automations"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_admin_schedule: {
        Row: {
          active: boolean
          created_at: string
          days: number[]
          hours: number[]
          id: string
          last_run_at: string | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days?: number[]
          hours?: number[]
          id?: string
          last_run_at?: string | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days?: number[]
          hours?: number[]
          id?: string
          last_run_at?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instagram_automations: {
        Row: {
          button_label: string | null
          button_url: string | null
          comment_reply: string | null
          created_at: string
          enabled: boolean
          extra_links: Json
          id: string
          keyword: string
          media_id: string | null
          message: string
          product_id: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          button_label?: string | null
          button_url?: string | null
          comment_reply?: string | null
          created_at?: string
          enabled?: boolean
          extra_links?: Json
          id?: string
          keyword: string
          media_id?: string | null
          message: string
          product_id?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          button_label?: string | null
          button_url?: string | null
          comment_reply?: string | null
          created_at?: string
          enabled?: boolean
          extra_links?: Json
          id?: string
          keyword?: string
          media_id?: string | null
          message?: string
          product_id?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_automations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_campaigns: {
        Row: {
          affiliate_link: string | null
          created_at: string
          error: string | null
          id: string
          keyword: string | null
          message: string
          product_id: string | null
          published_at: string | null
          status: string
          story_id: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          affiliate_link?: string | null
          created_at?: string
          error?: string | null
          id?: string
          keyword?: string | null
          message?: string
          product_id?: string | null
          published_at?: string | null
          status?: string
          story_id?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          affiliate_link?: string | null
          created_at?: string
          error?: string | null
          id?: string
          keyword?: string | null
          message?: string
          product_id?: string | null
          published_at?: string | null
          status?: string
          story_id?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_campaigns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_comments: {
        Row: {
          comment: string
          comment_id: string
          created_at: string
          id: string
          media_id: string | null
          replied_at: string | null
          reply: string | null
          username: string | null
        }
        Insert: {
          comment: string
          comment_id: string
          created_at?: string
          id?: string
          media_id?: string | null
          replied_at?: string | null
          reply?: string | null
          username?: string | null
        }
        Update: {
          comment?: string
          comment_id?: string
          created_at?: string
          id?: string
          media_id?: string | null
          replied_at?: string | null
          reply?: string | null
          username?: string | null
        }
        Relationships: []
      }
      instagram_connections: {
        Row: {
          access_token_ciphertext: string | null
          auto_post_enabled: boolean
          channel_id: string
          created_at: string
          disable_comment_reply: boolean
          facebook_page_id: string | null
          followers_count: number
          follows_count: number
          growth_enabled: boolean
          id: string
          instagram_account_id: string | null
          last_error: string | null
          media_count: number
          name: string | null
          profile_picture: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          access_token_ciphertext?: string | null
          auto_post_enabled?: boolean
          channel_id: string
          created_at?: string
          disable_comment_reply?: boolean
          facebook_page_id?: string | null
          followers_count?: number
          follows_count?: number
          growth_enabled?: boolean
          id?: string
          instagram_account_id?: string | null
          last_error?: string | null
          media_count?: number
          name?: string | null
          profile_picture?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          access_token_ciphertext?: string | null
          auto_post_enabled?: boolean
          channel_id?: string
          created_at?: string
          disable_comment_reply?: boolean
          facebook_page_id?: string | null
          followers_count?: number
          follows_count?: number
          growth_enabled?: boolean
          id?: string
          instagram_account_id?: string | null
          last_error?: string | null
          media_count?: number
          name?: string | null
          profile_picture?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instagram_connections_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_events: {
        Row: {
          channel_id: string | null
          connection_id: string | null
          created_at: string
          id: string
          kind: string
          payload: Json | null
          product_id: string | null
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          product_id?: string | null
          user_id: string
        }
        Update: {
          channel_id?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_events_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "instagram_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_keywords: {
        Row: {
          action: string
          active: boolean
          channel_id: string
          comment_reply_enabled: boolean
          comment_reply_text: string
          created_at: string
          id: string
          keyword: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string
          active?: boolean
          channel_id: string
          comment_reply_enabled?: boolean
          comment_reply_text?: string
          created_at?: string
          id?: string
          keyword: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string
          active?: boolean
          channel_id?: string
          comment_reply_enabled?: boolean
          comment_reply_text?: string
          created_at?: string
          id?: string
          keyword?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_keywords_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_logs: {
        Row: {
          created_at: string
          id: string
          latency_ms: number | null
          payload: Json | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          payload?: Json | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          latency_ms?: number | null
          payload?: Json | null
          type?: string
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          caption: string | null
          channel_id: string
          created_at: string
          error_message: string | null
          id: string
          instagram_media_id: string | null
          kind: string
          product_id: string | null
          published_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          channel_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          instagram_media_id?: string | null
          kind?: string
          product_id?: string | null
          published_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          channel_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          instagram_media_id?: string | null
          kind?: string
          product_id?: string | null
          published_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_posts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_settings: {
        Row: {
          access_token_ciphertext: string
          created_at: string
          facebook_page_id: string
          id: string
          instagram_business_id: string
          updated_at: string
        }
        Insert: {
          access_token_ciphertext: string
          created_at?: string
          facebook_page_id: string
          id?: string
          instagram_business_id: string
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string
          created_at?: string
          facebook_page_id?: string
          id?: string
          instagram_business_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      instagram_story_schedule: {
        Row: {
          active: boolean
          channel_id: string
          created_at: string
          days: number[]
          hours: number[]
          id: string
          last_run_at: string | null
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          channel_id: string
          created_at?: string
          days?: number[]
          hours?: number[]
          id?: string
          last_run_at?: string | null
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          channel_id?: string
          created_at?: string
          days?: number[]
          hours?: number[]
          id?: string
          last_run_at?: string | null
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_story_schedule_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_story_schedule_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "instagram_story_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      instagram_story_templates: {
        Row: {
          active: boolean
          caption_template: string
          channel_id: string | null
          created_at: string
          fabric_json: Json | null
          id: string
          image_url: string
          is_default: boolean
          name: string
          price_color: string
          title_color: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          caption_template?: string
          channel_id?: string | null
          created_at?: string
          fabric_json?: Json | null
          id?: string
          image_url: string
          is_default?: boolean
          name?: string
          price_color?: string
          title_color?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          caption_template?: string
          channel_id?: string | null
          created_at?: string
          fabric_json?: Json | null
          id?: string
          image_url?: string
          is_default?: boolean
          name?: string
          price_color?: string
          title_color?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_story_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_posts: {
        Row: {
          channel_id: string
          coupon_code: string
          coupon_min_value: string
          coupon_type: string
          coupon_value: string
          created_at: string
          custom_header: string
          description: string
          header_mode: string
          id: string
          keep_link: boolean
          last_error: string | null
          never_expires: boolean
          price_current: string
          price_installment: string
          price_original: string
          price_suffix: string
          product_link: string
          scheduled_date: string | null
          scheduled_time: string | null
          sent_at: string | null
          shopee_video_link: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id: string
          coupon_code?: string
          coupon_min_value?: string
          coupon_type?: string
          coupon_value?: string
          created_at?: string
          custom_header?: string
          description?: string
          header_mode?: string
          id?: string
          keep_link?: boolean
          last_error?: string | null
          never_expires?: boolean
          price_current?: string
          price_installment?: string
          price_original?: string
          price_suffix?: string
          product_link?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          sent_at?: string | null
          shopee_video_link?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          coupon_code?: string
          coupon_min_value?: string
          coupon_type?: string
          coupon_value?: string
          created_at?: string
          custom_header?: string
          description?: string
          header_mode?: string
          id?: string
          keep_link?: boolean
          last_error?: string | null
          never_expires?: boolean
          price_current?: string
          price_installment?: string
          price_original?: string
          price_suffix?: string
          product_link?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          sent_at?: string | null
          shopee_video_link?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
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
          channel_id: string | null
          created_at: string
          group_jid: string
          group_name: string
          id: string
          instance_id: string
          is_active: boolean
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          group_jid: string
          group_name: string
          id?: string
          instance_id: string
          is_active?: boolean
          platform?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          group_jid?: string
          group_name?: string
          id?: string
          instance_id?: string
          is_active?: boolean
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitored_groups_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_groups_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitored_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      post_header_variations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          text: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          text: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          text?: string
          user_id?: string | null
        }
        Relationships: []
      }
      post_layouts: {
        Row: {
          channel_id: string | null
          description_template: string
          footer: string
          header: string
          header_mode: string
          hide_original: boolean
          hide_sales: boolean
          id: string
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
          channel_id?: string | null
          description_template?: string
          footer?: string
          header?: string
          header_mode?: string
          hide_original?: boolean
          hide_sales?: boolean
          id?: string
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
          channel_id?: string | null
          description_template?: string
          footer?: string
          header?: string
          header_mode?: string
          hide_original?: boolean
          hide_sales?: boolean
          id?: string
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
        Relationships: [
          {
            foreignKeyName: "post_layouts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      product_price_history: {
        Row: {
          changed_at: string
          discount_percentage: number | null
          id: string
          new_original_price: number | null
          new_price: number
          old_original_price: number | null
          old_price: number | null
          product_id: string
        }
        Insert: {
          changed_at?: string
          discount_percentage?: number | null
          id?: string
          new_original_price?: number | null
          new_price: number
          old_original_price?: number | null
          old_price?: number | null
          product_id: string
        }
        Update: {
          changed_at?: string
          discount_percentage?: number | null
          id?: string
          new_original_price?: number | null
          new_price?: number
          old_original_price?: number | null
          old_price?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          affiliate_link: string
          availability: string
          category: string | null
          channel_id: string | null
          commission_rate: number | null
          commission_value: number | null
          created_at: string
          discount_percentage: number | null
          id: string
          image_url: string | null
          is_discount: boolean
          item_id: string | null
          last_validated_at: string | null
          original_price: number | null
          platform: string
          price_changed_at: string | null
          promo_price: number | null
          raw_link: string
          sales: number | null
          sales_label: string | null
          source: string | null
          source_group_jid: string | null
          source_group_name: string | null
          store_name: string | null
          title: string
          updated_at: string
          user_id: string
          validation_error: string | null
        }
        Insert: {
          affiliate_link: string
          availability?: string
          category?: string | null
          channel_id?: string | null
          commission_rate?: number | null
          commission_value?: number | null
          created_at?: string
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          is_discount?: boolean
          item_id?: string | null
          last_validated_at?: string | null
          original_price?: number | null
          platform?: string
          price_changed_at?: string | null
          promo_price?: number | null
          raw_link: string
          sales?: number | null
          sales_label?: string | null
          source?: string | null
          source_group_jid?: string | null
          source_group_name?: string | null
          store_name?: string | null
          title: string
          updated_at?: string
          user_id: string
          validation_error?: string | null
        }
        Update: {
          affiliate_link?: string
          availability?: string
          category?: string | null
          channel_id?: string | null
          commission_rate?: number | null
          commission_value?: number | null
          created_at?: string
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          is_discount?: boolean
          item_id?: string | null
          last_validated_at?: string | null
          original_price?: number | null
          platform?: string
          price_changed_at?: string | null
          promo_price?: number | null
          raw_link?: string
          sales?: number | null
          sales_label?: string | null
          source?: string | null
          source_group_jid?: string | null
          source_group_name?: string | null
          store_name?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
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
      shopee_conversions: {
        Row: {
          buyer_type: string
          category: string | null
          channel_id: string | null
          commission: number
          commission_pct: number
          created_at: string
          device: string
          id: string
          order_date: string
          order_id: string
          platform: string
          product_id: string | null
          product_image: string | null
          product_name: string
          qty: number
          raw: Json | null
          status: string
          store_name: string | null
          synced_at: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          buyer_type?: string
          category?: string | null
          channel_id?: string | null
          commission?: number
          commission_pct?: number
          created_at?: string
          device?: string
          id?: string
          order_date?: string
          order_id: string
          platform?: string
          product_id?: string | null
          product_image?: string | null
          product_name: string
          qty?: number
          raw?: Json | null
          status?: string
          store_name?: string | null
          synced_at?: string
          updated_at?: string
          user_id: string
          value?: number
        }
        Update: {
          buyer_type?: string
          category?: string | null
          channel_id?: string | null
          commission?: number
          commission_pct?: number
          created_at?: string
          device?: string
          id?: string
          order_date?: string
          order_id?: string
          platform?: string
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          qty?: number
          raw?: Json | null
          status?: string
          store_name?: string | null
          synced_at?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "shopee_conversions_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      site_configs: {
        Row: {
          channel_id: string
          created_at: string
          ga_tag: string | null
          id: string
          logo_url: string | null
          platforms: string[]
          product_limit: number
          slug: string
          sort_order: string
          subtitle: string
          theme_color: string
          title: string
          updated_at: string
          use_for_all: boolean
          use_for_amazon_ml: boolean
          user_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          ga_tag?: string | null
          id?: string
          logo_url?: string | null
          platforms?: string[]
          product_limit?: number
          slug: string
          sort_order?: string
          subtitle?: string
          theme_color?: string
          title?: string
          updated_at?: string
          use_for_all?: boolean
          use_for_amazon_ml?: boolean
          user_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          ga_tag?: string | null
          id?: string
          logo_url?: string | null
          platforms?: string[]
          product_limit?: number
          slug?: string
          sort_order?: string
          subtitle?: string
          theme_color?: string
          title?: string
          updated_at?: string
          use_for_all?: boolean
          use_for_amazon_ml?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_configs_channel_fk"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
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
      visual_templates: {
        Row: {
          channel_id: string | null
          created_at: string
          elements: Json
          format: string
          id: string
          is_default: boolean
          name: string
          preset: string
          preview_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          elements?: Json
          format?: string
          id?: string
          is_default?: boolean
          name?: string
          preset?: string
          preview_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          elements?: Json
          format?: string
          id?: string
          is_default?: boolean
          name?: string
          preset?: string
          preview_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_templates_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
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
      dispatch_automation_tick: { Args: never; Returns: number }
      try_lock_automation_config: {
        Args: { _config_id: string }
        Returns: boolean
      }
      unlock_automation_config: {
        Args: { _config_id: string }
        Returns: boolean
      }
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

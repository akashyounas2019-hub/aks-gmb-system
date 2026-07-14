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
      agent_notifications: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          kind: string
          message: string
          read_at: string | null
          related_agent_id: string | null
          task_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          kind: string
          message: string
          read_at?: string | null
          related_agent_id?: string | null
          task_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          kind?: string
          message?: string
          read_at?: string | null
          related_agent_id?: string | null
          task_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_notifications_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_notifications_related_agent_id_fkey"
            columns: ["related_agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_task_events: {
        Row: {
          agent_id: string
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json | null
          progress: number | null
          task_id: string | null
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json | null
          progress?: number | null
          task_id?: string | null
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json | null
          progress?: number | null
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_task_events_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "agent_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          agent_id: string
          created_at: string
          eta_at: string | null
          eta_confidence: string | null
          id: string
          major: boolean
          paused_at: string | null
          priority: string
          progress: number
          relative_time: string
          started_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          eta_at?: string | null
          eta_confidence?: string | null
          id?: string
          major?: boolean
          paused_at?: string | null
          priority?: string
          progress?: number
          relative_time?: string
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          eta_at?: string | null
          eta_confidence?: string | null
          id?: string
          major?: boolean
          paused_at?: string | null
          priority?: string
          progress?: number
          relative_time?: string
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          created_at: string
          glow: string
          icon_key: string
          id: string
          last_activity: string
          load: number
          main_skill: string | null
          name: string
          parent_id: string | null
          role: string
          scope: string
          slug: string | null
          sort_order: number
          status: string
          success_rate: number
          tasks_today: number
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          glow?: string
          icon_key?: string
          id?: string
          last_activity?: string
          load?: number
          main_skill?: string | null
          name: string
          parent_id?: string | null
          role: string
          scope?: string
          slug?: string | null
          sort_order?: number
          status?: string
          success_rate?: number
          tasks_today?: number
          tone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          glow?: string
          icon_key?: string
          id?: string
          last_activity?: string
          load?: number
          main_skill?: string | null
          name?: string
          parent_id?: string | null
          role?: string
          scope?: string
          slug?: string | null
          sort_order?: number
          status?: string
          success_rate?: number
          tasks_today?: number
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          created_at: string
          id: string
          improvement_enabled: boolean
          overtake_enabled: boolean
          rank_improvement_delta: number
          threat_enabled: boolean
          threat_keyword_threshold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          improvement_enabled?: boolean
          overtake_enabled?: boolean
          rank_improvement_delta?: number
          threat_enabled?: boolean
          threat_keyword_threshold?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          improvement_enabled?: boolean
          overtake_enabled?: boolean
          rank_improvement_delta?: number
          threat_enabled?: boolean
          threat_keyword_threshold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string
          error: string | null
          finished_at: string | null
          id: string
          output: Json
          owner_id: string
          started_at: string
          status: string
        }
        Insert: {
          automation_id: string
          error?: string | null
          finished_at?: string | null
          id?: string
          output?: Json
          owner_id: string
          started_at?: string
          status: string
        }
        Update: {
          automation_id?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          output?: Json
          owner_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          config: Json
          created_at: string
          cron: string
          enabled: boolean
          id: string
          kind: string
          last_run_at: string | null
          name: string
          next_run_at: string | null
          owner_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          kind: string
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          owner_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          kind?: string
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_rank_history: {
        Row: {
          city: string | null
          competitor_id: string | null
          id: string
          keyword: string
          rank: number | null
          recorded_at: string
          source: string
          user_id: string
        }
        Insert: {
          city?: string | null
          competitor_id?: string | null
          id?: string
          keyword: string
          rank?: number | null
          recorded_at?: string
          source: string
          user_id: string
        }
        Update: {
          city?: string | null
          competitor_id?: string | null
          id?: string
          keyword?: string
          rank?: number | null
          recorded_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_rank_history_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          created_at: string
          gbp_url: string
          id: string
          name: string
          notes: string | null
          place_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gbp_url: string
          id?: string
          name: string
          notes?: string | null
          place_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gbp_url?: string
          id?: string
          name?: string
          notes?: string | null
          place_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmb_credentials: {
        Row: {
          client_id: string
          client_secret: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          client_secret: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          client_secret?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gmb_tokens: {
        Row: {
          access_token: string
          account_name: string | null
          created_at: string
          expires_at: string
          location_name: string | null
          location_title: string | null
          refresh_token: string | null
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_name?: string | null
          created_at?: string
          expires_at: string
          location_name?: string | null
          location_title?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_name?: string | null
          created_at?: string
          expires_at?: string
          location_name?: string | null
          location_title?: string | null
          refresh_token?: string | null
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      image_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      image_keywords: {
        Row: {
          created_at: string
          image_id: string
          is_primary: boolean
          keyword_id: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          image_id: string
          is_primary?: boolean
          keyword_id: string
          owner_id: string
        }
        Update: {
          created_at?: string
          image_id?: string
          is_primary?: boolean
          keyword_id?: string
          owner_id?: string
        }
        Relationships: []
      }
      image_tags: {
        Row: {
          created_at: string
          image_id: string
          owner_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          image_id: string
          owner_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          image_id?: string
          owner_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_tags_image_id_fkey"
            columns: ["image_id"]
            isOneToOne: false
            referencedRelation: "images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "image_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      images: {
        Row: {
          created_at: string
          description: string | null
          folder_id: string | null
          height: number | null
          id: string
          lat: number | null
          lng: number | null
          name: string
          owner_id: string
          posted_at: string | null
          sharpness_score: number | null
          storage_path: string
          timestamp_seconds: number | null
          title: string | null
          venue_id: string | null
          video_id: string | null
          width: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          folder_id?: string | null
          height?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          name: string
          owner_id: string
          posted_at?: string | null
          sharpness_score?: number | null
          storage_path: string
          timestamp_seconds?: number | null
          title?: string | null
          venue_id?: string | null
          video_id?: string | null
          width?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          folder_id?: string | null
          height?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          name?: string
          owner_id?: string
          posted_at?: string | null
          sharpness_score?: number | null
          storage_path?: string
          timestamp_seconds?: number | null
          title?: string | null
          venue_id?: string | null
          video_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "images_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "image_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "images_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_folders: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          parent_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "keyword_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          cluster: string | null
          cpc: number | null
          created_at: string
          folder_id: string | null
          id: string
          intent: string | null
          keyword_difficulty: number | null
          owner_id: string
          phrase: string
          source: string | null
          tracked: boolean
          volume: number | null
        }
        Insert: {
          cluster?: string | null
          cpc?: number | null
          created_at?: string
          folder_id?: string | null
          id?: string
          intent?: string | null
          keyword_difficulty?: number | null
          owner_id: string
          phrase: string
          source?: string | null
          tracked?: boolean
          volume?: number | null
        }
        Update: {
          cluster?: string | null
          cpc?: number | null
          created_at?: string
          folder_id?: string | null
          id?: string
          intent?: string | null
          keyword_difficulty?: number | null
          owner_id?: string
          phrase?: string
          source?: string | null
          tracked?: boolean
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "keywords_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "keyword_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      location_history: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string
          lat: number
          lng: number
          owner_id: string
          place_id: string | null
          used_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          last_used_at?: string
          lat: number
          lng: number
          owner_id: string
          place_id?: string | null
          used_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string
          lat?: number
          lng?: number
          owner_id?: string
          place_id?: string | null
          used_count?: number
        }
        Relationships: []
      }
      post_drafts: {
        Row: {
          body: string
          created_at: string
          id: string
          image_ids: string[]
          meta: Json
          owner_id: string
          platforms: string[]
          scheduled_for: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          image_ids?: string[]
          meta?: Json
          owner_id: string
          platforms?: string[]
          scheduled_for?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          image_ids?: string[]
          meta?: Json
          owner_id?: string
          platforms?: string[]
          scheduled_for?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      rank_alerts: {
        Row: {
          alert_type: string
          competitor_id: string
          competitor_rank: number
          created_at: string
          id: string
          keyword: string
          rank_delta: number | null
          read_at: string | null
          source: string
          user_id: string
          user_rank: number
        }
        Insert: {
          alert_type?: string
          competitor_id: string
          competitor_rank: number
          created_at?: string
          id?: string
          keyword: string
          rank_delta?: number | null
          read_at?: string | null
          source: string
          user_id: string
          user_rank: number
        }
        Update: {
          alert_type?: string
          competitor_id?: string
          competitor_rank?: number
          created_at?: string
          id?: string
          keyword?: string
          rank_delta?: number | null
          read_at?: string | null
          source?: string
          user_id?: string
          user_rank?: number
        }
        Relationships: [
          {
            foreignKeyName: "rank_alerts_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_snapshots: {
        Row: {
          checked_at: string
          id: string
          keyword_id: string | null
          keyword_phrase: string
          lat: number
          lng: number
          owner_id: string
          rank: number | null
          source: string
          venue_id: string | null
        }
        Insert: {
          checked_at?: string
          id?: string
          keyword_id?: string | null
          keyword_phrase: string
          lat: number
          lng: number
          owner_id: string
          rank?: number | null
          source?: string
          venue_id?: string | null
        }
        Update: {
          checked_at?: string
          id?: string
          keyword_id?: string | null
          keyword_phrase?: string
          lat?: number
          lng?: number
          owner_id?: string
          rank?: number | null
          source?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rank_snapshots_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_snapshots_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          caption: string
          created_at: string
          error: string | null
          ghl_location_id: string | null
          id: string
          image_ids: string[]
          lat: number | null
          lng: number | null
          location_label: string | null
          owner_id: string
          primary_keyword_id: string | null
          provider_response: Json | null
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          caption: string
          created_at?: string
          error?: string | null
          ghl_location_id?: string | null
          id?: string
          image_ids?: string[]
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          owner_id: string
          primary_keyword_id?: string | null
          provider_response?: Json | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          caption?: string
          created_at?: string
          error?: string | null
          ghl_location_id?: string | null
          id?: string
          image_ids?: string[]
          lat?: number | null
          lng?: number | null
          location_label?: string | null
          owner_id?: string
          primary_keyword_id?: string | null
          provider_response?: Json | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          category: string | null
          created_at: string
          id: string
          label: string
          slug: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          label: string
          slug: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          label?: string
          slug?: string
        }
        Relationships: []
      }
      tracked_keywords: {
        Row: {
          category: string
          city: string
          created_at: string
          id: string
          owner_id: string
          phrase: string
          sort_index: number
          updated_at: string
          user_rank: number
          volume: number
        }
        Insert: {
          category?: string
          city?: string
          created_at?: string
          id?: string
          owner_id: string
          phrase: string
          sort_index?: number
          updated_at?: string
          user_rank?: number
          volume?: number
        }
        Update: {
          category?: string
          city?: string
          created_at?: string
          id?: string
          owner_id?: string
          phrase?: string
          sort_index?: number
          updated_at?: string
          user_rank?: number
          volume?: number
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          config: Json
          created_at: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          appearance: Json
          created_at: string
          general: Json
          notifications: Json
          owner_id: string
          theme: string
          updated_at: string
        }
        Insert: {
          appearance?: Json
          created_at?: string
          general?: Json
          notifications?: Json
          owner_id: string
          theme?: string
          updated_at?: string
        }
        Update: {
          appearance?: Json
          created_at?: string
          general?: Json
          notifications?: Json
          owner_id?: string
          theme?: string
          updated_at?: string
        }
        Relationships: []
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
          role: Database["public"]["Enums"]["app_role"]
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
      venues: {
        Row: {
          address: string | null
          category: string | null
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          place_id: string | null
        }
        Insert: {
          address?: string | null
          category?: string | null
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          place_id?: string | null
        }
        Update: {
          address?: string | null
          category?: string | null
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          place_id?: string | null
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          frame_count: number
          id: string
          original_name: string
          owner_id: string
          size_bytes: number | null
          status: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          frame_count?: number
          id?: string
          original_name: string
          owner_id: string
          size_bytes?: number | null
          status?: string
          storage_path: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          frame_count?: number
          id?: string
          original_name?: string
          owner_id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string
          enabled: boolean
          events: string[]
          id: string
          last_fired_at: string | null
          last_status: number | null
          name: string
          owner_id: string
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          last_fired_at?: string | null
          last_status?: number | null
          name: string
          owner_id: string
          secret?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          events?: string[]
          id?: string
          last_fired_at?: string | null
          last_status?: number | null
          name?: string
          owner_id?: string
          secret?: string | null
          updated_at?: string
          url?: string
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
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const

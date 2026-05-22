export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          also_push_notify: boolean
          dismissed_at: string | null
          id: string
          message: string
          sent_at: string
          sent_by: string
          tournament_id: string
          urgency: Database["public"]["Enums"]["urgency_enum"]
        }
        Insert: {
          also_push_notify?: boolean
          dismissed_at?: string | null
          id?: string
          message: string
          sent_at?: string
          sent_by: string
          tournament_id: string
          urgency?: Database["public"]["Enums"]["urgency_enum"]
        }
        Update: {
          also_push_notify?: boolean
          dismissed_at?: string | null
          id?: string
          message?: string
          sent_at?: string
          sent_by?: string
          tournament_id?: string
          urgency?: Database["public"]["Enums"]["urgency_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "announcements_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      club_affiliations: {
        Row: {
          club_id: string
          id: string
          is_current: boolean
          joined_at: string
          left_at: string | null
          player_id: string
        }
        Insert: {
          club_id: string
          id?: string
          is_current?: boolean
          joined_at?: string
          left_at?: string | null
          player_id: string
        }
        Update: {
          club_id?: string
          id?: string
          is_current?: boolean
          joined_at?: string
          left_at?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_affiliations_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_affiliations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      club_managers: {
        Row: {
          added_at: string
          club_id: string
          player_id: string
          role: string
        }
        Insert: {
          added_at?: string
          club_id: string
          player_id: string
          role?: string
        }
        Update: {
          added_at?: string
          club_id?: string
          player_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_managers_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_managers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          brand_primary_color: string
          brand_secondary_color: string
          city: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          founding_year: number | null
          id: string
          is_open_to_join: boolean
          location: string | null
          logo_url: string | null
          name: string
          slug: string
          subscription_tier: Database["public"]["Enums"]["subscription_tier_enum"]
          updated_at: string
          website: string | null
        }
        Insert: {
          brand_primary_color?: string
          brand_secondary_color?: string
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          founding_year?: number | null
          id?: string
          is_open_to_join?: boolean
          location?: string | null
          logo_url?: string | null
          name: string
          slug: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier_enum"]
          updated_at?: string
          website?: string | null
        }
        Update: {
          brand_primary_color?: string
          brand_secondary_color?: string
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          founding_year?: number | null
          id?: string
          is_open_to_join?: boolean
          location?: string | null
          logo_url?: string | null
          name?: string
          slug?: string
          subscription_tier?: Database["public"]["Enums"]["subscription_tier_enum"]
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      display_sessions: {
        Row: {
          connected_at: string
          device_fingerprint: string
          id: string
          last_seen_at: string
          tournament_id: string
        }
        Insert: {
          connected_at?: string
          device_fingerprint: string
          id?: string
          last_seen_at?: string
          tournament_id: string
        }
        Update: {
          connected_at?: string
          device_fingerprint?: string
          id?: string
          last_seen_at?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_sessions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      display_state: {
        Row: {
          active_announcement_id: string | null
          active_category_filter: string | null
          current_slide: Database["public"]["Enums"]["display_slide_enum"]
          is_paused: boolean
          is_pinned: boolean
          last_updated_by: string | null
          rotation_interval_secs: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          active_announcement_id?: string | null
          active_category_filter?: string | null
          current_slide?: Database["public"]["Enums"]["display_slide_enum"]
          is_paused?: boolean
          is_pinned?: boolean
          last_updated_by?: string | null
          rotation_interval_secs?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          active_announcement_id?: string | null
          active_category_filter?: string | null
          current_slide?: Database["public"]["Enums"]["display_slide_enum"]
          is_paused?: boolean
          is_pinned?: boolean
          last_updated_by?: string | null
          rotation_interval_secs?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_state_active_category_filter_fkey"
            columns: ["active_category_filter"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_state_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "display_state_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      global_rankings: {
        Row: {
          category: Database["public"]["Enums"]["ranking_category_enum"]
          last_updated: string
          player_id: string
          points: number
          rank: number
          window_start: string
        }
        Insert: {
          category: Database["public"]["Enums"]["ranking_category_enum"]
          last_updated?: string
          player_id: string
          points?: number
          rank: number
          window_start?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["ranking_category_enum"]
          last_updated?: string
          player_id?: string
          points?: number
          rank?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "global_rankings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      global_stats: {
        Row: {
          current_rating: number
          doubles_matches: number
          doubles_wins: number
          losses: number
          mixed_doubles_matches: number
          mixed_doubles_wins: number
          peak_rating: number
          player_id: string
          singles_matches: number
          singles_wins: number
          total_matches: number
          updated_at: string
          win_rate: number
          wins: number
        }
        Insert: {
          current_rating?: number
          doubles_matches?: number
          doubles_wins?: number
          losses?: number
          mixed_doubles_matches?: number
          mixed_doubles_wins?: number
          peak_rating?: number
          player_id: string
          singles_matches?: number
          singles_wins?: number
          total_matches?: number
          updated_at?: string
          win_rate?: number
          wins?: number
        }
        Update: {
          current_rating?: number
          doubles_matches?: number
          doubles_wins?: number
          losses?: number
          mixed_doubles_matches?: number
          mixed_doubles_wins?: number
          peak_rating?: number
          player_id?: string
          singles_matches?: number
          singles_wins?: number
          total_matches?: number
          updated_at?: string
          win_rate?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "global_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      match_history: {
        Row: {
          club_id: string
          id: string
          match_id: string
          opponent_entry_id: string | null
          played_at: string
          player_id: string
          rating_after: number
          rating_before: number
          rating_change: number
          result: Database["public"]["Enums"]["match_result_enum"]
          sets: Json
          tournament_id: string
        }
        Insert: {
          club_id: string
          id?: string
          match_id: string
          opponent_entry_id?: string | null
          played_at?: string
          player_id: string
          rating_after: number
          rating_before: number
          rating_change: number
          result: Database["public"]["Enums"]["match_result_enum"]
          sets?: Json
          tournament_id: string
        }
        Update: {
          club_id?: string
          id?: string
          match_id?: string
          opponent_entry_id?: string | null
          played_at?: string
          player_id?: string
          rating_after?: number
          rating_before?: number
          rating_change?: number
          result?: Database["public"]["Enums"]["match_result_enum"]
          sets?: Json
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_history_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          bracket_position: number | null
          category_id: string
          completed_at: string | null
          court: number | null
          created_at: string
          entry_a_id: string | null
          entry_b_id: string | null
          group_name: string | null
          id: string
          round: number
          round_name: string | null
          scheduled_time: string | null
          sets: Json
          started_at: string | null
          status: Database["public"]["Enums"]["match_status_enum"]
          tournament_id: string
          winner_entry_id: string | null
        }
        Insert: {
          bracket_position?: number | null
          category_id: string
          completed_at?: string | null
          court?: number | null
          created_at?: string
          entry_a_id?: string | null
          entry_b_id?: string | null
          group_name?: string | null
          id?: string
          round: number
          round_name?: string | null
          scheduled_time?: string | null
          sets?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status_enum"]
          tournament_id: string
          winner_entry_id?: string | null
        }
        Update: {
          bracket_position?: number | null
          category_id?: string
          completed_at?: string | null
          court?: number | null
          created_at?: string
          entry_a_id?: string | null
          entry_b_id?: string | null
          group_name?: string | null
          id?: string
          round?: number
          round_name?: string | null
          scheduled_time?: string | null
          sets?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status_enum"]
          tournament_id?: string
          winner_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_entry_a_id_fkey"
            columns: ["entry_a_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_entry_b_id_fkey"
            columns: ["entry_b_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_entry_id_fkey"
            columns: ["winner_entry_id"]
            isOneToOne: false
            referencedRelation: "tournament_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      player_profiles: {
        Row: {
          bio: string | null
          career_history: Json
          certifications: Json
          headline: string | null
          player_id: string
          playing_since: number | null
          preferred_style: string | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          career_history?: Json
          certifications?: Json
          headline?: string | null
          player_id: string
          playing_since?: number | null
          preferred_style?: string | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          career_history?: Json
          certifications?: Json
          headline?: string | null
          player_id?: string
          playing_since?: number | null
          preferred_style?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_profiles_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          created_at: string
          dob: string | null
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_enum"]
          id: string
          is_provisional: boolean
          location: string | null
          photo_url: string | null
          provisional_claim_token: string | null
          provisional_expires_at: string | null
          role: Database["public"]["Enums"]["player_role_enum"]
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          dob?: string | null
          email: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_enum"]
          id: string
          is_provisional?: boolean
          location?: string | null
          photo_url?: string | null
          provisional_claim_token?: string | null
          provisional_expires_at?: string | null
          role?: Database["public"]["Enums"]["player_role_enum"]
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          dob?: string | null
          email?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_enum"]
          id?: string
          is_provisional?: boolean
          location?: string | null
          photo_url?: string | null
          provisional_claim_token?: string | null
          provisional_expires_at?: string | null
          role?: Database["public"]["Enums"]["player_role_enum"]
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      score_submissions: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          id: string
          is_confirmed: boolean
          match_id: string
          sets: Json
          submitted_at: string
          submitted_by: string
          submitter_role: Database["public"]["Enums"]["submitter_role_enum"]
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          is_confirmed?: boolean
          match_id: string
          sets?: Json
          submitted_at?: string
          submitted_by: string
          submitter_role: Database["public"]["Enums"]["submitter_role_enum"]
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          id?: string
          is_confirmed?: boolean
          match_id?: string
          sets?: Json
          submitted_at?: string
          submitted_by?: string
          submitter_role?: Database["public"]["Enums"]["submitter_role_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "score_submissions_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_submissions_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_categories: {
        Row: {
          created_at: string
          draw_format: Database["public"]["Enums"]["draw_format_enum"]
          id: string
          max_age: number | null
          max_entries: number | null
          min_age: number | null
          name: string
          play_format: Database["public"]["Enums"]["play_format_enum"]
          runner_up_entry_id: string | null
          skill_levels: Json
          slug: string
          status: Database["public"]["Enums"]["category_status_enum"]
          third_place_entry_id: string | null
          tournament_id: string
          type: Database["public"]["Enums"]["category_type_enum"]
          winner_entry_id: string | null
        }
        Insert: {
          created_at?: string
          draw_format: Database["public"]["Enums"]["draw_format_enum"]
          id?: string
          max_age?: number | null
          max_entries?: number | null
          min_age?: number | null
          name: string
          play_format: Database["public"]["Enums"]["play_format_enum"]
          runner_up_entry_id?: string | null
          skill_levels?: Json
          slug: string
          status?: Database["public"]["Enums"]["category_status_enum"]
          third_place_entry_id?: string | null
          tournament_id: string
          type: Database["public"]["Enums"]["category_type_enum"]
          winner_entry_id?: string | null
        }
        Update: {
          created_at?: string
          draw_format?: Database["public"]["Enums"]["draw_format_enum"]
          id?: string
          max_age?: number | null
          max_entries?: number | null
          min_age?: number | null
          name?: string
          play_format?: Database["public"]["Enums"]["play_format_enum"]
          runner_up_entry_id?: string | null
          skill_levels?: Json
          slug?: string
          status?: Database["public"]["Enums"]["category_status_enum"]
          third_place_entry_id?: string | null
          tournament_id?: string
          type?: Database["public"]["Enums"]["category_type_enum"]
          winner_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_entries: {
        Row: {
          category_id: string
          id: string
          partner_id: string | null
          player_id: string
          registered_at: string
          seed: number | null
          status: Database["public"]["Enums"]["entry_status_enum"]
          tournament_id: string
        }
        Insert: {
          category_id: string
          id?: string
          partner_id?: string | null
          player_id: string
          registered_at?: string
          seed?: number | null
          status?: Database["public"]["Enums"]["entry_status_enum"]
          tournament_id: string
        }
        Update: {
          category_id?: string
          id?: string
          partner_id?: string | null
          player_id?: string
          registered_at?: string
          seed?: number | null
          status?: Database["public"]["Enums"]["entry_status_enum"]
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entries_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_referee_pins: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          is_revoked: boolean
          label: string | null
          pin_hash: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          is_revoked?: boolean
          label?: string | null
          pin_hash: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          is_revoked?: boolean
          label?: string | null
          pin_hash?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_referee_pins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_referee_pins_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          auto_approve_entries: boolean
          club_id: string
          court_count: number
          created_at: string
          created_by: string
          description: string | null
          display_code: string
          end_date: string
          id: string
          max_participants: number | null
          name: string
          registration_deadline: string | null
          slug: string
          social_post_triggers: Json
          start_date: string
          status: Database["public"]["Enums"]["tournament_status_enum"]
          updated_at: string
          venue: string | null
        }
        Insert: {
          auto_approve_entries?: boolean
          club_id: string
          court_count?: number
          created_at?: string
          created_by: string
          description?: string | null
          display_code: string
          end_date: string
          id?: string
          max_participants?: number | null
          name: string
          registration_deadline?: string | null
          slug: string
          social_post_triggers?: Json
          start_date: string
          status?: Database["public"]["Enums"]["tournament_status_enum"]
          updated_at?: string
          venue?: string | null
        }
        Update: {
          auto_approve_entries?: boolean
          club_id?: string
          court_count?: number
          created_at?: string
          created_by?: string
          description?: string | null
          display_code?: string
          end_date?: string
          id?: string
          max_participants?: number | null
          name?: string
          registration_deadline?: string | null
          slug?: string
          social_post_triggers?: Json
          start_date?: string
          status?: Database["public"]["Enums"]["tournament_status_enum"]
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
      generate_category_slug: {
        Args: { base_name: string; tid: string }
        Returns: string
      }
      generate_display_code: { Args: never; Returns: string }
      generate_tournament_slug: { Args: { base_name: string }; Returns: string }
      is_club_manager: { Args: { p_club_id: string }; Returns: boolean }
      slugify: { Args: { val: string }; Returns: string }
      verify_referee_pin: {
        Args: { p_pin: string; p_tournament_id: string }
        Returns: boolean
      }
    }
    Enums: {
      category_status_enum:
        | "pending"
        | "registration"
        | "draw_generated"
        | "in_progress"
        | "completed"
      category_type_enum: "skill" | "age" | "gender" | "open"
      display_slide_enum:
        | "live_scores"
        | "group_standings"
        | "live_bracket"
        | "upcoming_matches"
        | "full_schedule"
        | "category_podium"
        | "announcement"
        | "wrap_up"
      draw_format_enum:
        | "round_robin"
        | "single_elimination"
        | "double_elimination"
        | "group_stage_knockout"
        | "swiss"
      entry_status_enum:
        | "active"
        | "withdrawn"
        | "provisional"
        | "pending"
        | "waitlisted"
      gender_enum: "male" | "female" | "other"
      match_result_enum: "win" | "loss" | "walkover_win" | "walkover_loss"
      match_status_enum:
        | "scheduled"
        | "in_progress"
        | "completed"
        | "disputed"
        | "walkover"
        | "retired"
      play_format_enum: "singles" | "doubles" | "mixed_doubles"
      player_role_enum:
        | "player"
        | "organizer"
        | "club_manager"
        | "referee"
        | "sponsor"
        | "admin"
      ranking_category_enum:
        | "singles_open"
        | "singles_a"
        | "singles_b"
        | "singles_c"
        | "doubles_open"
        | "doubles_a"
        | "doubles_b"
        | "mixed_doubles_open"
        | "mixed_doubles_a"
      submitter_role_enum: "referee" | "organizer" | "player"
      subscription_tier_enum: "free" | "starter" | "pro" | "enterprise"
      tournament_status_enum:
        | "draft"
        | "registration_open"
        | "in_progress"
        | "completed"
        | "cancelled"
      urgency_enum: "normal" | "urgent"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      category_status_enum: [
        "pending",
        "registration",
        "draw_generated",
        "in_progress",
        "completed",
      ],
      category_type_enum: ["skill", "age", "gender", "open"],
      display_slide_enum: [
        "live_scores",
        "group_standings",
        "live_bracket",
        "upcoming_matches",
        "full_schedule",
        "category_podium",
        "announcement",
        "wrap_up",
      ],
      draw_format_enum: [
        "round_robin",
        "single_elimination",
        "double_elimination",
        "group_stage_knockout",
        "swiss",
      ],
      entry_status_enum: [
        "active",
        "withdrawn",
        "provisional",
        "pending",
        "waitlisted",
      ],
      gender_enum: ["male", "female", "other"],
      match_result_enum: ["win", "loss", "walkover_win", "walkover_loss"],
      match_status_enum: [
        "scheduled",
        "in_progress",
        "completed",
        "disputed",
        "walkover",
        "retired",
      ],
      play_format_enum: ["singles", "doubles", "mixed_doubles"],
      player_role_enum: [
        "player",
        "organizer",
        "club_manager",
        "referee",
        "sponsor",
        "admin",
      ],
      ranking_category_enum: [
        "singles_open",
        "singles_a",
        "singles_b",
        "singles_c",
        "doubles_open",
        "doubles_a",
        "doubles_b",
        "mixed_doubles_open",
        "mixed_doubles_a",
      ],
      submitter_role_enum: ["referee", "organizer", "player"],
      subscription_tier_enum: ["free", "starter", "pro", "enterprise"],
      tournament_status_enum: [
        "draft",
        "registration_open",
        "in_progress",
        "completed",
        "cancelled",
      ],
      urgency_enum: ["normal", "urgent"],
    },
  },
} as const


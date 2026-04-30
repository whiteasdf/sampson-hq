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
      activities: {
        Row: {
          accelo_id: number
          company_id: number | null
          date_created: string | null
          date_logged: string | null
          duration_seconds: number | null
          id: number
          rate_id: number | null
          staff_id: number | null
          subject: string | null
          synced_at: string
          task_id: number | null
        }
        Insert: {
          accelo_id: number
          company_id?: number | null
          date_created?: string | null
          date_logged?: string | null
          duration_seconds?: number | null
          id?: never
          rate_id?: number | null
          staff_id?: number | null
          subject?: string | null
          synced_at?: string
          task_id?: number | null
        }
        Update: {
          accelo_id?: number
          company_id?: number | null
          date_created?: string | null
          date_logged?: string | null
          duration_seconds?: number | null
          id?: never
          rate_id?: number | null
          staff_id?: number | null
          subject?: string | null
          synced_at?: string
          task_id?: number | null
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          id: number
          user_id: string
          staff_accelo_id: number
          task_id: number
          started_at: string
          stopped_at: string
          duration_seconds: number
          rounded_seconds: number
          billable: boolean
          rate_id: number | null
          description: string | null
          synced_to_accelo_at: string | null
          created_at: string
        }
        Insert: {
          id?: never
          user_id: string
          staff_accelo_id: number
          task_id: number
          started_at: string
          stopped_at: string
          duration_seconds: number
          rounded_seconds: number
          billable?: boolean
          rate_id?: number | null
          description?: string | null
          synced_to_accelo_at?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          user_id?: string
          staff_accelo_id?: number
          task_id?: number
          started_at?: string
          stopped_at?: string
          duration_seconds?: number
          rounded_seconds?: number
          billable?: boolean
          rate_id?: number | null
          description?: string | null
          synced_to_accelo_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "rates"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_failures: {
        Row: {
          id: number
          entity_type: string
          entity_id: number
          operation: string
          payload: Json | null
          error_message: string | null
          attempts: number
          max_attempts: number
          next_retry_at: string | null
          resolved_at: string | null
          created_at: string
        }
        Insert: {
          id?: never
          entity_type: string
          entity_id: number
          operation: string
          payload?: Json | null
          error_message?: string | null
          attempts?: number
          max_attempts?: number
          next_retry_at?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Update: {
          id?: never
          entity_type?: string
          entity_id?: number
          operation?: string
          payload?: Json | null
          error_message?: string | null
          attempts?: number
          max_attempts?: number
          next_retry_at?: string | null
          resolved_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      recurring_task_templates: {
        Row: {
          id: number
          title: string
          company_id: number | null
          assignee_id: number | null
          recurrence: string
          day_of_week: number | null
          day_of_month: number | null
          default_status_id: number | null
          budgeted_seconds: number | null
          active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          title: string
          company_id?: number | null
          assignee_id?: number | null
          recurrence?: string
          day_of_week?: number | null
          day_of_month?: number | null
          default_status_id?: number | null
          budgeted_seconds?: number | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          title?: string
          company_id?: number | null
          assignee_id?: number | null
          recurrence?: string
          day_of_week?: number | null
          day_of_month?: number | null
          default_status_id?: number | null
          budgeted_seconds?: number | null
          active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_task_templates_default_status_id_fkey"
            columns: ["default_status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_task_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: Json
        }
        Insert: {
          key: string
          value: Json
        }
        Update: {
          key?: string
          value?: Json
        }
        Relationships: []
      }
      companies: {
        Row: {
          accelo_id: number
          id: number
          name: string
          synced_at: string
        }
        Insert: {
          accelo_id: number
          id?: never
          name: string
          synced_at?: string
        }
        Update: {
          accelo_id?: number
          id?: never
          name?: string
          synced_at?: string
        }
        Relationships: []
      }
      company_managers: {
        Row: {
          company_accelo_id: number
          staff_accelo_id: number
        }
        Insert: {
          company_accelo_id: number
          staff_accelo_id: number
        }
        Update: {
          company_accelo_id?: number
          staff_accelo_id?: number
        }
        Relationships: []
      }
      rates: {
        Row: {
          id: number
          standing: string
          title: string
        }
        Insert: {
          id: number
          standing?: string
          title: string
        }
        Update: {
          id?: number
          standing?: string
          title?: string
        }
        Relationships: []
      }
      staff: {
        Row: {
          accelo_id: number
          email: string | null
          firstname: string | null
          id: number
          rate_id: number | null
          surname: string | null
          synced_at: string
          username: string | null
        }
        Insert: {
          accelo_id: number
          email?: string | null
          firstname?: string | null
          id?: never
          rate_id?: number | null
          surname?: string | null
          synced_at?: string
          username?: string | null
        }
        Update: {
          accelo_id?: number
          email?: string | null
          firstname?: string | null
          id?: never
          rate_id?: number | null
          surname?: string | null
          synced_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_rate_id_fkey"
            columns: ["rate_id"]
            isOneToOne: false
            referencedRelation: "rates"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_cost_rates: {
        Row: {
          effective_from: string
          hourly_cost: number | null
          staff_accelo_id: number
        }
        Insert: {
          effective_from?: string
          hourly_cost?: number | null
          staff_accelo_id: number
        }
        Update: {
          effective_from?: string
          hourly_cost?: number | null
          staff_accelo_id?: number
        }
        Relationships: []
      }
      sync_watermarks: {
        Row: {
          entity: string
          last_synced_at: string
        }
        Insert: {
          entity: string
          last_synced_at?: string
        }
        Update: {
          entity?: string
          last_synced_at?: string
        }
        Relationships: []
      }
      task_statuses: {
        Row: {
          id: number
          ordering: number
          standing: string
          title: string
        }
        Insert: {
          id: number
          ordering: number
          standing: string
          title: string
        }
        Update: {
          id?: number
          ordering?: number
          standing?: string
          title?: string
        }
        Relationships: []
      }
      task_transitions: {
        Row: {
          detected_at: string
          from_status_id: number | null
          id: number
          task_accelo_id: number
          to_status_id: number | null
          transitioned_at: string
        }
        Insert: {
          detected_at?: string
          from_status_id?: number | null
          id?: never
          task_accelo_id: number
          to_status_id?: number | null
          transitioned_at?: string
        }
        Update: {
          detected_at?: string
          from_status_id?: number | null
          id?: never
          task_accelo_id?: number
          to_status_id?: number | null
          transitioned_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          accelo_id: number | null
          assignee_id: number | null
          company_id: number | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          due_date: string | null
          id: number
          job_id: number | null
          status_id: number | null
          synced_at: string
          synced_to_accelo_at: string | null
          title: string
        }
        Insert: {
          accelo_id?: number | null
          assignee_id?: number | null
          company_id?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: never
          job_id?: number | null
          status_id?: number | null
          synced_at?: string
          synced_to_accelo_at?: string | null
          title: string
        }
        Update: {
          accelo_id?: number | null
          assignee_id?: number | null
          company_id?: number | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          due_date?: string | null
          id?: never
          job_id?: number | null
          status_id?: number | null
          synced_at?: string
          synced_to_accelo_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          preferences: Json
          user_id: string
        }
        Insert: {
          preferences?: Json
          user_id: string
        }
        Update: {
          preferences?: Json
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_role: { Args: never; Returns: string }
      auth_staff_id: { Args: never; Returns: number }
      worker_task_company_ids: { Args: never; Returns: number[] }
      worker_visible_task_ids: { Args: never; Returns: number[] }
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

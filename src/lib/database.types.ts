export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string
          name: string
          invite_code: string
          event_date: string | null
          owner_id: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          invite_code: string
          event_date?: string | null
          owner_id: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          invite_code?: string
          event_date?: string | null
          owner_id?: string
          created_at?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          workspace_id: string
          user_id: string
          role: string
          joined_at: string
        }
        Insert: {
          workspace_id: string
          user_id: string
          role?: string
          joined_at?: string
        }
        Update: {
          workspace_id?: string
          user_id?: string
          role?: string
          joined_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          workspace_id: string
          parent_id: string | null
          title: string
          notes: string | null
          category: string
          due_date: string | null
          estimated_cost: number | null
          is_paid: boolean
          completed: boolean
          created_at: string
          created_by: string | null
        }
        Insert: {
          id?: string
          workspace_id: string
          parent_id?: string | null
          title: string
          notes?: string | null
          category?: string
          due_date?: string | null
          estimated_cost?: number | null
          is_paid?: boolean
          completed?: boolean
          created_at?: string
          created_by?: string | null
        }
        Update: {
          id?: string
          workspace_id?: string
          parent_id?: string | null
          title?: string
          notes?: string | null
          category?: string
          due_date?: string | null
          estimated_cost?: number | null
          is_paid?: boolean
          completed?: boolean
          created_at?: string
          created_by?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_wedding_workspace: {
        Args: { workspace_name: string; wedding_date?: string | null }
        Returns: string
      }
      join_wedding_workspace: {
        Args: { workspace_invite_code: string }
        Returns: string
      }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

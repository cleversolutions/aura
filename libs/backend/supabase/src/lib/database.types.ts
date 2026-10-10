export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: { Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      clubs: {
        Row: {
          admin_member_id: string | null;
          created_at: string;
          icon_192_url: string | null;
          icon_512_url: string | null;
          id: string;
          ink: string;
          logo_ink: string;
          logo_paper: string;
          logo_url: string;
          name: string;
          paper: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          admin_member_id?: string | null;
          created_at?: string;
          icon_192_url?: string | null;
          icon_512_url?: string | null;
          id?: string;
          ink: string;
          logo_ink: string;
          logo_paper: string;
          logo_url?: string;
          name: string;
          paper: string;
          slug: string;
        };
        Update: {
          admin_member_id?: string | null;
          created_at?: string;
          icon_192_url?: string | null;
          icon_512_url?: string | null;
          id?: string;
          ink?: string;
          logo_ink?: string;
          logo_paper?: string;
          logo_url?: string;
          name?: string;
          paper?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'clubs_admin_member_fk';
            columns: ['id', 'admin_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      events: {
        Row: {
          club_id: string;
          date: string | null;
          home: boolean | null;
          id: string;
          location: string;
          notes: string;
          opponent: string | null;
          score_them: number | null;
          score_us: number | null;
          tbd: boolean;
          team: string;
          time: string | null;
          title: string | null;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          date?: string | null;
          home?: boolean | null;
          id?: string;
          location?: string;
          notes?: string;
          opponent?: string | null;
          score_them?: number | null;
          score_us?: number | null;
          tbd?: boolean;
          team: string;
          time?: string | null;
          title?: string | null;
          type: string;
        };
        Update: {
          club_id?: string;
          date?: string | null;
          home?: boolean | null;
          id?: string;
          location?: string;
          notes?: string;
          opponent?: string | null;
          score_them?: number | null;
          score_us?: number | null;
          tbd?: boolean;
          team?: string;
          time?: string | null;
          title?: string | null;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'events_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      members: {
        Row: {
          club_id: string;
          email: string | null;
          id: string;
          invited: boolean;
          kind: string;
          name: string;
          title: string | null;
          user_id: string | null;
          username: string | null;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          email?: string | null;
          id?: string;
          invited?: boolean;
          kind: string;
          name: string;
          title?: string | null;
          user_id?: string | null;
          username?: string | null;
        };
        Update: {
          club_id?: string;
          email?: string | null;
          id?: string;
          invited?: boolean;
          kind?: string;
          name?: string;
          title?: string | null;
          user_id?: string | null;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'members_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'members_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          club_id: string;
          from_member_id: string;
          id: string;
          sent_at: string;
          text: string;
          thread_id: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          from_member_id: string;
          id?: string;
          sent_at?: string;
          text: string;
          thread_id: string;
        };
        Update: {
          club_id?: string;
          from_member_id?: string;
          id?: string;
          sent_at?: string;
          text?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_club_id_from_member_id_fkey';
            columns: ['club_id', 'from_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'messages_club_id_thread_id_fkey';
            columns: ['club_id', 'thread_id'];
            isOneToOne: false;
            referencedRelation: 'threads';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      player_profiles: {
        Row: {
          club_id: string;
          id: string;
          jersey: string;
          login: string;
          name: string;
          parent_member_id: string | null;
          pending: boolean;
          team_id: string;
          user_member_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          id?: string;
          jersey?: string;
          login?: string;
          name: string;
          parent_member_id?: string | null;
          pending?: boolean;
          team_id: string;
          user_member_id?: string | null;
        };
        Update: {
          club_id?: string;
          id?: string;
          jersey?: string;
          login?: string;
          name?: string;
          parent_member_id?: string | null;
          pending?: boolean;
          team_id?: string;
          user_member_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'player_profiles_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'player_profiles_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'player_profiles_club_id_parent_member_id_fkey';
            columns: ['club_id', 'parent_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'player_profiles_club_id_team_id_fkey';
            columns: ['club_id', 'team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'player_profiles_club_id_user_member_id_fkey';
            columns: ['club_id', 'user_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      rsvps: {
        Row: {
          attendee_id: string;
          club_id: string;
          event_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          attendee_id: string;
          club_id: string;
          event_id: string;
          status: string;
        };
        Update: {
          attendee_id?: string;
          club_id?: string;
          event_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rsvps_club_id_event_id_fkey';
            columns: ['club_id', 'event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'rsvps_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rsvps_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      team_members: {
        Row: {
          club_id: string;
          member_id: string;
          team_id: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          member_id: string;
          team_id: string;
        };
        Update: {
          club_id?: string;
          member_id?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_members_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_members_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_members_club_id_member_id_fkey';
            columns: ['club_id', 'member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'team_members_club_id_team_id_fkey';
            columns: ['club_id', 'team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      teams: {
        Row: {
          club_id: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          id: string;
          name: string;
        };
        Update: {
          club_id?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teams_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
      thread_members: {
        Row: {
          club_id: string;
          member_id: string;
          thread_id: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          member_id: string;
          thread_id: string;
        };
        Update: {
          club_id?: string;
          member_id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'thread_members_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'thread_members_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'thread_members_club_id_member_id_fkey';
            columns: ['club_id', 'member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'thread_members_club_id_thread_id_fkey';
            columns: ['club_id', 'thread_id'];
            isOneToOne: false;
            referencedRelation: 'threads';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      thread_mutes: {
        Row: {
          club_id: string;
          member_id: string;
          thread_id: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          member_id: string;
          thread_id: string;
        };
        Update: {
          club_id?: string;
          member_id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'thread_mutes_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'thread_mutes_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'thread_mutes_club_id_member_id_fkey';
            columns: ['club_id', 'member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'thread_mutes_club_id_thread_id_fkey';
            columns: ['club_id', 'thread_id'];
            isOneToOne: false;
            referencedRelation: 'threads';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      thread_reads: {
        Row: {
          club_id: string;
          last_read_at: string;
          member_id: string;
          thread_id: string;
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          last_read_at?: string;
          member_id: string;
          thread_id: string;
        };
        Update: {
          club_id?: string;
          last_read_at?: string;
          member_id?: string;
          thread_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'thread_reads_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'thread_reads_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'thread_reads_club_id_member_id_fkey';
            columns: ['club_id', 'member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'thread_reads_club_id_thread_id_fkey';
            columns: ['club_id', 'thread_id'];
            isOneToOne: false;
            referencedRelation: 'threads';
            referencedColumns: ['club_id', 'id'];
          },
        ];
      };
      threads: {
        Row: {
          club_id: string;
          created_at: string;
          creator_member_id: string | null;
          id: string;
          include_parents: boolean;
          include_players: boolean;
          include_staff: boolean;
          is_default: boolean;
          name: string;
          scope: string;
          teams: string[];
        };
        ComputedFields: never;
        Insert: {
          club_id: string;
          created_at?: string;
          creator_member_id?: string | null;
          id?: string;
          include_parents?: boolean;
          include_players?: boolean;
          include_staff?: boolean;
          is_default?: boolean;
          name: string;
          scope: string;
          teams?: string[];
        };
        Update: {
          club_id?: string;
          created_at?: string;
          creator_member_id?: string | null;
          id?: string;
          include_parents?: boolean;
          include_players?: boolean;
          include_staff?: boolean;
          is_default?: boolean;
          name?: string;
          scope?: string;
          teams?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'threads_club_id_creator_member_id_fkey';
            columns: ['club_id', 'creator_member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['club_id', 'id'];
          },
          {
            foreignKeyName: 'threads_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'club_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'threads_club_id_fkey';
            columns: ['club_id'];
            isOneToOne: false;
            referencedRelation: 'clubs';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      club_public: {
        Row: {
          icon_192_url: string | null;
          icon_512_url: string | null;
          id: string | null;
          ink: string | null;
          logo_url: string | null;
          name: string | null;
          paper: string | null;
          slug: string | null;
        };
        ComputedFields: never;
        Insert: {
          icon_192_url?: string | null;
          icon_512_url?: string | null;
          id?: string | null;
          ink?: string | null;
          logo_url?: string | null;
          name?: string | null;
          paper?: string | null;
          slug?: string | null;
        };
        Update: {
          icon_192_url?: string | null;
          icon_512_url?: string | null;
          id?: string | null;
          ink?: string | null;
          logo_url?: string | null;
          name?: string | null;
          paper?: string | null;
          slug?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      accept_invite: { Args: Record<PropertyKey, never>; Returns: undefined };
      auth_club_id: { Args: Record<PropertyKey, never>; Returns: string };
      auth_member: {
        Args: Record<PropertyKey, never>;
        Returns: {
          club_id: string;
          email: string | null;
          id: string;
          invited: boolean;
          kind: string;
          name: string;
          title: string | null;
          user_id: string | null;
          username: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'members';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      auth_member_id: { Args: Record<PropertyKey, never>; Returns: string };
      can_edit_event: { Args: { p_team: string }; Returns: boolean };
      can_manage_thread: { Args: { p_thread: string }; Returns: boolean };
      can_rsvp_for: { Args: { p_attendee: string }; Returns: boolean };
      is_club_staff: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_thread_member: { Args: { p_thread: string }; Returns: boolean };
      kind_included: {
        Args: { p_kind: string; p_parents: boolean; p_players: boolean; p_staff: boolean };
        Returns: boolean;
      };
      list_my_threads: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          creator_member_id: string;
          id: string;
          include_parents: boolean;
          include_players: boolean;
          include_staff: boolean;
          is_default: boolean;
          members: string[];
          name: string;
          scope: string;
          teams: string[];
          unread: number;
        }[];
      };
      mark_thread_read: { Args: { p_thread: string }; Returns: undefined };
      member_teams: { Args: { p_member: string }; Returns: string[] };
      platform_clubs: {
        Args: Record<PropertyKey, never>;
        Returns: {
          admin_email: string;
          admin_name: string;
          created_at: string;
          icon_192_url: string;
          icon_512_url: string;
          id: string;
          ink: string;
          logo_ink: string;
          logo_paper: string;
          logo_url: string;
          name: string;
          paper: string;
          slug: string;
        }[];
      };
      thread_member_ids: { Args: { p_thread: string }; Returns: string[] };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;

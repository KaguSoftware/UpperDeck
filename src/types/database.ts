export type Role = "admin" | "owner";

export type Profile = {
  id: string;
  role: Role;
  display_name: string | null;
  created_at: string;
  updated_at: string;
};

export type Category = {
  id: string;
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type MenuItem = {
  id: string;
  category_id: string;
  name_en: string;
  name_tr: string;
  hook_en: string;
  hook_tr: string;
  desc_en: string;
  desc_tr: string;
  emoji: string;
  highlight: "green-fill" | "orange-fill" | null;
  image_url: string | null;
  price: number;
  spicy: boolean;
  is_available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

type ProfileInsert = {
  id: string;
  role?: Role;
  display_name?: string | null;
};

type ProfileUpdate = Partial<{
  role: Role;
  display_name: string | null;
}>;

type CategoryInsert = {
  id?: string;
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order?: number;
  created_by?: string | null;
};

type CategoryUpdate = Partial<{
  slug: string;
  name_en: string;
  name_tr: string;
  sort_order: number;
}>;

type MenuItemInsert = {
  id?: string;
  category_id: string;
  name_en: string;
  name_tr: string;
  hook_en?: string;
  hook_tr?: string;
  desc_en?: string;
  desc_tr?: string;
  emoji?: string;
  highlight?: "green-fill" | "orange-fill" | null;
  image_url?: string | null;
  price: number;
  spicy?: boolean;
  is_available?: boolean;
  sort_order?: number;
  created_by?: string | null;
};

type MenuItemUpdate = Partial<Omit<MenuItem, "id" | "created_at" | "updated_at" | "created_by">>;

export type Database = {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: CategoryInsert;
        Update: CategoryUpdate;
        Relationships: [];
      };
      menu_items: {
        Row: MenuItem;
        Insert: MenuItemInsert;
        Update: MenuItemUpdate;
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { user_role: Role };
    CompositeTypes: Record<string, never>;
  };
};

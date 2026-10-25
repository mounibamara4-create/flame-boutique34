// Flame Boutique34 settings. Nothing secret belongs here: the publishable key is public by design
// (the Row Level Security rules in supabase/schema.sql decide what it may do), and the owner's password lives in Supabase.
window.FB_CONFIG = {
  SUPABASE_URL: "https://ylsdqltrjrclzwngsgpi.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_2Lq088eq-IBYrHDjrn4npA_SEi2Xxn1",  // the project's publishable key
  ADMIN_EMAIL: ""  // optional: the owner account's email; left empty, the dashboard asks for it with the password
};

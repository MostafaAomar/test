# Supabase login and cross-device sync for UniQuiz

The ZIP contains the corrected current app. Supabase is not enabled until you
create a project, run the SQL below, and add the login/sync code to the UI.

## 1. Create the Supabase project

1. Create a project at https://supabase.com/dashboard.
2. In the project, open **Connect** and copy:
   - Project URL
   - Publishable key (`sb_publishable_...`)
3. Never copy an `sb_secret_...` or legacy `service_role` key into HTML or
   JavaScript. A secret key bypasses Row Level Security and belongs only in a
   trusted server environment.

## 2. Create the synchronized-data table

Open **SQL Editor** in Supabase, paste this SQL, and run it:

```sql
create table public.user_app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_data enable row level security;

revoke all on table public.user_app_data from anon;
grant select, insert, update, delete
  on table public.user_app_data to authenticated;

create policy "Users can read their own UniQuiz data"
on public.user_app_data
for select
to authenticatedMem082026@#83
using ((select auth.uid()) = user_id);

create policy "Users can create their own UniQuiz data"
on public.user_app_data
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own UniQuiz data"
on public.user_app_data
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own UniQuiz data"
on public.user_app_data
for delete
to authenticated
using ((select auth.uid()) = user_id);
```

Each authenticated user gets one row. The `data` JSON object can contain the
existing vocabulary, notes, question progress, and last position exactly as
they are currently stored in `localStorage`.

## 3. Create or invite users

For the safest admin-managed workflow:

1. Open **Authentication > Users**.
2. Select **Add user > Send invitation**.
3. Enter the approved email address.
4. The user follows the email link and chooses a password.

Do not keep user passwords in GitHub or in the `user_app_data` table. Supabase
Auth securely handles them.

## 4. Load the browser client

Add this before `app.js` near the bottom of `index.html`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script>
  const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YOUR_KEY";
  const supabaseClient = supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
</script>
<script src="app.js"></script>
```

The publishable key is designed for browser use when Row Level Security is
enabled. Do not use a secret/admin key here.

## 5. Login code

Connect your email and password form to this function:

```js
async function loginWithSupabase(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;
  await downloadUserData();
  return data.user;
}

async function logoutFromSupabase() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}
```

## 6. Upload the current browser data

The following keeps the values as raw strings so they can be restored to
`localStorage` without changing their format:

```js
const SYNC_EXACT_KEYS = new Set([
  "app_last_position",
  "uniquiz_vocabulary_entries_v1"
]);

const SYNC_KEY_PREFIXES = [
  "progress_",
  "note_",
  "year_data_"
];

function collectUserData() {
  const payload = {};

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key) continue;

    const shouldSync = SYNC_EXACT_KEYS.has(key)
      || SYNC_KEY_PREFIXES.some(prefix => key.startsWith(prefix));

    if (shouldSync) payload[key] = localStorage.getItem(key);
  }

  return payload;
}

async function uploadUserData() {
  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) throw new Error("Please log in first.");

  const { error } = await supabaseClient
    .from("user_app_data")
    .upsert({
      user_id: authData.user.id,
      data: collectUserData(),
      updated_at: new Date().toISOString()
    });

  if (error) throw error;
}
```

Call `uploadUserData()` after a word, note, or progress update. Debounce frequent
progress saves so the app does not send a request for every small UI event.

## 7. Download data after login

```js
async function downloadUserData() {
  const { data: authData, error: authError } =
    await supabaseClient.auth.getUser();

  if (authError) throw authError;
  if (!authData.user) throw new Error("Please log in first.");

  const { data: row, error } = await supabaseClient
    .from("user_app_data")
    .select("data")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!row?.data) return;

  Object.entries(row.data).forEach(([key, value]) => {
    if (typeof value === "string") localStorage.setItem(key, value);
  });

  location.reload();
}
```

## Important change to the current reset function

The existing `fullReset()` uses `localStorage.clear()`. Supabase normally keeps
its browser session in local storage, so clearing everything will also sign the
user out. Change reset behavior to delete only the UniQuiz keys listed above,
or explicitly accept that a full reset also logs the user out.

Official references:

- https://supabase.com/docs/reference/javascript/initializing
- https://supabase.com/docs/reference/javascript/auth-signinwithpassword
- https://supabase.com/docs/guides/auth/users
- https://supabase.com/docs/guides/database/postgres/row-level-security

-- ==========================================================
-- ZAYAIN — SCHEMA SUPABASE UNTUK SINKRONISASI OTOMATIS
-- Jalankan file ini SEKALI di project Supabase kamu:
-- Dashboard Supabase > SQL Editor > New query > paste semua
-- isi file ini > Run.
--
-- Tabel ini adalah "penyimpanan key-value" per user yang dipakai
-- oleh cloud-sync.js untuk menyimpan seluruh data localStorage
-- aplikasi (transaksi, target, dompet, tagihan, dll) ke cloud,
-- supaya otomatis sinkron ke semua perangkat begitu login dengan
-- akun yang sama.
-- ==========================================================

-- 1) Tabel utama
create table if not exists public.kv_store (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- Index bantu untuk query per user (SELECT * WHERE user_id = ...)
create index if not exists kv_store_user_id_idx on public.kv_store (user_id);

-- 2) Aktifkan Row Level Security (WAJIB — supaya user A tidak
--    bisa baca/tulis/hapus data milik user B)
alter table public.kv_store enable row level security;

-- 3) Policy: user hanya boleh akses baris miliknya sendiri
--    (drop dulu kalau sudah pernah ada, biar bisa dijalankan ulang
--    tanpa error saat re-run script ini)
drop policy if exists "kv_store_select_own" on public.kv_store;
create policy "kv_store_select_own"
  on public.kv_store for select
  using (auth.uid() = user_id);

drop policy if exists "kv_store_insert_own" on public.kv_store;
create policy "kv_store_insert_own"
  on public.kv_store for insert
  with check (auth.uid() = user_id);

drop policy if exists "kv_store_update_own" on public.kv_store;
create policy "kv_store_update_own"
  on public.kv_store for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "kv_store_delete_own" on public.kv_store;
create policy "kv_store_delete_own"
  on public.kv_store for delete
  using (auth.uid() = user_id);

-- 3b) Tabel "workspace_members" -- daftar user yang DITAMBAHKAN SECARA
--     MANUAL oleh pemilik akun lewat halaman "User Account" di app,
--     supaya orang itu punya login SUNGGUHAN (akun Supabase Auth
--     sendiri, email+password sendiri) TAPI tetap melihat & mengelola
--     data YANG SAMA dengan pemilik akun (owner_id), bukan data
--     kosong terpisah. `role` menentukan izin di dalam app ('admin'
--     = akses penuh spt pemilik, 'user' = akses terbatas -- lihat
--     window.zayaproRole/zayaproIsOwner di cloud-sync.js & pengecekan
--     izinnya di script.js). Cuma PEMILIK ASLI (owner_id, yaitu akun
--     yang pertama kali daftar, BUKAN sekadar role='admin') yang boleh
--     menambah/mengedit/menghapus baris di tabel ini -- lihat policy
--     di bawah -- supaya tidak perlu logic RLS berantai/rekursif utk
--     "admin lain juga boleh kelola user".
create table if not exists public.workspace_members (
  owner_id    uuid not null references auth.users(id) on delete cascade,
  member_id   uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'user' check (role in ('admin','user')),
  name        text not null default '',
  email       text not null default '',
  -- Fitur mana saja yang boleh dipakai user ini (dicentang dari
  -- halaman User Account > form Tambah/Edit User): transaksi,
  -- tagihan, sumber_dana, tanya_ai, reset_db (boolean masing-masing).
  -- Dibaca/ditulis via cloudAddMember/cloudUpdateMember di
  -- cloud-sync.js, dipakai applyRolePermissionsUI() di script.js.
  permissions jsonb not null default '{"transaksi":true,"tagihan":true,"sumber_dana":true,"tanya_ai":true,"reset_db":false}'::jsonb,
  created_at  timestamptz not null default now(),
  primary key (owner_id, member_id)
);
create index if not exists workspace_members_member_id_idx on public.workspace_members (member_id);
-- Kalau tabelnya sudah ada dari sebelumnya (versi lama tanpa kolom
-- email/permissions), tambahkan kolomnya di sini supaya upgrade
-- tinggal jalankan file ini lagi tanpa perlu drop table.
alter table public.workspace_members add column if not exists email text not null default '';
alter table public.workspace_members add column if not exists permissions jsonb not null default '{"transaksi":true,"tagihan":true,"sumber_dana":true,"tanya_ai":true,"reset_db":false}'::jsonb;

alter table public.workspace_members enable row level security;

-- Baris keanggotaan boleh dibaca oleh si pemilik (utk menampilkan
-- daftar user di halaman User Account) MAUPUN oleh si anggota itu
-- sendiri (supaya cloud-sync.js tahu dia anggota workspace siapa &
-- apa role-nya begitu dia login).
drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select"
  on public.workspace_members for select
  using (auth.uid() = owner_id or auth.uid() = member_id);

drop policy if exists "workspace_members_insert_owner" on public.workspace_members;
create policy "workspace_members_insert_owner"
  on public.workspace_members for insert
  with check (auth.uid() = owner_id);

drop policy if exists "workspace_members_update_owner" on public.workspace_members;
create policy "workspace_members_update_owner"
  on public.workspace_members for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "workspace_members_delete_owner" on public.workspace_members;
create policy "workspace_members_delete_owner"
  on public.workspace_members for delete
  using (auth.uid() = owner_id);

-- 3c) PENTING -- perluas policy kv_store DI ATAS supaya user yang
--     ditambahkan lewat User Account (workspace_members) ikut bisa
--     baca/tulis/hapus data MILIK PEMILIKNYA (bukan cuma data
--     miliknya sendiri), karena itulah intinya "supaya benar-benar
--     sinkron & bisa dipakai login". Dijalankan ulang di sini (drop +
--     create lagi) supaya policy lama di atas TERGANTIKAN, bukan
--     dobel.
drop policy if exists "kv_store_select_own" on public.kv_store;
create policy "kv_store_select_own"
  on public.kv_store for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.workspace_members wm where wm.owner_id = kv_store.user_id and wm.member_id = auth.uid())
  );

drop policy if exists "kv_store_insert_own" on public.kv_store;
create policy "kv_store_insert_own"
  on public.kv_store for insert
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.workspace_members wm where wm.owner_id = kv_store.user_id and wm.member_id = auth.uid())
  );

drop policy if exists "kv_store_update_own" on public.kv_store;
create policy "kv_store_update_own"
  on public.kv_store for update
  using (
    auth.uid() = user_id
    or exists (select 1 from public.workspace_members wm where wm.owner_id = kv_store.user_id and wm.member_id = auth.uid())
  )
  with check (
    auth.uid() = user_id
    or exists (select 1 from public.workspace_members wm where wm.owner_id = kv_store.user_id and wm.member_id = auth.uid())
  );

drop policy if exists "kv_store_delete_own" on public.kv_store;
create policy "kv_store_delete_own"
  on public.kv_store for delete
  using (
    auth.uid() = user_id
    or exists (select 1 from public.workspace_members wm where wm.owner_id = kv_store.user_id and wm.member_id = auth.uid())
  );

-- CATATAN KEAMANAN: policy di atas mengizinkan SEMUA anggota
-- workspace (baik role 'admin' maupun 'user') untuk baca/tulis/hapus
-- data kv_store yang sama. Pembatasan role 'user' (mis. tidak boleh
-- buka halaman User Account / Reset Database Online) HANYA
-- diberlakukan di sisi tampilan app (script.js), bukan di database --
-- jadi murni mencegah ketidaksengajaan lewat UI, BUKAN proteksi
-- teknis penuh terhadap user yang sengaja utak-atik lewat console
-- browser. Wajar untuk skala tim kecil/keluarga; kalau butuh proteksi
-- lebih ketat, beri tahu saya supaya dibuatkan policy per-role.

-- 4) (Opsional tapi direkomendasikan) Matikan "Confirm email" kalau
--    mau user langsung bisa login setelah daftar tanpa cek email:
--    Dashboard > Authentication > Providers > Email > matikan
--    "Confirm email". Ini tidak bisa diatur lewat SQL, cuma lewat
--    dashboard.

-- 5) Realtime broadcast (untuk fitur "Reset Database Online" yang
--    langsung live ke semua perangkat) TIDAK butuh setup tambahan
--    di sini karena cloud-sync.js pakai channel Broadcast, bukan
--    replikasi tabel. Tidak perlu "Enable Realtime" di tabel ini.

-- SELESAI. Setelah ini dijalankan, buka aplikasi, daftar/login,
-- lalu coba tambah 1 transaksi -- cek di Table Editor > kv_store,
-- baris baru harus otomatis muncul dalam 1 detik.

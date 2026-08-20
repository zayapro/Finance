-- ==========================================================
-- ZAYAPRO — SCHEMA SUPABASE UNTUK SINKRONISASI OTOMATIS
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

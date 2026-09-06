/* ==========================================================
   SUPABASE CLIENT + AUTH
   Ganti SUPABASE_URL dan SUPABASE_ANON_KEY di bawah dengan
   punya kamu sendiri (Settings > API di dashboard Supabase).
   Anon key AMAN dipasang di frontend selama RLS sudah aktif.
========================================================== */
const SUPABASE_URL = 'https://irjbamgmdbgszkheglig.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dVKTD1xIk3KFilHiPYNFOg_LNQ_8JMF';

if (!window.supabase) {
  throw new Error('Gagal load Supabase library dari CDN. Cek koneksi internet atau apakah CDN diblokir.');
}
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- State user yang sedang login ---------- */
let currentUser = null;

/* ---------- Daftar akun baru ---------- */
async function zpSignUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/* ---------- Login ---------- */
async function zpSignIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  currentUser = data.user;
  return data;
}

/* ---------- Logout ---------- */
async function zpSignOut() {
  await supabase.auth.signOut();
  currentUser = null;
}

/* ---------- Cek sesi yang sudah tersimpan (biar tidak perlu login ulang tiap buka web) ---------- */
async function zpGetSession() {
  const { data } = await supabase.auth.getSession();
  currentUser = data.session ? data.session.user : null;
  return currentUser;
}

/* ---------- Pantau perubahan status login (misal logout di tab lain) ---------- */
supabase.auth.onAuthStateChange((event, session) => {
  currentUser = session ? session.user : null;
  if (event === 'SIGNED_OUT') {
    // Ganti dengan fungsi kamu sendiri untuk menampilkan layar login lagi
    if (typeof zpShowLoginScreen === 'function') zpShowLoginScreen();
  }
});

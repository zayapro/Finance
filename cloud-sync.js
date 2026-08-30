/* ==========================================================
   ZAYAin — CLOUD SYNC (Supabase)
   Modul ini HARUS dimuat SEBELUM script.js.
   Menyediakan `window.cloudStorage`: pengganti drop-in untuk
   `localStorage` (API sama: getItem/setItem/removeItem) yang
   secara sinkron tetap menulis ke localStorage (supaya semua
   logika di script.js yang sifatnya sinkron tidak perlu diubah
   satu per satu), TAPI juga mendorong (push) & menarik (pull)
   perubahan ke/dari tabel `kv_store` di Supabase di latar
   belakang, sehingga data yang sama muncul di semua perangkat
   begitu login dengan akun yang sama.

   Alurnya:
   1. Saat halaman dibuka, cek sesi login Supabase.
   2. Kalau belum login -> tampilkan overlay login/daftar,
      script.js BELUM dijalankan (init() ditahan).
   3. Kalau sudah login -> tarik semua data dari kv_store,
      timpa ke localStorage, baru jalankan init() script.js.
   4. Setiap kali script.js memanggil cloudStorage.setItem(),
      selain menulis ke localStorage juga di-upsert (debounced)
      ke kv_store.
========================================================== */
(function () {
  const SUPABASE_URL = 'https://irjbamgmdbgszkheglig.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_dVKTD1xIk3KFilHiPYNFOg_LNQ_8JMF';

  // Key yang SENGAJA tidak disinkron ke cloud (murni cache atau
  // sensitif/perangkat-spesifik):
  //  - cache berita: cuma cache sementara, tidak penting disamakan
  //  - API key Gemini pribadi user & riwayat chat AI: disimpan lokal saja
  //  - 'zayapro_this_device_id' = ID unik "perangkat ini" utk fitur
  //    Manajemen Device (lihat deviceMgmtGetLocalId() di script.js).
  //    Key ini SENGAJA ditulis LANGSUNG ke localStorage biasa (bukan
  //    lewat cloudStorage) supaya murni per-browser & TIDAK PERNAH
  //    di-push ke kv_store. TANPA dikecualikan di sini, key ini
  //    dianggap pullAllFromCloud() sbg "key lokal yg sudah tidak ada
  //    di cloud" (krn memang tidak pernah ada di cloud) lalu ikut
  //    DIHAPUS setiap refresh/buka app dgn sesi aktif -- akibatnya
  //    deviceMgmtGetLocalId() mengira ini "perangkat baru" tiap kali &
  //    generate ID acak baru lagi, sehingga perangkat yg SAMA
  //    terdaftar berulang-ulang sbg entri baru & daftar perangkat
  //    terus bertambah tiap di-refresh. (Bug fix)
  const CLOUD_EXCLUDE_EXACT = ['zayapro_ai_settings', 'zayapro_ai_chat_history', 'zayapro_this_device_id'];
  // 'sb-' = prefix key internal yang dipakai Supabase sendiri untuk
  // menyimpan token sesi login (mis. "sb-<ref>-auth-token") di
  // localStorage. WAJIB dikecualikan dari sinkron/pembersihan di
  // bawah -- kalau tidak, key ini ikut terhapus setiap kali
  // pullAllFromCloud() atau reset database membersihkan key yang
  // "tidak ada di cloud", karena token sesi memang bukan data
  // aplikasi yang tersimpan di kv_store. Akibatnya sesi login hilang
  // begitu halaman di-reload (dilempar balik ke layar login) padahal
  // baru saja berhasil login. (Bug fix)
  // 'zayapro_biometric_cred_' = ID kredensial WebAuthn (Login
  // Biometrik), lihat enableBiometric()/isBiometricEnabled() di
  // window.zayaproAuth. Ini SENGAJA murni device-local (kredensial
  // sidik jari/Face ID cuma berlaku utk perangkat yg mendaftarkannya,
  // tidak bisa & tidak boleh dipindah ke perangkat lain lewat cloud)
  // dan memang TIDAK PERNAH di-push ke kv_store. Tanpa dikecualikan
  // di sini, key ini ikut terhapus setiap pullAllFromCloud() jalan
  // (setiap refresh/buka app dgn sesi aktif) krn dianggap "key lokal
  // yg sudah tidak ada di cloud" -- itulah sebabnya toggle Login
  // Biometrik kembali OFF sendiri tiap kali di-refresh. (Bug fix)
  const CLOUD_EXCLUDE_PREFIX = ['alirin_news_cache_v1_', 'sb-', 'zayapro_biometric_cred_'];
  function isCloudExcluded(key) {
    if (CLOUD_EXCLUDE_EXACT.indexOf(key) !== -1) return true;
    return CLOUD_EXCLUDE_PREFIX.some(function (p) { return key.indexOf(p) === 0; });
  }

  // Penanda "reset database sedang diproses" -- dipakai supaya
  // pembersihan localStorage BENAR-BENAR dilakukan di awal proses
  // load halaman yang baru (lihat boot() di bawah), bukan di halaman
  // lama yang mungkin masih ada kode/interval berjalan di baliknya
  // yang berisiko menulis ulang data lama ke localStorage lalu
  // ke-upload lagi ke cloud sebelum reload sempat terjadi. Key ini
  // murni penanda lokal, tidak pernah lewat cloudStorage/di-push ke
  // cloud sama sekali.
  const RESET_PENDING_KEY = '__zayapro_cloud_reset_pending__';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window._sb = sb; // tersedia untuk debug di console kalau perlu

  let currentUser = null;
  const pushTimers = {};
  let appStarted = false;
  // Channel Supabase Realtime (Broadcast) yang dipakai supaya sinyal
  // "Reset Database Online" sampai LIVE ke semua perangkat/tab lain
  // yang sedang login dengan akun yang sama -- tanpa mereka perlu
  // reload manual dulu. Dibuat begitu user diketahui login (lihat
  // subscribeResetChannel), dan dilepas saat logout.
  let resetChannel = null;
  // Dinyalakan di awal cloudResetDatabase() untuk memblokir SEMUA
  // push baru ke cloud (lihat cloudStorage.setItem di bawah). Ini
  // menutup celah race condition: tanpa flag ini, sebuah
  // queuePush() yang sudah terlanjur ter-debounce (700ms) sebelum
  // tombol reset ditekan bisa saja "menembak" upsert tepat saat
  // atau setelah proses delete reset berjalan, sehingga data lama
  // muncul lagi di cloud walau baru saja dihapus.
  let resetting = false;

  /* ---------- wrapper localStorage-compatible ---------- */
  const cloudStorage = {
    getItem: function (key) {
      return localStorage.getItem(key);
    },
    removeItem: function (key) {
      localStorage.removeItem(key);
      if (currentUser && !isCloudExcluded(key)) {
        sb.from('kv_store').delete().eq('user_id', currentUser.id).eq('key', key)
          .then(function (res) { if (res.error) console.error('Cloud sync (delete) gagal:', key, res.error); });
      }
    },
    setItem: function (key, value) {
      localStorage.setItem(key, value);
      // `resetting` sengaja dicek di sini (bukan cuma di
      // cloudResetDatabase) supaya SETIAP jalur yang bisa memicu
      // push -- termasuk kode lain yang mungkin menulis ke
      // cloudStorage tepat di sela-sela proses reset -- otomatis
      // ikut diblokir, bukan cuma timer yang sudah terlanjur ada.
      if (currentUser && !isCloudExcluded(key) && !resetting) {
        queuePush(key, value);
      }
    },
    key: function (i) { return localStorage.key(i); },
    get length() { return localStorage.length; }
  };
  window.cloudStorage = cloudStorage;

  function setSyncBadge(state) {
    const badge = document.getElementById('cloudSyncBadge');
    const text = document.getElementById('cloudSyncBadgeText');
    if (!badge || !text) return;
    badge.style.display = 'flex';
    badge.classList.toggle('err', state === 'err');
    text.textContent = state === 'err' ? 'Gagal sinkron' : (state === 'syncing' ? 'Menyinkron...' : 'Tersinkron');
    if (state !== 'err') {
      clearTimeout(setSyncBadge._t);
      setSyncBadge._t = setTimeout(function () { badge.style.display = 'none'; }, 1600);
    }
  }

  function queuePush(key, rawValue) {
    clearTimeout(pushTimers[key]);
    pushTimers[key] = setTimeout(function () {
      let payload;
      try { payload = JSON.parse(rawValue); }
      catch (e) { payload = rawValue; } // string biasa (bukan JSON), simpan apa adanya
      sb.from('kv_store').upsert({
        user_id: currentUser.id,
        key: key,
        value: payload,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,key' }).then(function (res) {
        if (res.error) { console.error('Cloud sync (push) gagal:', key, res.error); setSyncBadge('err'); }
        else { setSyncBadge('ok'); }
      });
    }, 700);
  }

  async function pullAllFromCloud() {
    const { data, error } = await sb.from('kv_store').select('key,value').eq('user_id', currentUser.id);
    if (error) { console.error('Gagal menarik data cloud:', error); return false; }

    // Kumpulkan dulu key mana saja yang ADA di cloud sekarang, sambil
    // menulis nilainya ke localStorage.
    const cloudKeys = new Set();
    data.forEach(function (row) {
      cloudKeys.add(row.key);
      // Nilai object/array dari jsonb perlu di-stringify lagi supaya
      // format di localStorage sama seperti saat aplikasi menulisnya
      // sendiri (lihat pembacaan JSON.parse(localStorage.getItem(...))
      // yang tersebar di script.js). Nilai string murni (bukan hasil
      // JSON.stringify sebelumnya, mis. tanggal "2026-08-20") ditulis
      // apa adanya.
      const v = row.value;
      const strVal = (typeof v === 'string') ? v : JSON.stringify(v);
      localStorage.setItem(row.key, strVal);
    });

    // PENTING (perbaikan bug): hapus juga key lokal yang ikut
    // disinkron ke cloud (bukan key yang sengaja dikecualikan) tapi
    // SUDAH TIDAK ADA lagi di cloud. Tanpa langkah ini, pull cuma
    // menambah/menimpa data baru dan membiarkan data lama nyangkut
    // di localStorage kalau data itu sudah dihapus lewat perangkat
    // lain -- termasuk lewat "Reset Database Online". Akibatnya
    // reset/hapus yang dilakukan di satu perangkat TIDAK ikut
    // kepakai di perangkat lain begitu perangkat lain itu dibuka/
    // di-reload, karena data lama yang masih nyangkut di
    // localStorage-nya tidak pernah dibersihkan, dan malah bisa
    // ke-push balik ke cloud saat aplikasi jalan lagi (seolah reset
    // tidak pernah terjadi). Dengan ini, cloud jadi sumber kebenaran
    // setiap kali data ditarik (login / reload halaman).
    Object.keys(localStorage).forEach(function (key) {
      if (key === RESET_PENDING_KEY) return; // penanda lokal murni, bukan data app
      if (isCloudExcluded(key)) return; // memang sengaja device-only
      if (!cloudKeys.has(key)) localStorage.removeItem(key);
    });

    return true;
  }

  // ---- Pull SEBAGIAN (cuma key tertentu), tanpa efek samping pullAllFromCloud() ----
  // pullAllFromCloud() di atas SENGAJA agresif (menimpa & MENGHAPUS key lokal yg
  // sudah tidak ada di cloud) supaya cocok dipakai saat login/reload penuh -- tapi
  // itu berisiko kalau dipanggil dari tombol kecil di tengah sesi yg sedang jalan
  // (mis. ada data lokal-lain yg belum sempat ke-push, bisa ikut kehapus). Fungsi
  // ini dibuat KHUSUS utk kasus spt tombol refresh Manajemen Device: cuma menarik
  // & menimpa key yg diminta, tidak menyentuh/menghapus key lain sama sekali.
  window.cloudPullKeys = async function (keys) {
    if (!currentUser) return false; // mode lokal (tanpa akun) -- tidak ada apa2 di cloud utk ditarik
    try {
      const { data, error } = await sb.from('kv_store').select('key,value')
        .eq('user_id', currentUser.id).in('key', keys);
      if (error) { console.error('Gagal menarik data cloud (sebagian):', error); return false; }
      data.forEach(function (row) {
        const v = row.value;
        const strVal = (typeof v === 'string') ? v : JSON.stringify(v);
        localStorage.setItem(row.key, strVal);
      });
      return true;
    } catch (e) {
      console.error('Gagal menarik data cloud (sebagian):', e);
      return false;
    }
  };

  /* ---------- sinyal reset live antar perangkat (Realtime Broadcast) ----------
     Broadcast TIDAK butuh publication/replikasi tabel, cukup satu topik
     channel per user. Setiap perangkat yang login akun yang sama
     "join" topik ini; begitu salah satu perangkat menekan tombol
     Reset Database Online, semua perangkat lain yang sedang online di
     topik itu langsung menerima event 'db_reset' dan ikut membersihkan
     dirinya sendiri saat itu juga (tidak perlu tunggu reload manual). */
  function resetTopicFor(userId) { return 'db-reset-' + userId; }

  function subscribeResetChannel(userId) {
    if (resetChannel) return; // sudah ter-subscribe untuk sesi ini
    resetChannel = sb.channel(resetTopicFor(userId), { config: { broadcast: { self: false } } });
    resetChannel.on('broadcast', { event: 'db_reset' }, function () {
      handleRemoteReset();
    });
    resetChannel.subscribe();
  }

  function unsubscribeResetChannel() {
    if (resetChannel) {
      sb.removeChannel(resetChannel);
      resetChannel = null;
    }
  }

  // Dipanggil di perangkat LAIN (bukan yang menekan tombol reset)
  // begitu broadcast 'db_reset' diterima. Bersihkan localStorage
  // device ini juga (data cloud-nya sudah pasti kosong, karena
  // broadcast baru dikirim SETELAH delete ke kv_store sukses), lalu
  // reload supaya aplikasi mulai lagi dari kondisi kosong -- sama
  // persis seperti yang terjadi di perangkat yang menekan tombolnya.
  function handleRemoteReset() {
    resetting = true;
    Object.keys(pushTimers).forEach(function (k) { clearTimeout(pushTimers[k]); });
    Object.keys(localStorage).forEach(function (key) {
      if (key === RESET_PENDING_KEY) return;
      if (isCloudExcluded(key)) return;
      localStorage.removeItem(key);
    });
    alert('Database telah direset dari perangkat lain. Halaman akan dimuat ulang.');
    location.reload();
  }

  /* ---------- overlay login/daftar ---------- */
  const overlay = document.getElementById('cloudAuthOverlay');
  const authCard = overlay ? overlay.querySelector('.cloud-auth-card') : null;
  const form = document.getElementById('cloudAuthForm');
  const nameInput = document.getElementById('cloudAuthName');
  const emailInput = document.getElementById('cloudAuthEmail');
  const passInput = document.getElementById('cloudAuthPassword');
  const passToggle = document.getElementById('cloudAuthPwToggle');
  const pinInput = document.getElementById('cloudAuthPin');
  const pinConfirmInput = document.getElementById('cloudAuthPinConfirm');
  const msgBox = document.getElementById('cloudAuthMsg');
  const submitBtn = document.getElementById('cloudAuthSubmitBtn');
  const titleEl = document.getElementById('cloudAuthTitle');
  const switchText = document.getElementById('cloudAuthSwitchText');
  const switchLink = document.getElementById('cloudAuthSwitchLink');

  let mode = 'login'; // 'login' | 'signup'

  /* ---------- util hash PIN (SHA-256, bukan dienkripsi 2 arah -- cukup
     buat kunci-cepat lokal, BUKAN pengganti keamanan email+password
     yang tetap jadi gerbang otentikasi utama ke Supabase/RLS) ----------
     Digarami pakai email (bukan user id) supaya bisa dihitung SEKALIGUS
     saat form daftar disubmit -- sebelum tahu apakah sesi langsung
     terbentuk atau masih menunggu konfirmasi email -- lalu dititipkan
     ke user_metadata via options.data pada sb.auth.signUp() itu
     sendiri, jadi TIDAK perlu langkah "simpan PIN tertunda" terpisah. */
  const PIN_SALT = 'zayapro-pin-v1';
  async function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  function computePinHash(email, pin) {
    return sha256Hex(PIN_SALT + ':' + String(email || '').trim().toLowerCase() + ':' + pin);
  }
  // Saring input kolom PIN di form daftar supaya cuma angka yang bisa
  // diketik (mis. HP tetap munculin keypad angka lewat inputmode, tapi
  // ini jaga-jaga di keyboard fisik/browser desktop juga).
  [pinInput, pinConfirmInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener('input', function () {
      el.value = el.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
  });

  function showMsg(text, kind) {
    msgBox.textContent = text;
    msgBox.className = 'cloud-auth-msg show ' + (kind || '');
  }
  function clearMsg() {
    msgBox.className = 'cloud-auth-msg';
  }

  /* ---------- API publik login/status untuk script.js ----------
     App sekarang BISA dipakai sepenuhnya tanpa login (lihat boot()
     di bawah -- overlay TIDAK lagi dipaksa tampil di awal). Dua
     fungsi ini yang dipakai script.js (lewat requireCloudLogin() di
     sana) untuk mengecek status login & memunculkan popup Masuk/
     Daftar HANYA saat user benar-benar mengakses fitur yang butuh
     akun cloud (sinkron antar perangkat, Tanya AI, Ubah PIN/Password,
     Login Biometrik, Reset Database Online). */
  window.cloudIsLoggedIn = function () { return !!currentUser; };
  window.cloudRequireLogin = function (reason) {
    if (!overlay) return;
    setMode('login');
    if (reason) showMsg(reason, 'ok'); else clearMsg();
    overlay.classList.remove('hidden');
  };
  function setMode(next) {
    mode = next;
    clearMsg();
    if (authCard) authCard.classList.toggle('mode-signup', mode === 'signup');
    // Kolom Nama & PIN cuma WAJIB (required) di mode Daftar -- dilepas
    // di mode Masuk supaya form login lama (email+password saja) tetap
    // bisa disubmit tanpa terganjal validasi HTML pada kolom yang
    // memang disembunyikan.
    if (nameInput) nameInput.required = (mode === 'signup');
    if (pinInput) pinInput.required = (mode === 'signup');
    if (pinConfirmInput) pinConfirmInput.required = (mode === 'signup');
    if (mode === 'signup') {
      titleEl.textContent = 'Daftar Akun ZAYAin';
      submitBtn.textContent = 'Daftar';
      switchText.textContent = 'Sudah punya akun?';
      switchLink.textContent = 'Masuk di sini';
    } else {
      titleEl.textContent = 'Masuk ke ZAYAin';
      submitBtn.textContent = 'Masuk';
      switchText.textContent = 'Belum punya akun?';
      switchLink.textContent = 'Daftar di sini';
    }
  }
  switchLink.addEventListener('click', function () {
    setMode(mode === 'login' ? 'signup' : 'login');
  });

  /* Tombol tutup (X) -- cuma boleh dipakai kalau app sudah jalan
     (appStarted, artinya user memang sedang pakai app secara lokal &
     popup ini muncul karena mengklik fitur cloud), supaya tetap tidak
     ada cara menutup popup di jalur LAMA yang masih sah menahannya
     (proses login sesi otomatis/PIN saat boot -- lihat boot() &
     requirePinUnlock -- overlay itu beda elemen, bukan ini). */
  function closeAuthOverlayIfDismissable() {
    if (!appStarted) return;
    overlay.classList.add('hidden');
    clearMsg();
  }
  const closeBtn = document.getElementById('cloudAuthCloseBtn');
  if (closeBtn) closeBtn.addEventListener('click', closeAuthOverlayIfDismissable);

  // Klik di area gelap di LUAR kartu (backdrop) juga menutup popup --
  // hanya kalau klik itu benar-benar kena elemen overlay-nya sendiri,
  // bukan salah satu anak di dalam kartu (event.target === overlay),
  // supaya klik di dalam form tidak ikut menutup popup tanpa sengaja.
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeAuthOverlayIfDismissable();
  });

  // Tombol Escape juga menutup popup, kalau sedang terbuka & memang
  // boleh ditutup (app sudah jalan/guest).
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeAuthOverlayIfDismissable();
    }
  });

  /* Toggle mata polos (tanpa border/box) buat lihat/sembunyikan
     password login -- sama persis konsepnya dengan .saldo-toggle di
     banner saldo: cuma ganti type input & ikon, tombolnya sendiri
     sudah tanpa bingkai lewat class .pw-eye-toggle di CSS. */
  if (passToggle && passInput) {
    var EYE_ICON_OPEN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
    var EYE_ICON_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';
    passToggle.addEventListener('click', function () {
      var nowVisible = passInput.type === 'password';
      passInput.type = nowVisible ? 'text' : 'password';
      passToggle.innerHTML = nowVisible ? EYE_ICON_OFF : EYE_ICON_OPEN;
      passToggle.setAttribute('aria-pressed', String(nowVisible));
      passToggle.setAttribute('aria-label', nowVisible ? 'Sembunyikan password' : 'Tampilkan password');
    });
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMsg();
    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput.value.trim();
    const password = passInput.value;
    const pin = pinInput ? pinInput.value.trim() : '';
    const pinConfirm = pinConfirmInput ? pinConfirmInput.value.trim() : '';
    if (!email || password.length < 6) {
      showMsg('Isi email dan password (minimal 6 karakter).', 'err');
      return;
    }
    if (mode === 'signup') {
      if (!name) {
        showMsg('Isi nama kamu.', 'err');
        return;
      }
      if (!/^[0-9]{6}$/.test(pin)) {
        showMsg('PIN harus 6 digit angka.', 'err');
        return;
      }
      if (pin !== pinConfirm) {
        showMsg('Konfirmasi PIN tidak cocok.', 'err');
        return;
      }
    }
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'signup' ? 'Mendaftar...' : 'Masuk...';
    try {
      if (mode === 'signup') {
        // PIN dihitung hash-nya (bukan disimpan mentah) & dititipkan
        // langsung ke user_metadata lewat options.data saat mendaftar
        // -- jadi tersedia di akun ini SEJAK AWAL, baik saat sesi
        // langsung terbentuk maupun saat masih menunggu user login
        // pertama kali setelah konfirmasi email.
        const pinHash = await computePinHash(email, pin);
        const { data, error } = await sb.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: name, pin_hash: pinHash } }
        });
        if (error) throw error;
        if (data.session) {
          await onLoggedIn(data.session.user, true);
        } else {
          showMsg('Pendaftaran berhasil! Cek email kamu untuk konfirmasi, lalu masuk.', 'ok');
          setMode('login');
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
        if (error) throw error;
        await onLoggedIn(data.user, false);
      }
    } catch (err) {
      showMsg(translateAuthError(err && err.message), 'err');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'signup' ? 'Daftar' : 'Masuk';
    }
  });

  function translateAuthError(msg) {
    if (!msg) return 'Terjadi kesalahan, coba lagi.';
    if (/invalid login credentials/i.test(msg)) return 'Email atau password salah.';
    if (/user already registered/i.test(msg)) return 'Email ini sudah terdaftar. Coba masuk saja.';
    if (/email not confirmed/i.test(msg)) return 'Email belum dikonfirmasi. Cek inbox/spam kamu.';
    return msg;
  }

  async function onLoggedIn(user, isNewSignup) {
    currentUser = user;
    // Diekspos ke `window` (bukan cuma variabel lokal di dalam IIFE ini)
    // supaya script.js BISA membacanya secara sinkron -- dipakai sbg
    // bawaan "Nama Web" di halaman Data Diri (nama sebelum "@" pada
    // email yang dipakai saat mendaftar), krn form daftar/masuk cuma
    // minta email+password, tidak ada kolom "nama" terpisah. Sengaja
    // diisi di sini SEBELUM startAppOnce() menyisipkan <script
    // src="script.js">, jadi begitu script.js jalan, nilai ini sudah
    // pasti tersedia (bukan race condition/masih kosong).
    window.zayaproAccountEmail = user.email || null;
    // Nama yang diisi di kolom "Nama" saat daftar (user_metadata.full_name)
    // -- dipakai script.js sbg "Nama Web" bawaan, lihat getDefaultAppName().
    window.zayaproAccountName = (user.user_metadata && user.user_metadata.full_name) || null;
    subscribeResetChannel(user.id);

    // PERMINTAAN: Login Biometrik aktif SEJAK PERTAMA KALI app dibuka
    // (bukan cuma opsi manual di Pengaturan) -- jadi begitu akun baru
    // selesai didaftarkan, langsung coba daftarkan kredensial sidik
    // jari/Face ID di perangkat ini. Sengaja HANYA di jalur akun BARU
    // (isNewSignup), bukan di jalur login akun lama, supaya perangkat
    // lama milik user yang memang sengaja mematikan togglenya tidak
    // dinyalakan ulang paksa tanpa sepengetahuannya.
    // Best-effort & diam-diam: kalau perangkat/browser tidak punya
    // sensor sidik jari/Face ID, diakses lewat HTTP (bukan HTTPS), atau
    // user membatalkan dialog OS-nya, cukup dilewati -- akun tetap
    // berhasil dibuat & user masih bisa menyalakannya manual lewat
    // toggle "Login Biometrik" di halaman Pengaturan kapan saja.
    if (isNewSignup) {
      try {
        const supported = await window.zayaproAuth.biometricSupported();
        if (supported) await window.zayaproAuth.enableBiometric();
      } catch (e) {
        // Dialog OS dibatalkan/gagal -- biarkan biometrik tetap nonaktif.
      }
    }

    if (isNewSignup && appStarted) {
      // App sekarang bisa dipakai dulu secara lokal SEBELUM daftar
      // akun (lihat boot() -- guest tanpa sesi langsung startAppOnce()).
      // Kalau form ini disubmit dalam mode DAFTAR sementara app sudah
      // jalan (artinya ada kemungkinan data lokal guest yang belum
      // pernah tersinkron), data cloud akun baru ini masih KOSONG --
      // jangan pullAllFromCloud() spt biasa (itu akan MENGHAPUS semua
      // data lokal yang belum ada di cloud). Sebaliknya, DORONG data
      // lokal yang sudah ada ke cloud, supaya jadi data awal akun baru
      // ini alih-alih hilang.
      showMsg('Menyimpan data ke akun baru...', 'ok');
      await pushAllLocalToCloud();
    } else {
      showMsg('Menarik data dari cloud...', 'ok');
      await pullAllFromCloud();
    }

    overlay.classList.add('hidden');
    // Kalau app SUDAH jalan (guest yang baru saja login/daftar dari
    // tengah sesi pakai lokal), muat ulang halaman supaya script.js
    // dimuat ulang dari nol dengan data yang baru saja ditarik/didorong
    // di atas -- lebih sederhana & aman drpd mencoba "menyuntik ulang"
    // data ke instance app yang sudah terlanjur jalan dgn data lama.
    if (appStarted) {
      location.reload();
    } else {
      startAppOnce();
    }
  }

  /* Dipanggil HANYA dari jalur "daftar akun baru sambil app sudah
     jalan sbg guest" di atas -- lihat komentarnya. Mendorong SEMUA
     key localStorage yang memang disinkron (bukan yang dikecualikan,
     lihat isCloudExcluded) ke kv_store akun yang baru saja dibuat,
     supaya data yang sempat dicatat sebagai guest tidak hilang. */
  async function pushAllLocalToCloud() {
    const rows = [];
    Object.keys(localStorage).forEach(function (key) {
      if (key === RESET_PENDING_KEY) return;
      if (isCloudExcluded(key)) return;
      const raw = localStorage.getItem(key);
      let payload;
      try { payload = JSON.parse(raw); } catch (e) { payload = raw; }
      rows.push({ user_id: currentUser.id, key: key, value: payload, updated_at: new Date().toISOString() });
    });
    if (!rows.length) return true;
    const { error } = await sb.from('kv_store').upsert(rows, { onConflict: 'user_id,key' });
    if (error) { console.error('Gagal mendorong data lokal ke akun baru:', error); return false; }
    return true;
  }

  function startAppOnce() {
    if (appStarted) return;
    appStarted = true;
    // script.js memanggil init() otomatis di baris terakhirnya begitu
    // file selesai dieksekusi -- jadi kita baru <script src="script.js">
    // ke DOM SEKARANG (setelah pasti login & data cloud sudah ditarik),
    // supaya init() tidak jalan lebih dulu dengan data localStorage lama.
    // Query string ?v=Date.now() sengaja dipasang supaya browser TIDAK
    // PERNAH memakai versi script.js yang ke-cache -- selalu ambil file
    // paling baru dari server setiap kali halaman dibuka/reload, supaya
    // update kode (termasuk fitur reset database ini) langsung berlaku
    // tanpa perlu hard-refresh manual.
    const s = document.createElement('script');
    s.src = 'script.js?v=' + Date.now();
    document.body.appendChild(s);
  }

  /* ---------- kunci PIN (dipakai HANYA saat sesi lama dipakai lagi
     otomatis di boot(), lihat di bawah -- BUKAN sesudah submit form
     login/daftar, krn di situ user baru saja membuktikan identitasnya
     lewat email+password) ---------- */
  const pinLockOverlay = document.getElementById('pinLockOverlay');
  function fallbackNameFromEmail(email) {
    const local = String(email || '').split('@')[0];
    if (!local) return '';
    return local.replace(/[._]+/g, ' ').trim().split(/\s+/).filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }
  function requirePinUnlock(user, expectedHash) {
    /* ---- FIX \"ikon logo di header popup PIN cuma kelihatan kotak
       putih kosong\": popup PIN ini (& ikonnya) sudah ada di HTML sejak
       awal, tapi yg BIASANYA mengisi ikon/logo ke dalamnya adalah
       applyAppSettings() di script.js -- padahal script.js SENGAJA
       baru dimuat SETELAH PIN berhasil (lihat startAppOnce() &
       komentar \"HARUS dimuat SEBELUM script.js\" di atas file ini),
       supaya popup kunci ini bisa tampil secepat mungkin tanpa nunggu
       seluruh app dimuat dulu. Akibatnya selama popup ini terbuka,
       applyAppSettings() belum pernah jalan sama sekali -> elemen
       ikonnya kosong melompong, cuma keliatan kotak putih polos
       (.brand-mark punya background putih bawaan). Di sini ikon/logo
       yg SAMA (Ikon Bawaan atau Logo Aplikasi custom, tersimpan di key
       localStorage yg sama dgn APP_SETTINGS_KEY milik script.js)
       diisi ulang SENDIRI langsung dari sini -- tanpa perlu nunggu
       script.js -- supaya ikon yg tampil di popup kunci ini SELALU
       sinkron dgn Pengaturan Aplikasi, persis spt di tempat lain. ---- */
    (function renderPinLockBrandIcon() {
      const el = document.getElementById('pinLockBrandMarkIcon');
      if (!el) return;
      const DEFAULT_ICON_SVG = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>';
      const ICON_PRESETS = {
        pulse: DEFAULT_ICON_SVG,
        wallet: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v2"/><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H8"/><circle cx="16.5" cy="14" r="1.4"/></svg>',
        trending: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
        chart: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M12 20V4M20 20v-7"/></svg>',
        shield: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3Z"/><path d="M9 12l2 2 4-4"/></svg>',
        coin: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9 12h6M12 8.5v7"/></svg>'
      };
      try {
        const raw = localStorage.getItem('alirin_app_settings_v1');
        const settings = raw ? JSON.parse(raw) : {};
        if (settings.logo) {
          el.innerHTML = '<img src="' + settings.logo + '" alt="Logo">';
        } else {
          el.innerHTML = ICON_PRESETS[settings.icon] || DEFAULT_ICON_SVG;
        }
      } catch (e) {
        el.innerHTML = DEFAULT_ICON_SVG;
      }
    })();

    /* ---- Kunci/lepas-kunci scroll halaman UTAMA selama popup PIN ini
       terbuka -- dibuat TAHAN BANTING utk iOS Safari (sekadar
       `overflow:hidden` di <body> gampang gagal/"bocor" di sana kalau
       ada elemen fixed lain di halaman, spt kasus kita). Triknya: pas
       dikunci, <body> dipindah jadi position:fixed dgn `top` negatif
       sebesar posisi scroll saat itu (jadi VISUALNYA diam persis di
       posisi yg sama), lalu pas dilepas, scroll dikembalikan persis
       ke posisi semula. Dipasang di level modul (bukan di dalam
       Promise) supaya aman dipanggil berulang tanpa duplikasi listener,
       & dihitung ulang tiap kali dipanggil (bisa saja ukuran halaman
       berubah antar sesi buka-tutup). ---- */
    let pinLockSavedScrollY = 0;
    function lockBodyScrollForPinLock() {
      pinLockSavedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.position = 'fixed';
      document.body.style.top = (-pinLockSavedScrollY) + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }
    function unlockBodyScrollForPinLock() {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, pinLockSavedScrollY);
    }
    return new Promise(function (resolve) {
      const titleEl = document.getElementById('pinLockTitle');
      const bioView = document.getElementById('pinLockBioView');
      const pinView = document.getElementById('pinLockPinView');
      const bioBtn = document.getElementById('pinLockBioBtn');
      const bioHint = document.getElementById('pinLockBioHint');
      const bioMsg = document.getElementById('pinLockBioMsg');
      const usePinBtn = document.getElementById('pinLockUsePinBtn');
      const dotsWrap = document.getElementById('pinLockDots');
      const dots = dotsWrap ? Array.prototype.slice.call(dotsWrap.querySelectorAll('.pin-dot')) : [];
      const msgBox2 = document.getElementById('pinLockMsg');
      const greeting = document.getElementById('pinLockGreeting');
      const keypad = document.getElementById('pinLockKeypad');
      const backspaceBtn = document.getElementById('pinLockBackspace');
      const forgotLink = document.getElementById('pinLockForgotLink');
      const keypadBioBtn = document.getElementById('pinLockKeypadBioBtn');
      const bioEnabled = window.zayaproAuth.isBiometricEnabled();
      let entered = '';
      let checking = false;
      let bioChecking = false;

      /* ---- Sapaan sekarang menyesuaikan WAKTU (bukan nama/email lagi):
         "Halo, Selamat Pagi/Siang/Sore/Malam" mengikuti jam perangkat
         saat popup ini dibuka. Batas waktunya pakai kebiasaan umum
         Indonesia: 05.00-10.59 Pagi, 11.00-14.59 Siang, 15.00-18.59
         Sore, sisanya (malam & dini hari) Malam. ---- */
      function greetingWordByHour() {
        const h = new Date().getHours();
        if (h >= 5 && h < 11) return 'Pagi';
        if (h >= 11 && h < 15) return 'Siang';
        if (h >= 15 && h < 19) return 'Sore';
        return 'Malam';
      }
      if (greeting) {
        greeting.textContent = 'Halo, Selamat ' + greetingWordByHour();
      }

      /* ---- Pindah antar 2 tampilan: biometrik (utama, kalau
         Login Biometrik aktif di perangkat ini) & keypad PIN
         (cadangan). Judul halaman ikut berubah menyesuaikan tampilan
         yg sedang aktif. ---- */
      function showBioView() {
        if (pinView) pinView.classList.remove('open');
        if (bioView) bioView.classList.add('open');
        if (titleEl) titleEl.textContent = 'Atur Keuanganmu dengan ZAYAin Sekarang';
      }
      /* ---- Tombol tutup (×) di tampilan PIN cuma masuk akal kalau
         ada tampilan Login sidik jari utk dituju balik -- makanya
         cuma ditampilkan kalau Login Biometrik aktif di perangkat
         ini. Kalau tidak aktif, PIN adalah satu-satunya cara masuk,
         jadi tombol ini tetap disembunyikan (display:none bawaan). ---- */
      function showPinView() {
        if (bioView) bioView.classList.remove('open');
        if (pinView) pinView.classList.add('open');
        if (titleEl) titleEl.textContent = 'Masukkan PIN';
        entered = '';
        clearErr();
        renderDots();
      }

      function renderDots() {
        dots.forEach(function (d, i) { d.classList.toggle('filled', i < entered.length); });
      }
      function showErr(text) {
        if (msgBox2) { msgBox2.textContent = text; msgBox2.className = 'cloud-auth-msg show err'; }
        if (dotsWrap) {
          dotsWrap.classList.remove('shake');
          void dotsWrap.offsetWidth; // restart animasi shake
          dotsWrap.classList.add('shake');
        }
      }
      function clearErr() {
        if (msgBox2) msgBox2.className = 'cloud-auth-msg';
      }
      async function handleComplete() {
        checking = true;
        const hash = await computePinHash(user.email, entered);
        if (hash === expectedHash) {
          cleanup();
          pinLockOverlay.classList.add('hidden');
          resolve();
        } else {
          showErr('PIN salah, coba lagi.');
          entered = '';
          renderDots();
          checking = false;
        }
      }
      function onKeyClick(e) {
        const btn = e.target.closest('.pin-key[data-num]');
        if (!btn || checking) return;
        if (entered.length >= 6) return;
        clearErr();
        entered += btn.getAttribute('data-num');
        renderDots();
        if (entered.length === 6) handleComplete();
      }
      function onBackspace() {
        if (checking) return;
        clearErr();
        entered = entered.slice(0, -1);
        renderDots();
      }
      function onForgot() {
        window.cloudSignOut();
      }
      /* ---- Percobaan sidik jari/Face ID dari tampilan biometrik
         utama -- dipicu OTOMATIS begitu tampilan ini terbuka (lihat
         pemanggilan attemptBio() di paling bawah), & bisa diulang
         kapan saja dgn mengetuk ikonnya langsung. Selama menunggu
         hasil dari OS, ikon diberi status ".is-checking" (ring
         berputar) sbg umpan balik supaya user tahu app sedang
         menunggu, bukan diam macet. ---- */
      async function attemptBio() {
        if (bioChecking) return;
        bioChecking = true;
        if (bioBtn) bioBtn.classList.add('is-checking');
        if (bioMsg) bioMsg.className = 'cloud-auth-msg';
        if (bioHint) bioHint.textContent = 'Menunggu sidik jari / Face ID...';
        const ok = await window.zayaproAuth.tryBiometricUnlock();
        bioChecking = false;
        if (bioBtn) bioBtn.classList.remove('is-checking');
        if (ok) {
          cleanup();
          pinLockOverlay.classList.add('hidden');
          resolve();
          return;
        }
        if (bioHint) bioHint.textContent = 'Tap ikon untuk buka pakai sidik jari / Face ID';
        if (bioMsg) { bioMsg.textContent = 'Gagal terbaca, coba lagi atau pakai PIN.'; bioMsg.className = 'cloud-auth-msg show err'; }
      }
      function onBioBtnClick() { attemptBio(); }
      function onUsePin() { showPinView(); }
      async function onBioRetry() {
        if (checking) return;
        const ok = await window.zayaproAuth.tryBiometricUnlock();
        if (ok) {
          cleanup();
          pinLockOverlay.classList.add('hidden');
          resolve();
        }
      }
      function cleanup() {
        keypad.removeEventListener('click', onKeyClick);
        backspaceBtn.removeEventListener('click', onBackspace);
        forgotLink.removeEventListener('click', onForgot);
        if (keypadBioBtn) keypadBioBtn.removeEventListener('click', onBioRetry);
        if (bioBtn) bioBtn.removeEventListener('click', onBioBtnClick);
        if (usePinBtn) usePinBtn.removeEventListener('click', onUsePin);
        unlockBodyScrollForPinLock();
      }

      keypad.addEventListener('click', onKeyClick);
      backspaceBtn.addEventListener('click', onBackspace);
      forgotLink.addEventListener('click', onForgot);
      if (keypadBioBtn) keypadBioBtn.addEventListener('click', onBioRetry);
      if (bioBtn) bioBtn.addEventListener('click', onBioBtnClick);
      if (usePinBtn) usePinBtn.addEventListener('click', onUsePin);

      entered = '';
      renderDots();
      clearErr();
      // ---- FIX BUG "gulir ke atas malah kelihatan menu navigasi bawah
      // (#bottomNav) menyembul": akar masalahnya halaman UTAMA di
      // belakang popup ini TIDAK PERNAH dikunci scroll-nya -- jadi
      // walau popup ini `position:fixed` menutupi seluruh layar,
      // konten di baliknya (termasuk nav bawah yg jg fixed) tetap ikut
      // bergerak/di-repaint tiap kali jari menggulir, dan di beberapa
      // browser (terutama WebKit/Safari mobile, PERSIS pola bug yg
      // sama dgn "banner bocor saat discroll" yg sudah pernah diperbaiki
      // di elemen lain pada file ini) repaint elemen fixed itu sempat
      // TIDAK SINKRON sepersekian frame, membuat nav bawah "menyembul"
      // sesaat menembus popup. Sekarang scroll halaman utama BENAR2
      // dikunci total (bukan cuma overflow:hidden yg gampang gagal di
      // iOS Safari) selama popup ini terbuka, & posisi gulir sebelumnya
      // disimpan supaya dikembalikan persis setelah PIN/biometrik
      // berhasil (lihat unlockBodyScrollForPinLock di cleanup()).
      lockBodyScrollForPinLock();
      pinLockOverlay.classList.remove('hidden');

      // Tampilan awal: biometrik dulu (lalu auto-diminta) kalau aktif
      // di perangkat ini DAN perangkat/browser ini SAAT INI memang
      // masih punya sensor sidik jari/Face ID -- dicek ulang di sini
      // (bukan cuma percaya flag localStorage) utk jaga2 kondisi
      // rusak: flag "aktif" sempat tersimpan tapi device SEKARANG
      // ternyata tidak lagi mendukung (mis. sesudah update browser,
      // atau data lokal disalin manual ke HP lain yg tidak punya
      // sensor). Kalau ternyata tidak didukung, bersihkan flag itu
      // (spt disableBiometric di boot() utk kasus serupa) & langsung
      // ke PIN drpd menampilkan tombol sidik jari yg pasti gagal
      // terus kalau diketuk.
      // Pilih tampilan awal SEKARANG JUGA (sinkron, pakai flag bioEnabled
      // yg sudah dibaca dari localStorage di atas) -- jangan tunggu hasil
      // await biometricSupported() dulu, krn selama menunggu itu kedua
      // view (#pinLockBioView & #pinLockPinView) sama2 belum diberi
      // class 'open'/'tidak' oleh salah satu fungsi di atas, sehingga
      // kalau CSS default salah satunya kepakai (spt sebelum fix ini),
      // ATAU sekadar demi jaga2 di masa depan, keduanya bisa kelihatan
      // bertumpuk sesaat. Dengan memilih tampilan dulu secara sinkron,
      // layar SELALU cuma nampilin satu tampilan sejak overlay dibuka,
      // lalu baru dikoreksi ke PIN kalau ternyata device sekarang tidak
      // benar2 mendukung sidik jari/Face ID.
      if (bioEnabled) {
        showBioView();
      } else {
        showPinView();
      }
      (async function () {
        const isSupportedNow = bioEnabled && await window.zayaproAuth.biometricSupported();
        // ---- Ikon sidik jari kecil di slot kosong keypad PIN (pojok
        // kiri-bawah, sebelum angka 0) -- shortcut cepat spy user yg
        // sudah masuk ke tampilan PIN TETAP bisa langsung coba sidik
        // jari lagi tanpa harus pencet "Tutup" dulu utk balik ke
        // tampilan Login. Cuma tampil kalau Login Biometrik aktif &
        // didukung device ini SEKARANG.
        if (keypadBioBtn) keypadBioBtn.style.display = isSupportedNow ? 'flex' : 'none';
        // FIX: JANGAN langsung minta sidik jari/Face ID otomatis begitu
        // popup terbuka -- tunggu sampai user BENAR-BENAR menekan tombol
        // "Login" (ikon sidik jari) di layar. Kalau device/browser
        // ternyata tidak mendukung sidik jari sama sekali, tetap
        // langsung dialihkan ke tampilan PIN spt sebelumnya (bukan
        // menampilkan tombol yg pasti gagal terus kalau ditekan).
        if (!isSupportedNow) {
          if (bioEnabled) window.zayaproAuth.disableBiometric();
          showPinView();
        }
      })();
    });
  }

  /* ---------- API terpusat utk halaman Pengaturan > Keamanan
     (Ubah PIN / Ubah Password / Login Biometrik) -- dipanggil dari
     script.js, semua operasi otentikasi tetap lewat modul ini krn
     `sb` & `currentUser` cuma ada di sini. ---------- */
  window.zayaproAuth = {
    hasPin: function () {
      return !!(currentUser && currentUser.user_metadata && currentUser.user_metadata.pin_hash);
    },
    // Saat ini SEMUA akun daftar lewat email+password (lihat
    // sb.auth.signUp() di atas, field password wajib diisi min. 6
    // karakter) -- jadi fungsi ini akan SELALU true utk sekarang.
    // Disiapkan sbg jaga-jaga: kalau nanti ditambahkan metode daftar
    // lain yg tidak pakai password (mis. OAuth Google, magic
    // link/OTP), Supabase mencatatnya lewat currentUser.identities
    // (daftar provider yg terhubung ke akun ini) -- akun yg TIDAK
    // punya identity berprovider 'email' berarti memang tidak pernah
    // set password, jadi baris "Ubah Password" di Pengaturan perlu
    // berubah jadi "Buat Password" (lihat updatePasswordChangeLabels
    // di script.js).
    hasPassword: function () {
      if (!currentUser) return false;
      const identities = currentUser.identities || [];
      if (identities.some(function (i) { return i.provider === 'email'; })) return true;
      // Fallback utk kasus identities tidak tersedia di objek user
      // (mis. versi SDK lama) -- anggap masih account email/password
      // spt biasa drpd salah menampilkan "Buat Password" ke user yg
      // sebenarnya sudah punya password.
      return !identities.length;
    },
    verifyPin: async function (pin) {
      if (!currentUser) return false;
      const hash = currentUser.user_metadata && currentUser.user_metadata.pin_hash;
      if (!hash) return false;
      const h = await computePinHash(currentUser.email, pin);
      return h === hash;
    },
    setPin: async function (newPin) {
      if (!currentUser) throw new Error('Belum login.');
      const hash = await computePinHash(currentUser.email, newPin);
      const { data, error } = await sb.auth.updateUser({ data: { pin_hash: hash } });
      if (error) throw error;
      currentUser = data.user;
      return true;
    },
    verifyPassword: async function (password) {
      if (!currentUser) return false;
      const { error } = await sb.auth.signInWithPassword({ email: currentUser.email, password: password });
      return !error;
    },
    changePassword: async function (newPassword) {
      const { data, error } = await sb.auth.updateUser({ password: newPassword });
      if (error) throw error;
      currentUser = data.user;
      return true;
    },
    requestPasswordReset: async function () {
      if (!currentUser) throw new Error('Belum login.');
      const { error } = await sb.auth.resetPasswordForEmail(currentUser.email);
      if (error) throw error;
      return true;
    },
    /* ---------- Login Biometrik (WebAuthn, platform authenticator)
       ----------
       Kredensialnya dibuat & disimpan LOKAL per perangkat (localStorage,
       BUKAN dikirim/diverifikasi ke server -- tidak ada tabel public
       key di Supabase), jadi sifatnya murni "kenyamanan buka app cepat
       di perangkat ini" (menggantikan layar PIN), BUKAN otentikasi
       kriptografis penuh spt passkey sungguhan yg dicek backend.
       Otomatis dianggap tidak tersedia kalau perangkat/browser tidak
       punya sensor sidik jari/Face ID atau halaman diakses lewat HTTP
       (WebAuthn wajib HTTPS/localhost). */
    biometricSupported: async function () {
      try {
        return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
      } catch (e) { return false; }
    },
    isBiometricEnabled: function () {
      if (!currentUser) return false;
      return localStorage.getItem('zayapro_biometric_cred_' + currentUser.id) != null;
    },
    enableBiometric: async function () {
      if (!currentUser) throw new Error('Belum login.');
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBytes = new TextEncoder().encode(currentUser.id);
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: challenge,
          rp: { name: 'ZAYAin' },
          user: {
            id: userIdBytes,
            name: currentUser.email || 'user',
            displayName: (currentUser.user_metadata && currentUser.user_metadata.full_name) || currentUser.email || 'user'
          },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
          timeout: 60000,
          attestation: 'none'
        }
      });
      if (!cred) throw new Error('Gagal membuat kredensial biometrik.');
      const idB64 = btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId)));
      localStorage.setItem('zayapro_biometric_cred_' + currentUser.id, idB64);
      return true;
    },
    disableBiometric: function () {
      if (!currentUser) return;
      localStorage.removeItem('zayapro_biometric_cred_' + currentUser.id);
    },
    tryBiometricUnlock: async function () {
      if (!currentUser) return false;
      const idB64 = localStorage.getItem('zayapro_biometric_cred_' + currentUser.id);
      if (!idB64) return false;
      try {
        const supported = await this.biometricSupported();
        if (!supported) return false;
        const rawId = Uint8Array.from(atob(idB64), function (c) { return c.charCodeAt(0); });
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const assertion = await navigator.credentials.get({
          publicKey: {
            challenge: challenge,
            allowCredentials: [{ id: rawId, type: 'public-key' }],
            userVerification: 'required',
            timeout: 25000
          }
        });
        return !!assertion;
      } catch (e) { return false; }
    }
  };

  /* ---------- cek sesi saat halaman dibuka ---------- */
  (async function boot() {
    const { data } = await sb.auth.getSession();
    if (data && data.session && data.session.user) {
      currentUser = data.session.user;
      // BUG FIX: sb.auth.getSession() di atas cuma membaca sesi yang
      // SUDAH TERSIMPAN (termasuk isi user_metadata di dalamnya) dari
      // penyimpanan lokal, TANPA menjamin itu sudah mencerminkan
      // perubahan user_metadata (mis. pin_hash yang baru saja dibuat
      // lewat "Buat PIN" di Pengaturan) kalau access token-nya sendiri
      // belum sempat di-refresh sejak perubahan itu terjadi. Akibatnya
      // sesaat setelah membuat PIN lalu me-refresh HALAMAN (bukan
      // cuma ganti tab), pin_hash bisa kelihatan kosong lagi di sini
      // padahal sudah tersimpan di server -- yang bikin layar
      // kunci/biometrik ikut ter-skip seolah PIN tidak pernah dibuat.
      // sb.auth.getUser() menarik ULANG data user LANGSUNG dari
      // server (bukan cuma decode sesi lokal), jadi selalu dapat
      // user_metadata paling baru. Best-effort: kalau panggilan ini
      // gagal (mis. offline), tetap pakai currentUser dari sesi lokal
      // di atas drpd memblokir app sama sekali.
      try {
        const { data: freshData, error: freshErr } = await sb.auth.getUser();
        if (!freshErr && freshData && freshData.user) currentUser = freshData.user;
      } catch (e) { /* best-effort -- fallback ke sesi lokal */ }
      // Sama spt di onLoggedIn() di atas -- lihat komentarnya -- supaya
      // jalur "sudah login sebelumnya, sesi masih ada" ini pun tetap
      // mengeskpos email akun ke script.js.
      window.zayaproAccountEmail = currentUser.email || null;
      window.zayaproAccountName = (currentUser.user_metadata && currentUser.user_metadata.full_name) || null;
      subscribeResetChannel(currentUser.id);

      // Sesi lama dipakai otomatis TANPA user mengetik ulang
      // email/password -- kalau akun ini sudah pernah mengatur PIN
      // saat daftar, minta PIN dulu di sini sbg kunci cepat sebelum
      // masuk ke app (menggantikan "ketik ulang email/password").
      // Sidik jari/Face ID (kalau aktif) kini dicoba OTOMATIS DI DALAM
      // requirePinUnlock() sendiri -- lihat tampilan #pinLockBioView --
      // jadi tidak lagi dicoba dobel di sini sebelum layar kuncinya
      // ditampilkan.
      const pinHash = currentUser.user_metadata && currentUser.user_metadata.pin_hash;
      if (pinHash) {
        await requirePinUnlock(currentUser, pinHash);
      } else if (window.zayaproAuth.isBiometricEnabled()) {
        // Kondisi rusak/tidak konsisten: biometrik sempat diaktifkan
        // padahal akun ini TIDAK PUNYA PIN (mis. diaktifkan sebelum
        // pengecekan hasPin() ditambahkan di initBiometricToggle,
        // lihat script.js). Tanpa pinHash, layar kunci di atas tidak
        // akan pernah jalan sama sekali (baik PIN maupun sidik jari),
        // sehingga app selalu langsung terbuka tanpa diminta apa pun
        // -- padahal togglenya kelihatan ON di Pengaturan. Bersihkan
        // kredensial biometrik lokal ini supaya togglenya kembali
        // OFF dan mencerminkan kondisi sebenarnya, lalu user akan
        // diminta set PIN dulu kalau mau mengaktifkannya lagi.
        window.zayaproAuth.disableBiometric();
      }

      // Kalau halaman ini dimuat ulang SETELAH reset database
      // (lihat cloudResetDatabase di bawah), bersihkan cloud + local
      // SEKALI LAGI di sini -- di awal proses load halaman yang baru,
      // sebelum apa pun lain jalan (termasuk sebelum script.js
      // disisipkan). Ini jaring pengaman terhadap race condition:
      // kalau di halaman SEBELUMNYA sempat ada kode lama yang
      // menulis ulang data lama ke localStorage & meng-upload-nya
      // lagi ke cloud tepat sebelum reload terjadi, pengulangan di
      // sini memastikan sisa data itu tetap ikut terhapus bersih.
      if (localStorage.getItem(RESET_PENDING_KEY) === '1') {
        try {
          await sb.from('kv_store').delete().eq('user_id', currentUser.id);
        } catch (e) { console.error('Reset database (pembersihan ulang) gagal:', e); }
        Object.keys(localStorage).forEach(function (key) {
          if (key !== RESET_PENDING_KEY && !isCloudExcluded(key)) localStorage.removeItem(key);
        });
        localStorage.removeItem(RESET_PENDING_KEY);
      }

      overlay.classList.add('hidden');
      await pullAllFromCloud();
      startAppOnce();
    } else {
      // PERUBAHAN PENTING: dulu overlay login/daftar dipaksa tampil di
      // sini & startAppOnce() (yang memuat script.js) DITAHAN sampai
      // user login -- jadi app benar-benar tidak bisa dibuka sama
      // sekali tanpa login. Sekarang app boleh langsung dibuka & dipakai
      // secara lokal (data tersimpan di perangkat ini saja, tidak
      // sinkron) tanpa login sama sekali -- popup Masuk/Daftar HANYA
      // muncul belakangan kalau user sendiri mengklik fitur yang
      // butuh akun cloud (lihat requireCloudLogin()/window.cloudRequireLogin
      // yang dipanggil dari script.js pada aksi spt sinkron, Tanya AI,
      // Ubah PIN/Password, Login Biometrik, Reset Database Online).
      overlay.classList.add('hidden');
      startAppOnce();
    }
  })();

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      unsubscribeResetChannel();
      // FIX "logout tidak bersih": sebelumnya localStorage TIDAK
      // pernah dibersihkan saat logout, jadi data akun (transaksi,
      // saldo, target, dsb) yang sempat ditarik dari cloud tetap
      // nyangkut di perangkat ini -- dan karena app bisa dipakai
      // tanpa login (mode lokal/guest), data itu langsung kelihatan
      // & bisa diedit siapa pun yang buka browser yang sama, TANPA
      // perlu login lagi. Ini masalah privasi terutama di perangkat
      // bersama. Sekarang localStorage ikut dibersihkan begitu logout
      // (pola sama seperti cloudResetDatabase di bawah), supaya
      // setelah logout app benar-benar kembali kosong seperti baru.
      // Key yang memang murni lokal & bukan bagian data akun (lihat
      // isCloudExcluded -- cache berita, API key & riwayat chat AI)
      // TETAP dipertahankan karena bukan data sensitif per-akun.
      Object.keys(localStorage).forEach(function (key) {
        if (!isCloudExcluded(key)) localStorage.removeItem(key);
      });
      location.reload();
    }
  });

  /* Dipanggil dari tombol "Keluar" yang ditambahkan di halaman
     (lihat initFooter di script.js) -- diekspos secara global. */
  window.cloudSignOut = async function () {
    // Dikembalikan { ok: true } / { ok: false, error } supaya
    // pemanggil (handleAccountToggleClick di script.js) bisa kasih
    // tahu user kalau logout gagal, bukan diam saja. Sebelumnya
    // fungsi ini tidak mengembalikan apa-apa & error dari
    // signOut() diabaikan total.
    const { error } = await sb.auth.signOut();
    if (error) {
      console.error('Gagal logout:', error);
      return { ok: false, error: error };
    }
    return { ok: true };
  };

  /* ---------- reset database online ----------
     Menghapus SEMUA baris milik user yang sedang login di tabel
     kv_store (cloud), lalu ikut membersihkan localStorage di
     perangkat ini (kecuali key yang memang murni lokal/tidak
     disinkron, lihat isCloudExcluded), supaya aplikasi kembali ke
     kondisi kosong/baru di semua perangkat begitu login ulang.
     Dipanggil dari tombol "Reset Database Online" di modal
     Pengaturan Aplikasi (lihat script.js) -- diekspos secara global.
     Mengembalikan { ok: true } kalau berhasil, atau
     { ok: false, reason: 'not_logged_in' | 'error', error } kalau gagal.

     CATATAN: penanda RESET_PENDING_KEY sengaja dipasang supaya
     boot() di atas mengulang pembersihan ini lagi begitu halaman
     di-reload -- lihat komentar di boot() untuk alasannya. */
  window.cloudResetDatabase = async function () {
    if (!currentUser) return { ok: false, reason: 'not_logged_in' };

    // PENTING: matikan kemampuan push & batalkan semua timer
    // tertunda SEBELUM mengirim request delete (bukan sesudahnya).
    // Kedua baris ini sengaja sinkron & jadi hal PERTAMA yang
    // dijalankan, supaya tidak ada celah waktu sedikit pun bagi
    // queuePush() manapun -- yang mungkin sudah terlanjur
    // ter-debounce dari edit data sesaat sebelum tombol reset
    // ditekan -- untuk sempat menembak upsert ke kv_store setelah
    // baris ini dieksekusi. Ini yang sebelumnya menyebabkan data
    // lama bisa muncul lagi setelah reset.
    resetting = true;
    Object.keys(pushTimers).forEach(function (k) { clearTimeout(pushTimers[k]); });

    const { error } = await sb.from('kv_store').delete().eq('user_id', currentUser.id);
    if (error) {
      console.error('Reset database (cloud) gagal:', error);
      setSyncBadge('err');
      resetting = false; // reset gagal -> izinkan sinkron normal lagi
      return { ok: false, reason: 'error', error: error };
    }

    // Beri tahu SEMUA perangkat/tab lain yang sedang online dengan
    // akun yang sama, LIVE, supaya mereka ikut membersihkan diri
    // seketika -- dikirim SETELAH delete di atas sukses, supaya kalau
    // ada perangkat lain yang langsung pull begitu menerima sinyal
    // ini, cloud memang sudah benar-benar kosong. Best-effort: kalau
    // channel belum siap/gagal kirim, perangkat lain tetap akan ikut
    // bersih dengan sendirinya saat mereka reload/pull berikutnya
    // (lihat perbaikan di pullAllFromCloud di atas).
    try {
      if (resetChannel) resetChannel.send({ type: 'broadcast', event: 'db_reset', payload: {} });
    } catch (e) { console.error('Gagal mengirim sinyal reset live:', e); }

    localStorage.setItem(RESET_PENDING_KEY, '1');
    Object.keys(localStorage).forEach(function (key) {
      if (key !== RESET_PENDING_KEY && !isCloudExcluded(key)) localStorage.removeItem(key);
    });

    // Catatan: `resetting` sengaja DIBIARKAN true sampai halaman
    // di-reload oleh pemanggil (lihat btnResetCloudDb di script.js,
    // yang selalu me-reload halaman sesaat setelah ok:true) --
    // reload otomatis membuat ulang seluruh state modul ini
    // (termasuk `resetting` kembali ke false). Tetap dikembalikan ke
    // false di sini juga sebagai jaga-jaga kalau suatu saat pemanggil
    // berubah dan TIDAK reload halaman setelah reset berhasil.
    resetting = false;

    return { ok: true };
  };
})();

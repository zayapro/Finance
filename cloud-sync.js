/* ==========================================================
   ZAYAPRO — CLOUD SYNC (Supabase)
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
  const CLOUD_EXCLUDE_EXACT = ['zayapro_ai_settings', 'zayapro_ai_chat_history'];
  // 'sb-' = prefix key internal yang dipakai Supabase sendiri untuk
  // menyimpan token sesi login (mis. "sb-<ref>-auth-token") di
  // localStorage. WAJIB dikecualikan dari sinkron/pembersihan di
  // bawah -- kalau tidak, key ini ikut terhapus setiap kali
  // pullAllFromCloud() atau reset database membersihkan key yang
  // "tidak ada di cloud", karena token sesi memang bukan data
  // aplikasi yang tersimpan di kv_store. Akibatnya sesi login hilang
  // begitu halaman di-reload (dilempar balik ke layar login) padahal
  // baru saja berhasil login. (Bug fix)
  const CLOUD_EXCLUDE_PREFIX = ['alirin_news_cache_v1_', 'sb-'];
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
  const form = document.getElementById('cloudAuthForm');
  const emailInput = document.getElementById('cloudAuthEmail');
  const passInput = document.getElementById('cloudAuthPassword');
  const msgBox = document.getElementById('cloudAuthMsg');
  const submitBtn = document.getElementById('cloudAuthSubmitBtn');
  const titleEl = document.getElementById('cloudAuthTitle');
  const switchText = document.getElementById('cloudAuthSwitchText');
  const switchLink = document.getElementById('cloudAuthSwitchLink');

  let mode = 'login'; // 'login' | 'signup'

  function showMsg(text, kind) {
    msgBox.textContent = text;
    msgBox.className = 'cloud-auth-msg show ' + (kind || '');
  }
  function clearMsg() {
    msgBox.className = 'cloud-auth-msg';
  }
  function setMode(next) {
    mode = next;
    clearMsg();
    if (mode === 'signup') {
      titleEl.textContent = 'Daftar Akun ZAYAPRO';
      submitBtn.textContent = 'Daftar';
      switchText.textContent = 'Sudah punya akun?';
      switchLink.textContent = 'Masuk di sini';
    } else {
      titleEl.textContent = 'Masuk ke ZAYAPRO';
      submitBtn.textContent = 'Masuk';
      switchText.textContent = 'Belum punya akun?';
      switchLink.textContent = 'Daftar di sini';
    }
  }
  switchLink.addEventListener('click', function () {
    setMode(mode === 'login' ? 'signup' : 'login');
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMsg();
    const email = emailInput.value.trim();
    const password = passInput.value;
    if (!email || password.length < 6) {
      showMsg('Isi email dan password (minimal 6 karakter).', 'err');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'signup' ? 'Mendaftar...' : 'Masuk...';
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email: email, password: password });
        if (error) throw error;
        if (data.session) {
          await onLoggedIn(data.session.user);
        } else {
          showMsg('Pendaftaran berhasil! Cek email kamu untuk konfirmasi, lalu masuk.', 'ok');
          setMode('login');
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email: email, password: password });
        if (error) throw error;
        await onLoggedIn(data.user);
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

  async function onLoggedIn(user) {
    currentUser = user;
    subscribeResetChannel(user.id);
    showMsg('Menarik data dari cloud...', 'ok');
    await pullAllFromCloud();
    overlay.classList.add('hidden');
    startAppOnce();
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

  /* ---------- cek sesi saat halaman dibuka ---------- */
  (async function boot() {
    const { data } = await sb.auth.getSession();
    if (data && data.session && data.session.user) {
      currentUser = data.session.user;
      subscribeResetChannel(currentUser.id);

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
      overlay.classList.remove('hidden');
    }
  })();

  sb.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      unsubscribeResetChannel();
      location.reload();
    }
  });

  /* Dipanggil dari tombol "Keluar" yang ditambahkan di halaman
     (lihat initFooter di script.js) -- diekspos secara global. */
  window.cloudSignOut = async function () {
    await sb.auth.signOut();
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

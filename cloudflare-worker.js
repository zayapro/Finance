/**
 * ZAYAIN — Proxy Unduh Video (Cloudflare Worker)
 * ------------------------------------------------
 * Fungsi worker ini:
 *   1. TikTok/Instagram/Facebook/dst (GET /v1/fetch?url=...) DAN
 *      YouTube (GET /v1/youtube/info?url=...) -- proxy polos ke
 *      api.fastsaver.io lewat catch-all generik di bawah, tambah header
 *      CORS. /youtube/info inilah yg dipanggil frontend duluan (2
 *      kredit) utk nampilin grid pilihan resolusi (lihat
 *      videoDlRenderYoutubeInfo di script.js) SEBELUM user pilih & baru
 *      benar2 mengunduh.
 *   2. YouTube unduh sungguhan (POST /v1/youtube/download, `format`
 *      PERSIS sesuai kartu resolusi yg diklik user, mis. "720p"/"audio")
 *      -- coba FastSaverAPI dulu dgn format itu apa adanya (SEKALI, tidak
 *      lagi menebak2 beberapa kandidat spt versi lama, krn frontend
 *      sekarang SUDAH tahu resolusi mana saja yg valid dari /youtube/info
 *      sblmnya), kalau gagal baru fallback otomatis ke RapidAPI "YouTube
 *      Media Downloader" (youtube-media-downloader.p.rapidapi.com,
 *      dicarikan entri dgn resolusi PALING DEKAT ke `format` yg diminta).
 *      Hasil dari RapidAPI dinormalisasi ke bentuk respons yg SAMA dgn
 *      FastSaverAPI ({ ok, type, title, thumbnail_url, duration,
 *      download_url }), supaya script.js di frontend TIDAK PERLU diubah
 *      sama sekali.
 *   3. Kedua API key (FastSaverAPI & RapidAPI) disimpan sbg SECRET di
 *      sisi Worker -- tidak pernah terlihat oleh browser/DevTools user.
 *
 * CARA DEPLOY (gratis, tanpa VPS, ~5 menit):
 *   1. Buka https://dash.cloudflare.com -> daftar akun gratis (kalau
 *      belum punya).
 *   2. Di menu kiri: Workers & Pages -> Create -> Create Worker.
 *   3. Kasih nama bebas, mis. "zayain-videodl" -> Deploy.
 *   4. Klik "Edit code" -> hapus semua isi default -> paste SELURUH isi
 *      file ini -> Save and Deploy.
 *   5. Balik ke halaman Worker -> tab "Settings" -> "Variables and
 *      Secrets" -> Add -> Name: FASTSAVER_API_KEY, Value: (API key
 *      FastSaverAPI Anda, dari dashboard api.fastsaver.io) -> tipe
 *      "Secret" -> Save.
 *   6. Add lagi -> Name: RAPIDAPI_KEY, Value: (X-RapidAPI-Key Anda dari
 *      rapidapi.com, setelah subscribe FREE plan ke API
 *      "YouTube Media Downloader" / host
 *      youtube-media-downloader.p.rapidapi.com) -> tipe "Secret" ->
 *      Save & Deploy.
 *      (Kalau RAPIDAPI_KEY belum diisi, fallback ini otomatis dilewati
 *      -- worker tetap jalan normal spt sebelumnya, cuma tanpa
 *      cadangan utk YouTube.)
 *   7. Salin URL worker-nya (bentuknya seperti
 *      https://zayain-videodl.NAMA-ANDA.workers.dev) -> tempel ke
 *      ZAYAIN: Fast Menu > Unduh Video > ikon gerigi > field "URL
 *      Cloudflare Worker" -> Simpan.
 *
 * Free tier Cloudflare Workers: 100.000 request/hari. Free tier
 * RapidAPI "YouTube Media Downloader": cek sendiri kuotanya di halaman
 * API tsb saat subscribe (bisa berubah sewaktu-waktu, bukan wewenang
 * ZAYAIN).
 */

const FASTSAVER_UPSTREAM = 'https://api.fastsaver.io';
const RAPIDAPI_HOST = 'youtube-media-downloader.p.rapidapi.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Ambil videoId YouTube dari berbagai bentuk URL (watch?v=, youtu.be/,
// /shorts/, dst).
function extractYoutubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    return null;
  } catch (e) {
    return null;
  }
}

async function tryFastSaverYoutube(url, format, env) {
  if (!env.FASTSAVER_API_KEY) return { ok: false, detail: 'FASTSAVER_API_KEY belum diatur.' };
  // Diteruskan PERSIS 1x sesuai `format` yg diminta client (kartu
  // resolusi yg diklik user di grid #videoDlResultBox, lihat
  // videoDlResolveYoutubeFormat di script.js) -- BUKAN nebak2 beberapa
  // kandidat lagi spt versi lama (1080p/1080/720p/720/best): sekarang
  // frontend SUDAH tahu persis daftar `format` yg valid utk video ini
  // (dari /youtube/info sblmnya, diteruskan apa adanya lewat proxy
  // generik di bawah -- lihat fetch()), jadi menebak2 di sini cuma
  // buang2 kredit kalau formatnya memang tidak tersedia.
  try {
    const res = await fetch(`${FASTSAVER_UPSTREAM}/v1/youtube/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.FASTSAVER_API_KEY },
      body: JSON.stringify({ url, format }),
    });
    return await res.json();
  } catch (err) {
    return { ok: false, detail: 'FastSaverAPI error: ' + err.message };
  }
}

async function tryRapidApiYoutube(url, format, env) {
  if (!env.RAPIDAPI_KEY) return { ok: false, detail: 'RAPIDAPI_KEY belum diatur -- fallback dilewati.' };
  const videoId = extractYoutubeId(url);
  if (!videoId) return { ok: false, detail: 'Tidak bisa mengenali video ID YouTube dari link ini.' };
  // Angka resolusi dari `format` (mis. "720p" -> 720) -- dipakai di bawah
  // utk MENCARI entri RapidAPI dgn `quality`/`qualityLabel` paling dekat,
  // supaya fallback ini jg menghormati kartu resolusi yg diklik user
  // (bukan cuma selalu ambil kualitas gabungan pertama apa adanya spt
  // sebelumnya). Kalau formatnya "audio" atau angkanya tidak kebaca,
  // logic lama (entri gabungan video+audio pertama) tetap dipakai.
  const wantedRes = format && format !== 'audio' ? parseInt(format, 10) : null;

  try {
    const qs = new URLSearchParams({ videoId, urlAccess: 'normal', videos: 'true', audios: 'true' });
    const res = await fetch(`https://${RAPIDAPI_HOST}/v2/video/details?${qs.toString()}`, {
      headers: {
        'X-RapidAPI-Key': env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST,
      },
    });
    const raw = await res.json();

    // CATATAN: skema respons persis dari API ini belum pernah dicek
    // langsung terhadap key sungguhan, jadi kode di bawah ditulis
    // defensif (banyak fallback nama field). Kalau ternyata bentuknya
    // beda, cek `raw` yg di-log lewat console.warn di bawah (tab "Logs"
    // di dashboard Cloudflare Worker) utk menyesuaikan.
    if (!raw || raw.status === 'ERROR' || (!raw.videos && !raw.title)) {
      console.warn('[UnduhVideo] Respons mentah RapidAPI (gagal/tak dikenali):', JSON.stringify(raw));
      return { ok: false, detail: 'RapidAPI gagal/tidak mengenali video ini.' };
    }

    const videos = Array.isArray(raw.videos) ? raw.videos : (Array.isArray(raw.videos?.items) ? raw.videos.items : []);
    // Fungsi kecil buat baca angka resolusi dari field `quality`/
    // `qualityLabel` yg mana pun tersedia di entri RapidAPI (skema
    // persisnya belum dikonfirmasi, jadi dicoba beberapa nama field).
    const resOf = (v) => {
      const raw2 = v.qualityLabel || v.quality || '';
      const m = String(raw2).match(/\d+/);
      return m ? parseInt(m[0], 10) : null;
    };
    // Kalau user minta resolusi spesifik (wantedRes), cari entri video+
    // audio gabungan dgn resolusi PALING DEKAT ke situ dulu -- baru kalau
    // tidak ketemu sama sekali, jatuh ke logic lama (entri gabungan
    // pertama apa adanya, atau entri pertama yg punya url).
    let best = null;
    if (wantedRes) {
      const combined = videos.filter((v) => v && v.url && v.hasAudio && v.hasVideo);
      if (combined.length) {
        best = combined.reduce((closest, v) => {
          const r = resOf(v);
          if (r === null) return closest;
          if (!closest) return v;
          return Math.abs(r - wantedRes) < Math.abs(resOf(closest) - wantedRes) ? v : closest;
        }, null);
      }
    }
    best = best
      || videos.find((v) => v && v.url && v.hasAudio && v.hasVideo)
      || videos.find((v) => v && v.url);

    const audios = Array.isArray(raw.audios) ? raw.audios : (Array.isArray(raw.audios?.items) ? raw.audios.items : []);
    const bestAudio = audios.find((a) => a && a.url);

    if (!best && !bestAudio) {
      console.warn('[UnduhVideo] RapidAPI tanpa link unduhan, raw:', JSON.stringify(raw));
      return { ok: false, detail: 'RapidAPI tidak mengembalikan link unduhan (mungkin perlu urlAccess=normal di plan Anda).' };
    }

    const thumbs = Array.isArray(raw.thumbnails) ? raw.thumbnails : [];
    const thumb = thumbs.length ? thumbs[thumbs.length - 1].url : undefined;

    return {
      ok: true,
      type: best ? 'video' : 'audio',
      title: raw.title || 'Video YouTube',
      thumbnail_url: thumb,
      duration: raw.lengthSeconds != null ? Number(raw.lengthSeconds) : undefined,
      download_url: best ? best.url : bestAudio.url,
      music_url: (best && bestAudio) ? bestAudio.url : undefined,
      _source: 'rapidapi-fallback',
    };
  } catch (err) {
    return { ok: false, detail: 'RapidAPI error: ' + err.message };
  }
}

export default {
  async fetch(request, env) {
    // Preflight CORS (browser selalu kirim OPTIONS dulu utk request
    // POST/JSON lintas-origin spt ini).
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const incoming = new URL(request.url);

    // ---- Endpoint khusus YouTube: FastSaverAPI dulu, fallback RapidAPI ----
    if (incoming.pathname === '/v1/youtube/download' && request.method === 'POST') {
      let body;
      try {
        body = JSON.parse(await request.text());
      } catch (e) {
        return jsonResponse({ ok: false, detail: 'Body request tidak valid (harus JSON).' }, 400);
      }
      if (!body || !body.url) {
        return jsonResponse({ ok: false, detail: 'Field "url" wajib diisi.' }, 400);
      }
      if (!body.format) {
        return jsonResponse({ ok: false, detail: 'Field "format" wajib diisi (mis. "720p" atau "audio").' }, 400);
      }

      const primary = await tryFastSaverYoutube(body.url, body.format, env);
      if (primary.ok) return jsonResponse(primary);

      console.warn('[UnduhVideo] FastSaverAPI gagal utk YouTube, coba fallback RapidAPI:', JSON.stringify(primary));
      const fallback = await tryRapidApiYoutube(body.url, body.format, env);
      if (fallback.ok) return jsonResponse(fallback);

      console.warn('[UnduhVideo] RapidAPI fallback juga gagal:', JSON.stringify(fallback));
      // Balikan detail dari FastSaverAPI (percobaan utama) sbg pesan
      // utama, tapi sertakan info fallback jg di field terpisah supaya
      // kelihatan di Console kalau perlu debug.
      return jsonResponse({
        ok: false,
        detail: primary.detail || 'Gagal mengambil video YouTube (FastSaverAPI & fallback RapidAPI sama-sama gagal).',
        _fallbackDetail: fallback.detail,
      }, 502);
    }

    // ---- Platform lain (TikTok/Instagram/Facebook): proxy polos spt sebelumnya ----
    if (!env.FASTSAVER_API_KEY) {
      return jsonResponse({ ok: false, detail: 'FASTSAVER_API_KEY belum diatur di Worker Settings > Variables and Secrets.' }, 500);
    }

    const targetUrl = FASTSAVER_UPSTREAM + incoming.pathname + incoming.search;
    const upstreamHeaders = { 'X-Api-Key': env.FASTSAVER_API_KEY };
    let body;
    if (request.method === 'POST') {
      upstreamHeaders['Content-Type'] = 'application/json';
      body = await request.text();
    }

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: request.method,
        headers: upstreamHeaders,
        body,
      });
      const text = await upstreamRes.text();
      return new Response(text, {
        status: upstreamRes.status,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return jsonResponse({ ok: false, detail: 'Worker gagal menghubungi FastSaverAPI: ' + err.message }, 502);
    }
  },
};

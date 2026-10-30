// Statistik proyek dari GitHub API.
//
// Strategi:
// - Empat request /repos/{owner}/{repo} paralel (bukan /users/{u}/repos yang
//   mengunduh seluruh repo hanya untuk menampilkan empat).
// - Cache sessionStorage 30 menit, jadi reload tidak memanggil API lagi.
// - Angka yang sudah tertulis di HTML adalah fallback: kalau API gagal,
//   rate-limit (60/jam/IP), atau offline, kartu tetap menampilkan angka lama.
(() => {
    const OWNER = 'KiyoEditz';
    const TTL = 30 * 60 * 1000;
    const KEY = (slug) => `gh:repo:v1:${slug}`;

    const readCache = (slug) => {
        try {
            const raw = sessionStorage.getItem(KEY(slug));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed.t === 'number' ? parsed : null;
        } catch (error) {
            return null;
        }
    };

    const writeCache = (slug, data) => {
        try {
            sessionStorage.setItem(KEY(slug), JSON.stringify({ t: Date.now(), d: data }));
        } catch (error) {
            // Mode privat / storage penuh: abaikan, data tetap tampil dari HTML.
        }
    };

    async function fetchRepo(slug) {
        const cached = readCache(slug);
        if (cached && Date.now() - cached.t < TTL) return cached.d;

        try {
            const res = await fetch(`https://api.github.com/repos/${OWNER}/${slug}`, {
                headers: { Accept: 'application/vnd.github+json' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            writeCache(slug, data);
            return data;
        } catch (error) {
            // Data lama lebih baik daripada tidak ada.
            if (cached) return cached.d;
            throw error;
        }
    }

    function render(card, data) {
        const stars = card.querySelector('[data-field="stars"]');
        const forks = card.querySelector('[data-field="forks"]');
        const wrap = card.querySelector('.project-stars');

        if (stars && Number.isFinite(data.stargazers_count)) {
            stars.textContent = data.stargazers_count;
        }
        if (forks && Number.isFinite(data.forks_count)) {
            forks.textContent = data.forks_count;
        }
        if (wrap && stars && forks) {
            wrap.setAttribute('aria-label', `${stars.textContent} bintang, ${forks.textContent} fork`);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const cards = Array.from(document.querySelectorAll('.project-card[data-repo]'));
        if (cards.length === 0) return;

        cards.forEach((card) => card.setAttribute('aria-busy', 'true'));

        Promise.allSettled(cards.map(async (card) => {
            const data = await fetchRepo(card.dataset.repo);
            render(card, data);
        })).then((results) => {
            cards.forEach((card) => card.setAttribute('aria-busy', 'false'));
            results.forEach((result) => {
                if (result.status === 'rejected') {
                    console.info('Statistik GitHub tidak tersedia:', result.reason && result.reason.message);
                }
            });
        });
    });
})();
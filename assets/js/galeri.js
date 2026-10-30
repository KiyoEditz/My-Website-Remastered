// Galeri: grid masonry + lightbox <dialog>. Semua di dalam IIFE tanpa
// inline handler, agar CSP script-src 'self' tetap valid.
(() => {
    const buttons = Array.from(document.querySelectorAll('.pin-btn'));
    const dialog = document.getElementById('lightbox');
    if (buttons.length === 0 || !dialog) return;

    const img = dialog.querySelector('.lightbox-image');
    const title = dialog.querySelector('.lightbox-title');
    const desc = dialog.querySelector('.lightbox-desc');
    const counter = dialog.querySelector('.lightbox-counter');
    const prevBtn = dialog.querySelector('.lightbox-prev');
    const nextBtn = dialog.querySelector('.lightbox-next');
    const closeBtn = dialog.querySelector('.lightbox-close');

    const items = buttons.map((btn) => {
        const picture = btn.querySelector('img');
        const titleEl = btn.querySelector('.pin-title');
        const descEl = btn.querySelector('.pin-desc');
        return {
            src: picture.currentSrc || picture.src,
            alt: picture.alt,
            title: titleEl ? titleEl.textContent.trim() : '',
            desc: descEl ? descEl.textContent.trim() : ''
        };
    });

    let current = 0;
    let lastFocused = 0;

    const render = (index) => {
        // Wrap-around: dari gambar terakhir lanjut ke pertama, dan sebaliknya.
        current = (index + items.length) % items.length;
        const item = items[current];
        img.src = item.src;
        img.alt = item.alt;
        title.textContent = item.title;
        desc.textContent = item.desc;
        counter.textContent = `${current + 1} / ${items.length}`;
    };

    buttons.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            lastFocused = i;
            render(i);
            dialog.showModal();
        });
    });

    prevBtn.addEventListener('click', () => render(current - 1));
    nextBtn.addEventListener('click', () => render(current + 1));
    closeBtn.addEventListener('click', () => dialog.close());

    // Klik di area backdrop (target = dialog itu sendiri) menutup lightbox.
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });

    // Navigasi keyboard. Esc ditangani native oleh <dialog>.
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') render(current - 1);
        else if (event.key === 'ArrowRight') render(current + 1);
    });

    // Kembalikan fokus ke pin asal setelah lightbox ditutup.
    dialog.addEventListener('close', () => {
        if (buttons[lastFocused]) buttons[lastFocused].focus();
    });

    // Geser (swipe) untuk layar sentuh.
    let touchStartX = 0;
    let touchDeltaX = 0;
    const SWIPE_THRESHOLD = 50; // px minimal agar dianggap swipe, bukan tap

    dialog.addEventListener('touchstart', (event) => {
        touchStartX = event.changedTouches[0].screenX;
        touchDeltaX = 0;
    }, { passive: true });

    dialog.addEventListener('touchmove', (event) => {
        touchDeltaX = event.changedTouches[0].screenX - touchStartX;
    }, { passive: true });

    dialog.addEventListener('touchend', () => {
        if (Math.abs(touchDeltaX) < SWIPE_THRESHOLD) return;
        render(touchDeltaX < 0 ? current + 1 : current - 1);
    });
})();
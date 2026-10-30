// Efek mengetik kutipan + penanganan ?prank.
// Dipindahkan dari <script> inline di profil.html.
(() => {
    const TEXT_1 = 'Teruslah merasa haus akan ilmu pengetahuan, karena ia jauh lebih bermanfaat daripada sekadar gengsi dan hawa nafsu.';
    const TEXT_2 = '"Ketika saya menulis kode ini, hanya Tuhan dan saya yang mengerti. Sekarang, hanya Tuhan yang tahu."';
    const SPEED = 40;

    const el1 = document.getElementById('typing-text');
    const el2 = document.getElementById('typing-text2');

    // Hormati prefers-reduced-motion: tampilkan kutipan utuh tanpa animasi.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion) {
        if (el1) el1.textContent = TEXT_1;
        if (el2) el2.textContent = TEXT_2;
    } else if (el1 && el2) {
        let i1 = 0;
        let i2 = 0;

        const typeEffect1 = () => {
            if (i1 < TEXT_1.length) {
                el1.textContent += TEXT_1.charAt(i1);
                i1++;
                setTimeout(typeEffect1, SPEED);
            } else {
                setTimeout(typeEffect2, 500); // Jeda sejenak sebelum teks kedua
            }
        };

        const typeEffect2 = () => {
            if (i2 < TEXT_2.length) {
                el2.textContent += TEXT_2.charAt(i2);
                i2++;
                setTimeout(typeEffect2, SPEED);
            }
        };

        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(typeEffect1, 800); // Mulai setelah animasi fade-in selesai
        });
    }

    // Script prank tetap dipertahankan.
    window.addEventListener('load', () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('prank')) {
            alert('no, you have to stay here lol.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    });
})();
// Tombol "Exit chrome" di halaman prank.
// Dipindahkan dari <script> inline di index.html.
(() => {
    const btnExit = document.getElementById('btnExit');
    if (!btnExit) return;

    btnExit.addEventListener('click', () => {
        alert('Thank you for visiting!');
        if (Math.random() < 0.5) {
            // LELUCON: arahkan ke profil dengan pesan rahasia
            window.location.href = 'profil.html?prank=true';
        } else {
            // NORMAL: arahkan ke Google
            window.location.href = 'https://www.google.com';
        }
    });
})();
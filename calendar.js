document.addEventListener('DOMContentLoaded', () => {
  const link = document.getElementById('addToCalendar');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const ua = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(ua);
    const isAndroid = /android/.test(ua);

    const title = 'Mariage Traditionnel — Murielle & Ricardo';
    const details = 'Cérémonie traditionnelle. Dresscode: Blanc ou prune.';
    const location = 'Maison Rodriguez, Cococodji, Bénin';
    // 20/12/2025 14:00–16:00 WAT (UTC+1) ≈ 13:00–15:00 UTC
    const startUtc = '20251220T130000Z';
    const endUtc = '20251220T150000Z';
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${startUtc}/${endUtc}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(location)}&sf=true&output=xml`;

    if (isAndroid) {
      window.open(gcalUrl, '_blank');
    } else {
      // iOS et desktop: ouvrir le fichier ICS
      window.location.href = 'event.ics';
    }
  });
});
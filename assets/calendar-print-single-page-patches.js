/* ACC Schedule Manager — single-page Calendar & Print override */
(function(){
  'use strict';
  const VERSION='2026.08.15.1';
  console.info(`[ACC Schedule Manager] single-page calendar print loaded: ${VERSION}`);

  if(document.getElementById('calendarSinglePagePrintStyles')) return;
  const s=document.createElement('style');
  s.id='calendarSinglePagePrintStyles';
  s.textContent=`
  @media print {
    /* Remove mobile width constraints that otherwise create horizontal print pages. */
    #calendarPrintModal .cal-calendar-scroll {
      width:100% !important;
      max-width:100% !important;
      overflow:visible !important;
    }
    #calendarPrintModal .cal-month-grid {
      width:100% !important;
      min-width:0 !important;
      max-width:100% !important;
      height:6.45in !important;
      grid-template-columns:repeat(7,minmax(0,1fr)) !important;
      grid-template-rows:.28in repeat(6,minmax(0,1fr)) !important;
      overflow:hidden !important;
      page-break-inside:avoid !important;
      break-inside:avoid-page !important;
    }
    #calendarPrintModal .cal-dow {
      min-width:0 !important;
      padding:3px 2px !important;
      font-size:7.5pt !important;
      line-height:1 !important;
    }
    #calendarPrintModal .cal-day {
      min-width:0 !important;
      min-height:0 !important;
      height:auto !important;
      padding:3px 4px !important;
      overflow:hidden !important;
      page-break-inside:avoid !important;
      break-inside:avoid !important;
    }
    #calendarPrintModal .cal-day-num {
      margin-bottom:2px !important;
      font-size:8pt !important;
      line-height:1 !important;
    }
    #calendarPrintModal .cal-staff {
      gap:0 !important;
    }
    #calendarPrintModal .cal-person,
    #calendarPrintModal .cal-person.extra {
      padding:0 !important;
      margin:0 !important;
      font-size:7.5pt !important;
      line-height:1.12 !important;
      white-space:normal !important;
      overflow-wrap:anywhere !important;
    }
    #calendarPrintModal .cal-empty-day {
      font-size:6.5pt !important;
      line-height:1.1 !important;
    }
    #calendarPrintModal .cal-print-head {
      margin:0 0 .08in 0 !important;
      min-height:0 !important;
      page-break-after:avoid !important;
      break-after:avoid-page !important;
    }
    #calendarPrintModal .cal-print-title {
      font-size:15pt !important;
      line-height:1.05 !important;
      margin:0 !important;
    }
    #calendarPrintModal .cal-print-sub {
      font-size:7.5pt !important;
      line-height:1.15 !important;
      margin-top:2px !important;
    }
    #calendarPrintModal .cal-note {
      margin-top:.05in !important;
      font-size:6.5pt !important;
      line-height:1.1 !important;
    }
    #calendarPrintModal #calContent {
      width:100% !important;
      max-width:100% !important;
      page-break-inside:avoid !important;
      break-inside:avoid-page !important;
    }

    /* Weekly view also stays on one sheet. */
    #calendarPrintModal .cal-week {
      gap:3px !important;
      page-break-inside:avoid !important;
      break-inside:avoid-page !important;
    }
    #calendarPrintModal .cal-week-day {
      min-height:0 !important;
      grid-template-columns:1.25in 1fr !important;
      page-break-inside:avoid !important;
      break-inside:avoid !important;
    }
    #calendarPrintModal .cal-week-date {
      padding:6px !important;
      font-size:8pt !important;
    }
    #calendarPrintModal .cal-week-staff {
      padding:4px 6px !important;
      gap:3px !important;
    }
    #calendarPrintModal .cal-week-person,
    #calendarPrintModal .cal-week-person.extra {
      padding:3px 5px !important;
      font-size:7.5pt !important;
    }

    @page {
      size: landscape;
      margin:.22in;
    }
  }
  `;
  document.head.appendChild(s);
})();

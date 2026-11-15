// Beispieldaten für die Vorschau (?demo). Alle Namen sind erfunden.

const pad = (n) => String(n).padStart(2, '0');

function day(offset) {
  const t = new Date(Date.now() + offset * 86400000);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

export function demoData() {
  // Wanduhr in Thailand in 3 Std. 25 Min.
  const bkk = new Date(Date.now() + (7 * 60 + 3 * 60 + 25) * 60000);
  const soonLocal = `${bkk.getUTCFullYear()}-${pad(bkk.getUTCMonth() + 1)}-${pad(bkk.getUTCDate())}T${pad(bkk.getUTCHours())}:${pad(bkk.getUTCMinutes() - (bkk.getUTCMinutes() % 5))}:00`;
  const stays = [
    { id: 'd-s1', name: 'Baan Sabai Riverside', platform: 'booking', booking_url: 'https://www.booking.com/hotel/th/baan-sabai-riverside.de.html', address: 'Charoen Krung Rd, Bangkok', check_in: day(-3), check_out: day(0), check_in_time: 'ab 14:00', check_out_time: 'bis 12:00', confirmation_code: '4821 557 902', price: 96, currency: 'EUR', paid: true, notes: 'Frühstück auf der Dachterrasse ab 7 Uhr.' },
    { id: 'd-s2', name: 'Lanta Palm Bungalows', platform: 'agoda', booking_url: 'https://www.agoda.com/de-de/lanta-palm-bungalows/hotel/koh-lanta-th.html', address: 'Long Beach, Koh Lanta', check_in: day(0), check_out: day(5), check_in_time: 'ab 13:00', check_out_time: 'bis 11:00', confirmation_code: '1187334590', price: 210, currency: 'EUR', paid: false, contact: '+66 81 000 0000 (WhatsApp)' },
    { id: 'd-s3', name: 'Ruang Kayu Ubud', platform: 'airbnb', booking_url: 'https://www.airbnb.de/rooms/12345678', address: 'Jl. Raya Penestanan, Ubud, Bali', check_in: day(7), check_out: day(12), check_in_time: 'ab 15:00', confirmation_code: 'HM4K2PX9QZ', price: 340, currency: 'EUR', paid: true },
  ];
  const transports = [
    { id: 'd-t1', kind: 'ferry', title: 'Speedboat nach Koh Lanta', carrier: 'Andaman Wave', from_place: 'Krabi', to_place: 'Koh Lanta', departure_location: 'Klong Jilad Pier', arrival_location: 'Saladan Pier', departure_local: soonLocal, departure_tz: 'Asia/Bangkok', be_there_minutes: 30, confirmation_code: 'AW-77310', seats: '2 Personen', baggage: '1 großes Gepäckstück p. P.' },
    { id: 'd-t2', kind: 'ferry', carrier: 'Andaman Wave', from_place: 'Koh Lanta', to_place: 'Koh Phi Phi', departure_location: 'Saladan Pier', arrival_location: 'Tonsai Pier', departure_local: `${day(5)}T08:30:00`, departure_tz: 'Asia/Bangkok', arrival_local: `${day(5)}T10:00:00`, arrival_tz: 'Asia/Bangkok', be_there_minutes: 30, confirmation_code: 'AW-77544' },
    { id: 'd-t3', kind: 'flight', carrier: 'Island Air', number: 'IA 412', from_place: 'Phuket (HKT)', to_place: 'Denpasar (DPS)', departure_location: 'Terminal International', departure_local: `${day(7)}T11:40:00`, departure_tz: 'Asia/Bangkok', arrival_local: `${day(7)}T16:05:00`, arrival_tz: 'Asia/Makassar', be_there_minutes: 120, confirmation_code: 'Q7ZK2M', baggage: '20 kg Aufgabegepäck', seats: '14A, 14B' },
    { id: 'd-t0', kind: 'flight', carrier: 'Island Air', number: 'IA 201', from_place: 'Bangkok (DMK)', to_place: 'Krabi (KBV)', departure_local: `${day(0)}T06:10:00`, departure_tz: 'Asia/Bangkok', arrival_local: `${day(0)}T07:30:00`, arrival_tz: 'Asia/Bangkok', be_there_minutes: 90, confirmation_code: 'B3XR8T' },
  ];
  const documents = [
    { id: 'd-d1', transport_id: 'd-t1', storage_path: 'demo/ticket-1.svg', file_name: 'Ticket Speedboat.svg', mime_type: 'image/svg+xml' },
    { id: 'd-d2', transport_id: 'd-t3', storage_path: 'demo/boarding-1.svg', file_name: 'Boarding Pass.svg', mime_type: 'image/svg+xml' },
  ];
  return { stays, transports, documents, fetchedAt: new Date().toISOString() };
}

/** Erzeugt ein Beispiel-Ticket als SVG mit Pseudo-QR-Code. */
export function demoTicketSvg(title, code) {
  let cells = '';
  let seed = [...code].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const on = finder
        ? (x % 6 === 0 || y % 6 === 0 || (x % 7 > 1 && x % 7 < 5 && y % 7 > 1 && y % 7 < 5) || x === 20 || y === 20 || x === 14 || y === 14)
        : seed % 2 === 0;
      if (on) cells += `<rect x="${60 + x * 12}" y="${190 + y * 12}" width="12" height="12"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 372 520"><rect width="372" height="520" rx="18" fill="#fff"/><text x="30" y="60" font-family="sans-serif" font-size="22" font-weight="700" fill="#12343B">${title}</text><text x="30" y="96" font-family="sans-serif" font-size="16" fill="#5D7176">Buchung ${code}</text><text x="30" y="150" font-family="sans-serif" font-size="14" fill="#5D7176">Beispiel – kein echtes Ticket</text><g fill="#12343B">${cells}</g></svg>`;
}

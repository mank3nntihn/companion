// Supabase-Zugangsdaten. Der "publishable"/anon Key ist öffentlich gedacht,
// der Schutz der Daten passiert über Row Level Security in der Datenbank.
export const SUPABASE_URL = 'https://wdbabsdxzykexwsxaxmb.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ys-GCIF0O7cnlo4WOQiqiw_HLNQzRg_';

// Benutzernamen werden intern zu <name>@<USER_DOMAIN>, es werden nie Mails verschickt.
export const USER_DOMAIN = 'travelbuddy.local';

// Name der App auf dem Startbildschirm und unter dem Homescreen-Icon
export const APP_NAME = 'Hafen';

// Name der aktuellen Reise im Modul Travel Buddy
export const TRIP_NAME = 'Thailand & Bali';

// Wird beim Deployment automatisch gesetzt (Commit und Datum)
export const BUILD = 'dev';

// data.jsx — date helpers + month constants. No personal data lives here
// anymore; the friend list is loaded at runtime from public.profiles. The
// initial seed values are kept in Supabase migrations, not in this file.

function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }
function daysUntilBirthday(friend, today){
  const t = startOfDay(today);
  const year = t.getFullYear();
  let next = new Date(year, friend.month - 1, friend.day);
  next = startOfDay(next);
  if (next < t) next = new Date(year + 1, friend.month - 1, friend.day);
  const ms = next - t;
  return Math.round(ms / 86400000);
}
function isToday(friend, today){
  const t = startOfDay(today);
  return t.getMonth() === friend.month - 1 && t.getDate() === friend.day;
}
function ageBracket(days){
  if (days === 0) return "today";
  if (days <= 3)  return "imminent";
  if (days <= 7)  return "soon";
  if (days <= 30) return "near";
  return "later";
}
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function ordinal(n){
  const s=["th","st","nd","rd"], v=n%100;
  return n + (s[(v-20)%10]||s[v]||s[0]);
}

Object.assign(window, { daysUntilBirthday, isToday, ageBracket, MONTHS, MONTHS_SHORT, ordinal, startOfDay });

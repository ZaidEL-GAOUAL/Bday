// =============================================================================
//  The Birthday Wall — iOS home-screen widget for Scriptable.app (free).
//
//  Setup:
//    1. Install Scriptable from the App Store (free).
//    2. Open Scriptable → tap the "+" top-right → paste this whole file in.
//    3. Tap the title bar, name it "Birthday Wall", tap Done.
//    4. Edit the PASSCODE constant just below to your wall's passcode.
//    5. Long-press your home screen → "+" top-left → search "Scriptable" →
//       pick the medium or large size → tap "Add Widget" → tap the widget →
//       under "Script" pick "Birthday Wall".
//
//  Refresh: iOS decides when to update widgets, usually every 15-30 min.
//
//  No passwords, no logins. Just the same passcode you use on the website.
//  The widget hits a passcode-protected Edge Function that returns a
//  signed photo URL valid for 2h, so cold-cached widgets keep working.
// =============================================================================

const PASSCODE     = "PUT-YOUR-PASSCODE-HERE";
const SUPABASE_URL = "https://adgqourcxbjkupdrqpyt.supabase.co";
const ANON_KEY     = "sb_publishable_SDf6CKA_DJR1uMNJk1SOeg_1kXRRpls";

const COLORS = {
  paper:   new Color("#f5edcf"),
  ink:     new Color("#1f1812"),
  inkSoft: new Color("#5a4f44"),
  tomato:  new Color("#e4634a"),
};

function colorFromCss(c){
  if (!c) return COLORS.inkSoft;
  if (c.includes("tomato"))   return new Color("#e4634a");
  if (c.includes("mustard"))  return new Color("#d9b53f");
  if (c.includes("mint"))     return new Color("#7ac4a9");
  if (c.includes("sky"))      return new Color("#8ab8d8");
  if (c.includes("lavender")) return new Color("#b399ce");
  if (c.includes("pink"))     return new Color("#e598a2");
  return COLORS.inkSoft;
}

function fmtDays(n){
  if (n === 0) return "today 🎉";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

async function loadData(){
  const req = new Request(`${SUPABASE_URL}/functions/v1/widget-data`);
  req.method  = "POST";
  req.headers = {
    "Content-Type":  "application/json",
    "apikey":        ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
  };
  req.body = JSON.stringify({ passcode: PASSCODE });
  return await req.loadJSON();
}

async function loadImage(url){
  try { return await new Request(url).loadImage(); }
  catch (_) { return null; }
}

function buildWidget(data, photo){
  const w = new ListWidget();
  w.backgroundColor = COLORS.paper;
  w.setPadding(14, 14, 14, 14);

  const top = w.addStack();
  top.layoutVertically();

  const label = top.addText("THE BIRTHDAY WALL");
  label.font = Font.boldSystemFont(9);
  label.textColor = COLORS.inkSoft;

  top.addSpacer(4);

  if (data.next && data.next[0]){
    const next = data.next[0];

    const nameRow = top.addStack();
    nameRow.centerAlignContent();
    const dot = nameRow.addText("●");
    dot.font = Font.boldSystemFont(20);
    dot.textColor = colorFromCss(next.color);
    nameRow.addSpacer(6);
    const name = nameRow.addText(next.name);
    name.font = Font.boldSystemFont(24);
    name.textColor = COLORS.ink;
    name.lineLimit = 1;

    const sub = top.addText(fmtDays(next.days));
    sub.font = Font.semiboldSystemFont(14);
    sub.textColor = COLORS.inkSoft;
  } else {
    const empty = top.addText("no birthdays yet");
    empty.font = Font.semiboldSystemFont(16);
    empty.textColor = COLORS.inkSoft;
  }

  if (data.next && data.next.length > 1){
    top.addSpacer(8);
    for (let i = 1; i < Math.min(data.next.length, 3); i++){
      const n = data.next[i];
      const row = top.addStack();
      row.centerAlignContent();
      const d = row.addText("●");
      d.font = Font.boldSystemFont(10);
      d.textColor = colorFromCss(n.color);
      row.addSpacer(5);
      const nm = row.addText(n.name);
      nm.font = Font.semiboldSystemFont(12);
      nm.textColor = COLORS.ink;
      nm.lineLimit = 1;
      row.addSpacer();
      const sub = row.addText(fmtDays(n.days));
      sub.font = Font.regularSystemFont(11);
      sub.textColor = COLORS.inkSoft;
    }
  }

  if (photo){
    w.addSpacer();
    const img = w.addImage(photo);
    img.cornerRadius = 6;
    img.imageSize = new Size(120, 120);
    img.centerAlignImage();
  }

  // Refresh every ~15 minutes (iOS may delay this further).
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  return w;
}

function errorWidget(msg){
  const w = new ListWidget();
  w.backgroundColor = COLORS.paper;
  w.setPadding(14, 14, 14, 14);
  const t = w.addText("Birthday Wall");
  t.font = Font.boldSystemFont(13);
  t.textColor = COLORS.ink;
  w.addSpacer(6);
  const e = w.addText(msg);
  e.font = Font.regularSystemFont(11);
  e.textColor = COLORS.tomato;
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  return w;
}

let widget;
try {
  const data = await loadData();
  if (data && data.error){
    widget = errorWidget(data.error === "invalid passcode"
      ? "wrong passcode — edit it in the script"
      : data.error);
  } else {
    const photo = data.featured_photo?.url
      ? await loadImage(data.featured_photo.url)
      : null;
    widget = buildWidget(data, photo);
  }
} catch (e){
  widget = errorWidget("couldn't reach the wall — check connection");
}

if (config.runsInWidget) Script.setWidget(widget);
else widget.presentMedium();
Script.complete();

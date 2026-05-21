// =============================================================================
//  The Birthday Wall — iOS home-screen widget for Scriptable.app (free).
//
//  Easiest install: tap the "Add to iPhone widget" button on the website
//  from your iPhone (Safari). It opens this script directly in Scriptable.
//
//  Manual install: open Scriptable → + → paste this file → name it
//  "Birthday Wall" → save.
//
//  First run: open the script once inside Scriptable and tap Run (▶).
//  It'll ask for the wall's passcode and save it to iOS Keychain so you
//  never have to re-enter it.
//
//  Then long-press the home screen → + → search "Scriptable" → pick a
//  size (medium or large) → tap the widget → set Script to "Birthday Wall".
// =============================================================================

const SUPABASE_URL  = "https://adgqourcxbjkupdrqpyt.supabase.co";
const ANON_KEY      = "sb_publishable_SDf6CKA_DJR1uMNJk1SOeg_1kXRRpls";
const PASSCODE_KEY  = "bday-wall-passcode";

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

async function getPasscode(){
  if (Keychain.contains(PASSCODE_KEY)) return Keychain.get(PASSCODE_KEY);
  // Widgets can't show dialogs — only ask in the app itself.
  if (config.runsInWidget) return null;
  const alert = new Alert();
  alert.title = "Birthday Wall";
  alert.message = "Enter your wall's passcode. We'll save it to iOS Keychain so you never see this again.";
  alert.addSecureTextField("passcode", "");
  alert.addAction("Save");
  alert.addCancelAction("Cancel");
  const idx = await alert.present();
  if (idx !== 0) return null;
  const p = alert.textFieldValue(0).trim();
  if (p) Keychain.set(PASSCODE_KEY, p);
  return p || null;
}

async function loadData(passcode){
  const req = new Request(`${SUPABASE_URL}/functions/v1/widget-data`);
  req.method  = "POST";
  req.headers = {
    "Content-Type":  "application/json",
    "apikey":        ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
  };
  req.body = JSON.stringify({ passcode });
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
  const passcode = await getPasscode();
  if (!passcode){
    widget = errorWidget("open this script in Scriptable to set the passcode");
  } else {
    const data = await loadData(passcode);
    if (data && data.error){
      if (data.error === "invalid passcode"){
        // Wipe the stored passcode so the next manual run re-prompts.
        try { Keychain.remove(PASSCODE_KEY); } catch (_) {}
        widget = errorWidget("wrong passcode — open the script to re-enter");
      } else {
        widget = errorWidget(data.error);
      }
    } else {
      const photo = data.featured_photo?.url
        ? await loadImage(data.featured_photo.url)
        : null;
      widget = buildWidget(data, photo);
    }
  }
} catch (e){
  widget = errorWidget("couldn't reach the wall — check connection");
}

if (config.runsInWidget) Script.setWidget(widget);
else widget.presentMedium();
Script.complete();

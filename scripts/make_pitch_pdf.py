"""Builds docs/pitch/VIGHNAWAY-round1-pitch-script.pdf (needs: pip install reportlab pillow; Windows fonts)."""
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "pitch" / "VIGHNAWAY-round1-pitch-script.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
SHOTS = ROOT / "apps" / "console" / "screenshots"
PREV = ROOT / "docs" / "design" / "preview"

FONTS = Path("C:/Windows/Fonts")
pdfmetrics.registerFont(TTFont("Body", str(FONTS / "segoeui.ttf")))
pdfmetrics.registerFont(TTFont("Body-Bold", str(FONTS / "segoeuib.ttf")))
pdfmetrics.registerFont(TTFont("Body-Italic", str(FONTS / "segoeuii.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Body-Bold", italic="Body-Italic", boldItalic="Body-Bold")

TEAL = colors.HexColor("#0F766E")
INK = colors.HexColor("#14202B")
MUTED = colors.HexColor("#5B6770")
PALE = colors.HexColor("#E8F3F1")
LINE = colors.HexColor("#D5DDE0")


def st(name, **kw):
    base = dict(fontName="Body", fontSize=10, leading=14.5, textColor=INK)
    base.update(kw)
    return ParagraphStyle(name, **base)


H1 = st("h1", fontName="Body-Bold", fontSize=26, leading=30, textColor=TEAL)
H2 = st("h2", fontName="Body-Bold", fontSize=15, leading=19, textColor=TEAL, spaceBefore=10, spaceAfter=5)
SUB = st("sub", fontSize=12, leading=17, textColor=MUTED)
P = st("p", spaceAfter=5)
SMALL = st("small", fontSize=8.5, leading=12, textColor=MUTED)
CELL = st("cell", fontSize=9.5, leading=13.5)
CELLB = st("cellb", fontSize=9.5, leading=13.5, fontName="Body-Bold")
SAY = st("say", fontSize=10, leading=14)
DO = st("do", fontSize=9, leading=12.5, textColor=MUTED, fontName="Body-Italic")
QH = st("qh", fontName="Body-Bold", fontSize=10, leading=14)


def para(t, s=P):
    return Paragraph(t, s)


def footer(c, doc):
    c.saveState()
    c.setFont("Body", 8)
    c.setFillColor(MUTED)
    c.drawString(18 * mm, 10 * mm, "VIGHNAWAY · Round 1 pitch script · All conditions in the demo are simulated")
    c.drawRightString(A4[0] - 18 * mm, 10 * mm, str(doc.page))
    c.restoreState()


doc = BaseDocTemplate(str(OUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm,
                      bottomMargin=18 * mm, title="VIGHNAWAY: Round 1 pitch script", author="Team VIGHNAWAY")
W = A4[0] - 36 * mm
doc.addPageTemplates([PageTemplate(id="p", onPage=footer, frames=[
    Frame(18 * mm, 18 * mm, W, A4[1] - 34 * mm, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)])])


def box(rows, widths, extra=None, header=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    style = [("VALIGN", (0, 0), (-1, -1), "TOP"), ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
             ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
             ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6)]
    if header:
        style += [("BACKGROUND", (0, 0), (-1, 0), TEAL)]
    t.setStyle(TableStyle(style + (extra or [])))
    return t


def hdr(t):
    return Paragraph(f'<font color="white"><b>{t}</b></font>', CELL)


def img(path, width):
    w, h = PILImage.open(path).size
    return Image(str(path), width=width, height=width * h / w)


S = []

# ---------- Page 1: overview ----------
S += [para("VIGHNAWAY", H1),
      para("Round 1 pitch script: the project, the phone app and the control-room web app", SUB),
      Spacer(1, 6),
      para("Written for: the speakers presenting to the first-round judges. Target length 3 minutes; a 90-second cut is on the last page.", SMALL),
      Spacer(1, 8)]

S += [para("The one-line pitch", H2),
      para("<b>Ordinary navigation picks the fastest route. In a Mumbai monsoon, the fastest route is the one that floods first. "
           "VIGHNAWAY picks the route that is still passable, tells you why in one sentence, and changes its mind only when the evidence does.</b>", SAY)]

S += [para("The problem", H2),
      para("In Andheri, underpasses below the Western Railway fill with water and the flyovers jam. Navigation apps keep sending drivers into both. "
           "The evidence that a road is blocked does exist: people on the spot, operators, rain alerts. But it is scattered, unverified, and invisible at the moment "
           "you choose a route. The typical user is a driver or rider crossing the railway in heavy rain, often to reach a hospital, plus a control-room operator who verifies reports.")]

S += [para("What we built: three pieces, one brain", H2)]
rows = [[hdr("Piece"), hdr("Who uses it"), hdr("What it does")],
        [para("<b>Citizen app</b><br/>Android (Expo / React Native)", CELL), para("Driver, rider, pedestrian", CELL),
         para("Recommends one viable route with ETA, reason, trade-off and confidence. Re-plans from the vehicle's position during the trip, buzzes and explains in one banner. Lets people report a hazard. If nothing is viable it offers the nearest reachable hospital and says: call 112.", CELL)],
        [para("<b>Control-room web app</b><br/>Next.js console", CELL), para("Operator, and the judges' big screen", CELL),
         para("Live incident queue with Verify / Resolve / Dismiss, the same route decision as the phone, a simulation clock (Play, Step, Reset), a QR code so anyone can file a report from their phone, plus Rules and Debug pages that expose how decisions are made.", CELL)],
        [para("<b>API + shared route engine</b><br/>NestJS, PostGIS, socket.io", CELL), para("Both apps", CELL),
         para("Snaps reports to roads, corroborates them, sequences them, and streams them live. The server never sends routes: the phone and the console run the <b>same deterministic engine</b> on the same incident snapshot and reach the same answer independently.", CELL)]]
S += [box(rows, [38 * mm, 32 * mm, W - 70 * mm]), Spacer(1, 6)]

S += [para("The three proofs we want the judges to remember", H2)]
proofs = [[para("<b>1</b>", CELLB), para("<b>A different decision from shortest-path routing.</b> The usual fastest route (Andheri Subway) is shown first, and loses once corroborated knee-deep flooding blocks it.", CELL)],
          [para("<b>2</b>", CELLB), para("<b>The reason, with its evidence.</b> Every card and banner names the incident, its status (Corroborated, Verified by operator), its source (Simulated) and its age.", CELL)],
          [para("<b>3</b>", CELLB), para("<b>It moves when evidence changes, and holds when it does not.</b> One unverified report does not move the route. Corroboration does. An operator's Verify changes the label, not an already-correct decision. Reset and replay gives identical decisions.", CELL)]]
S += [box(proofs, [10 * mm, W - 10 * mm], header=False, extra=[("BACKGROUND", (0, 0), (-1, -1), PALE)])]

S += [PageBreak()]

# ---------- Spoken script ----------
S += [para("The spoken script (about 3 minutes)", H2),
      para("Two screens: the phone mirrored on the left, the control room on the right. Times are real minutes. The simulation runs at 10x, so one simulated minute is 6 real seconds. "
           "Grey italic lines are stage directions, not spoken.", SMALL), Spacer(1, 4)]


def beat(t, title, say, do):
    head = Table([[para(f"<b>{t}</b>", CELLB), para(f"<b>{title}</b>", CELLB)]], colWidths=[24 * mm, W - 24 * mm],
                 style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("TOPPADDING", (0, 0), (-1, -1), 4),
                                   ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LEFTPADDING", (0, 0), (-1, -1), 6)]))
    return [KeepTogether([head, Spacer(1, 3), para(say, SAY), para(do, DO), Spacer(1, 4)])]


S += beat("0:00-0:25", "Hook: the problem",
          "&ldquo;Everything you are about to see is simulated: real road names, simulated conditions. "
          "It is a Mumbai monsoon afternoon in Andheri. Underpasses flood. Flyovers jam. And your navigation app keeps sending you to the subway, because it is the fastest. "
          "Somewhere, someone has already seen water on that road. That information exists, but it never reaches the route you are choosing. "
          "We built VIGHNAWAY to close that gap.&rdquo;",
          "Show the console with the 'Simulated' tag and the rain alert chip. Do not touch anything yet.")

S += beat("0:25-0:50", "What it is",
          "&ldquo;VIGHNAWAY is emergency-aware navigation. It has a citizen app on Android, and a control-room web app for operators. "
          "Both run the same deterministic route engine, so the phone and the control room independently reach the same recommendation. The server never hands out a route.&rdquo;",
          "Gesture left (phone) then right (console). Press Start trip on the phone and Play on the console.")

S += beat("0:50-1:10", "Proof 1: it does not just take the fastest route",
          "&ldquo;Ordinary navigation takes Andheri Subway: 15 minutes. So do we, but look at the confidence: Medium. "
          "It is a flood-prone underpass, it is raining, and nobody has reported on it. We tell you that, and we tell you what would change our answer.&rdquo;",
          "Point at 'Medium confidence' and the 'Re-check if' line. Phone and console both show Via Andheri Subway.")

S += beat("1:10-1:25", "Proof 3: it holds when the evidence is weak",
          "&ldquo;A first report arrives: ankle-deep water at the subway. One device, unverified. The route does not change. "
          "A single unverified report is a penalty, not a block. The app says so: &lsquo;Route unchanged: one unverified report&rsquo;.&rdquo;",
          "Toast on the phone; dashed Unverified ring in the console queue (simulated 14:06).")

S += beat("1:25-1:55", "Proofs 1 and 2: it changes, and says why",
          "&ldquo;A second device reports knee-deep water, within 150 metres and 30 minutes of the first. Now it is Corroborated, and knee-deep and corroborated is a hard block. "
          "The phone buzzes: Route changed. Flooding, knee deep, at Andheri Subway. Corroborated, two devices. Simulated. New route via Gokhale Bridge, five minutes longer. "
          "One sentence, with the evidence, its source and its age.&rdquo;",
          "Simulated 14:08. Same banner on phone and console. We say 'Corroborated', never 'confirmed': it is a prototype heuristic.")

S += beat("1:55-2:10", "Operator in the loop",
          "&ldquo;Only an operator can mark something Verified. I press Verify in the control room. The chip changes on the phone within a second or two. "
          "The route does not change, because it was already right.&rdquo;",
          "Click Verify on the console (or let the scripted verify at 14:09:30 fire). Point at the phone chip: 'Verified by operator'.")

S += beat("2:10-2:35", "It keeps adapting, and it knows when to stop",
          "&ldquo;Then congestion builds on the road to the flyover. One report only counts at 40%, so we hold. Two reports and the travel time itself changes, "
          "so the farther Jogeshwari bridge now wins. Finally the hospital road is closed and verified. Now there is no viable route. We say so plainly, "
          "offer the nearest reachable hospital, and point to 112. We never say &lsquo;safe&rsquo;.&rdquo;",
          "Let the clock run 14:11 to 14:13:10. End on the No viable route sheet on the phone.")

S += beat("2:35-3:00", "Close",
          "&ldquo;Press Reset and replay: identical decisions, identical hash on both screens. Every choice you saw traces to a written rule. "
          "VIGHNAWAY: navigation that knows when the fastest route is the wrong one. Thank you. Scan the QR code and file your own flood report if you would like to try it.&rdquo;",
          "Press Reset then Play to replay the same banners. Show the QR code in the console's left panel.")

S += [PageBreak()]

# ---------- Screenshots ----------
S += [para("What the judges will see", H2),
      para("Top: the phone app, showing the recommended route, the moment the route changes, and the no-viable-route state. Bottom: the control room.", SMALL),
      Spacer(1, 4)]
ph = 50 * mm
phones = [[img(PREV / "02-navigate-peek-light.png", ph), img(PREV / "03-route-change-light.png", ph), img(PREV / "07-no-viable-light.png", ph)],
          [para("1. Recommended: Via Andheri Subway, Medium confidence", SMALL),
           para("2. Route changed: corroborated knee-deep flood, Via Gokhale Bridge", SMALL),
           para("3. No viable route: nearest hospital, call 112", SMALL)]]
S += [Table(phones, colWidths=[W / 3] * 3, style=TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                                           ("TOPPADDING", (0, 1), (-1, 1), 3)])), Spacer(1, 8)]
S += [img(SHOTS / "console-hero-route-decision-light.png", W),
      para("Control room at 14:06: incident queue with Verify / Resolve / Dismiss, the route decision with reason, trade-off and confidence, the alternative (Via Gokhale Bridge, +5 min), and the simulation timeline.", SMALL)]

S += [PageBreak()]

# ---------- Q&A ----------
S += [para("How it decides (30-second technical answer)", H2),
      para("Each candidate route gets a cost: travel time with congestion multipliers, plus penalties for each incident on it weighted by how well it is supported "
           "(unverified 0.4, corroborated 0.75, verified 1.0) and by age, plus a small penalty where reports are missing during a rain alert. "
           "Knee-deep-or-worse flooding and closures that are corroborated or verified are hard blocks. A new route only replaces the current one if it is better by more than "
           "120 seconds or 10%, so the route does not flip-flop on noise. No machine learning and no randomness: it is deterministic, so every decision is explainable and replayable. "
           "The full rule table is generated from the engine code into docs/scoring.md and shown on the console's Rules page.")]

S += [para("Likely judge questions", H2)]
qa = [
    ("Is this real data?", "The road names and the engine are real. Every flood, closure and congestion event is simulated and labelled Simulated everywhere. The road geometry currently comes from a schematic fixture with approximate positions; the OpenStreetMap extraction script is written and is the next step."),
    ("How is this different from Google Maps?", "Maps optimises time and reacts to traffic. We optimise passability under hazard, and we expose the evidence: source, status, age, confidence, and what would change the answer."),
    ("Why not machine learning?", "Hazard evidence is sparse, and in an emergency a route must be explainable. A deterministic rule engine gives the same answer on the phone and in the control room, and every decision traces to a rule."),
    ("How do you stop fake or noisy reports?", "One unverified report only adds a penalty. Two devices near the same spot within 30 minutes make it Corroborated. Only an operator can set Verified. We say plainly that device corroboration is a prototype heuristic, not proof of independent witnesses."),
    ("What if the network drops?", "The phone keeps routing on the incidents it already has and shows how old they are. On reconnect it resyncs by sequence number."),
    ("Is it safe to rely on in an emergency?", "We never claim a route is safe. When nothing is viable we say so, offer the nearest reachable hospital, and tell the user to call 112."),
    ("What is next?", "Build the real OpenStreetMap graph for Mumbai, test on physical devices, ingest live rain alerts, scale up real corroborated reports, and add more languages (Hindi strings already exist in the console)."),
]
rows = [[para(f"<b>{q}</b>", QH), para(a, CELL)] for q, a in qa]
S += [box(rows, [48 * mm, W - 48 * mm], header=False)]

S += [para("The 90-second cut", H2),
      para("Problem (15 s): the fastest route floods first. Show the subway route with Medium confidence (15 s). One unverified report: route holds (10 s). "
           "Second device: route changes, read the banner (20 s). Operator Verify (10 s). No viable route, call 112 (10 s). "
           "Close: &ldquo;Navigation that knows when the fastest route is the wrong one&rdquo; (10 s).")]

S += [para("Before you go on stage", H2),
      para("Phone and laptop on the same hotspot. API and console running, and pnpm preflight passing. Console: enter the operator token and press <b>Reset</b>. Phone: set the server address in Settings, "
           "then confirm Navigate shows Via Andheri Subway. Keep a backup phone with the same build and a backup video on the laptop. Full procedure and fallbacks: docs/demo-script.md. "
           "Say 'simulated' in the first sentence.")]

doc.build(S)
print(OUT)

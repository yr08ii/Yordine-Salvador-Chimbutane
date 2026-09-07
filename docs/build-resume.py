#!/usr/bin/env python3
"""Render the resume markdown to a single-page A4 PDF.

    python3 docs/build-resume.py                    # uses the default paths below
    python3 docs/build-resume.py in.md out.pdf      # or point it anywhere

Reads assets/Yordine-Chimbutane-Resume.md and writes assets/Yordine-Chimbutane-Resume.pdf.
The <!-- NOTES --> block at the bottom of the markdown is stripped and never
appears in the PDF.

Fitting: the script renders, counts pages, and steps type and spacing down by 2%
at a time until the document lands on one page. It reports the scale it settled
on. If that number drops much below ~0.90 the resume has grown too long — cut a
bullet rather than letting it shrink further.

Requires reportlab (already in the anaconda environment):
    pip install reportlab
"""
import re
import sys
from pathlib import Path

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Paragraph,
                                    HRFlowable, KeepTogether)
except ImportError:
    sys.exit("reportlab is not installed. Run:  pip install reportlab")

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SRC = ROOT / "assets" / "Yordine-Chimbutane-Resume.md"
DEFAULT_OUT = ROOT / "assets" / "Yordine-Chimbutane-Resume.pdf"

INK = colors.HexColor("#111111")
MUTED = colors.HexColor("#555555")
RULE = colors.HexColor("#999999")


def inline(t):
    """Markdown inline formatting -> reportlab's mini-HTML."""
    t = t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)",
               r'<link href="\2" color="#1a1a1a"><u>\1</u></link>', t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<i>\1</i>", t)
    return t


def read_blocks(path):
    src = Path(path).read_text(encoding="utf-8")
    src = re.sub(r"<!--.*?-->", "", src, flags=re.S)
    blocks = []
    for raw in src.split("\n"):
        line = raw.rstrip()
        if not line.strip():
            continue
        if line.startswith("# "):
            blocks.append(("name", line[2:].strip()))
        elif line.startswith("## "):
            blocks.append(("section", line[3:].strip()))
        elif line.startswith("---"):
            continue
        elif line.startswith("- "):
            blocks.append(("bullet", line[2:].strip()))
        elif line.startswith("*") and line.endswith("*") and not line.startswith("**"):
            blocks.append(("role", line.strip("*").strip()))
        elif line.startswith("**"):
            blocks.append(("entry", line))
        else:
            blocks.append(("plain", line))
    return blocks


def build(blocks, scale, out):
    fs = 8.9 * scale
    lead = fs * 1.30
    margin = 13 * mm

    S = {
        "name": ParagraphStyle("name", fontName="Helvetica-Bold",
                               fontSize=16.5 * scale, leading=18.5 * scale,
                               textColor=INK, spaceAfter=2.4 * scale),
        "contact": ParagraphStyle("contact", fontName="Helvetica",
                                  fontSize=7.9 * scale, leading=10.4 * scale,
                                  textColor=MUTED),
        "summary": ParagraphStyle("summary", fontName="Helvetica-Oblique",
                                  fontSize=fs, leading=lead, textColor=MUTED,
                                  spaceBefore=3.4 * scale),
        "section": ParagraphStyle("section", fontName="Helvetica-Bold",
                                  fontSize=8.6 * scale, leading=10 * scale,
                                  textColor=INK, spaceBefore=7.6 * scale,
                                  spaceAfter=1.6 * scale),
        "entry": ParagraphStyle("entry", fontName="Helvetica",
                                fontSize=fs + 0.2, leading=lead,
                                textColor=INK, spaceBefore=4.6 * scale),
        "role": ParagraphStyle("role", fontName="Helvetica-Oblique",
                               fontSize=fs - 0.2, leading=lead * 0.94,
                               textColor=MUTED, spaceAfter=1.6 * scale),
        "bullet": ParagraphStyle("bullet", fontName="Helvetica",
                                 fontSize=fs, leading=lead, textColor=INK,
                                 leftIndent=8.2, bulletIndent=1.2,
                                 spaceBefore=1.5 * scale),
        "plain": ParagraphStyle("plain", fontName="Helvetica",
                                fontSize=fs, leading=lead, textColor=INK),
    }

    flow, i = [], 0
    while i < len(blocks):
        kind, text = blocks[i]
        if kind == "name":
            flow.append(Paragraph(inline(text), S["name"]))
        elif kind == "section":
            flow.append(Paragraph(inline(text.upper()), S["section"]))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=RULE,
                                   spaceBefore=0.5, spaceAfter=2.2 * scale))
        elif kind == "entry":
            # an entry header must not be orphaned from its role line and first bullet
            grp = [Paragraph(inline(text), S["entry"])]
            j = i + 1
            while j < len(blocks) and blocks[j][0] in ("role", "bullet"):
                k2, t2 = blocks[j]
                if k2 == "role":
                    grp.append(Paragraph(inline(t2), S["role"]))
                    j += 1
                else:
                    grp.append(Paragraph(inline(t2), S["bullet"], bulletText="•"))
                    j += 1
                    break
            flow.append(KeepTogether(grp))
            i = j
            continue
        elif kind == "role":
            flow.append(Paragraph(inline(text), S["role"]))
        elif kind == "bullet":
            flow.append(Paragraph(inline(text), S["bullet"], bulletText="•"))
        else:
            style = "contact" if ("|" in text and i < 4) else ("summary" if i < 5 else "plain")
            flow.append(Paragraph(inline(text), S[style]))
        i += 1

    doc = SimpleDocTemplate(str(out), pagesize=A4,
                            leftMargin=margin, rightMargin=margin,
                            topMargin=margin, bottomMargin=margin * 0.8,
                            title="Yordine Chimbutane — Resume",
                            author="Yordine Salvador Matuele Chimbutane")
    pages = []
    doc.build(flow, onFirstPage=lambda c, d: pages.append(1),
              onLaterPages=lambda c, d: pages.append(1))
    return len(pages)


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_OUT
    if not src.exists():
        sys.exit(f"not found: {src}")

    blocks = read_blocks(src)
    scale = 1.00
    while scale > 0.70:
        if build(blocks, scale, out) == 1:
            print(f"{out}  — one page at scale {scale:.2f}")
            if scale < 0.90:
                print("  warning: shrinking hard. Consider cutting a bullet instead.")
            return
        scale -= 0.02
    sys.exit("could not fit on one page even at 70% — the resume is too long")


if __name__ == "__main__":
    main()

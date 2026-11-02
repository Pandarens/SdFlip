"""Builds the sample PDFs used by the demo site and the tests.

    pip install pymupdf
    python tools/make-samples.py

Everything is drawn from scratch with the 14 standard PDF fonts, so the files are tiny and free to share.
"""
import math
import os

import pymupdf

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'samples')
REPO = 'https://github.com/Pandarens/SdFlip'

INK = (0.09, 0.10, 0.16)
MUTED = (0.38, 0.41, 0.50)
PAPER = (0.985, 0.98, 0.965)
INDIGO = (0.357, 0.357, 0.965)
VIOLET = (0.62, 0.36, 0.95)
CORAL = (1.0, 0.45, 0.38)
AMBER = (1.0, 0.72, 0.25)
TEAL = (0.13, 0.72, 0.68)
NIGHT = (0.07, 0.07, 0.16)


def hexmix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def gradient(page, rect, c1, c2, vertical=False, steps=90):
    """Linear gradient as thin bands (no shading objects, renders the same everywhere)."""
    x0, y0, x1, y1 = rect
    for i in range(steps):
        t0 = i / steps
        col = hexmix(c1, c2, (i + 0.5) / steps)
        # each band runs to the far edge and the next one paints over it: no hairline seams between bands
        if vertical:
            r = pymupdf.Rect(x0, y0 + (y1 - y0) * t0, x1, y1)
        else:
            r = pymupdf.Rect(x0 + (x1 - x0) * t0, y0, x1, y1)
        page.draw_rect(r, color=None, fill=col, width=0)


def text(page, x, y, s, size=11, font='helv', color=INK):
    page.insert_text((x, y), s, fontsize=size, fontname=font, color=color)


def para(page, rect, s, size=11, font='helv', color=INK, align=0, leading=1.45):
    rc = page.insert_textbox(pymupdf.Rect(rect), s, fontsize=size, fontname=font, color=color,
                             align=align, lineheight=leading)
    assert rc >= 0, 'text overflow: ' + s[:40]


def dot(page, cx, cy, r, fill, opacity=1.0):
    page.draw_circle((cx, cy), r, color=None, fill=fill, fill_opacity=opacity, width=0)


def footer(page, num, label='SdFlip Field Guide'):
    w, h = page.rect.width, page.rect.height
    page.draw_line((48, h - 46), (w - 48, h - 46), color=(0.85, 0.85, 0.88), width=0.6)
    text(page, 48, h - 30, label, 8, 'helv', MUTED)
    s = str(num)
    text(page, w - 48 - pymupdf.get_text_length(s, 'hebo', 8), h - 30, s, 8, 'hebo', MUTED)


def chapter(page, num, kicker, title, accent):
    page.draw_rect(page.rect, color=None, fill=PAPER, width=0)
    page.draw_rect(pymupdf.Rect(0, 0, 10, page.rect.height), color=None, fill=accent, width=0)
    text(page, 48, 92, kicker.upper(), 9, 'hebo', accent)
    para(page, (46, 100, 547, 190), title, 30, 'hebo', INK, leading=1.12)
    footer(page, num)


# ---------------------------------------------------------------- field guide (portrait, outline, links)

def guide():
    doc = pymupdf.open()
    W, H = 595, 842
    pages = []
    later = []

    def new():
        p = doc.new_page(width=W, height=H)
        pages.append(p)
        return p

    # 1. cover
    p = new()
    gradient(p, p.rect, NIGHT, (0.17, 0.12, 0.42), vertical=True)
    for i in range(9):
        dot(p, 470 - i * 18, 250 + i * 24, 210 - i * 20, hexmix(INDIGO, CORAL, i / 8), 0.16 + i * 0.03)
    dot(p, 150, 640, 90, AMBER, 0.85)
    dot(p, 150, 640, 60, CORAL, 0.9)
    text(p, 56, 120, 'OPEN-SOURCE PDF FLIPBOOK', 10, 'hebo', (0.75, 0.76, 1))
    text(p, 52, 470, 'SdFlip', 86, 'hebo', (1, 1, 1))
    para(p, (56, 490, 420, 560), 'A field guide to turning pages on the web, the way paper does.', 17, 'helv', (0.86, 0.87, 0.95))
    text(p, 56, 790, 'Edition 1.0', 9, 'helv', (0.7, 0.72, 0.85))
    text(p, W - 56 - pymupdf.get_text_length('MIT License', 'helv', 9), 790, 'MIT License', 9, 'helv', (0.7, 0.72, 0.85))

    # 2. contents (filled after the chapters exist)
    new()   # contents, filled in after the chapters exist

    chapters = [
        ('Chapter 1', 'Real paper, rendered', INDIGO),
        ('Chapter 2', 'Sound you can feel', CORAL),
        ('Chapter 3', 'Made for thumbs', TEAL),
        ('Chapter 4', 'Spreads without the stretch', VIOLET),
        ('Chapter 5', 'Search, outline and links', AMBER),
        ('Chapter 6', 'Fast on slow phones', INDIGO),
        ('Chapter 7', 'Accessible by default', TEAL),
        ('Chapter 8', 'Drop it into any site', CORAL),
        ('Chapter 9', 'Options at a glance', VIOLET),
    ]

    # 3. curl
    p = new()
    chapter(p, 3, *chapters[0])
    para(p, (48, 200, 547, 330),
         'A turning page in SdFlip is not a flat card that spins on its spine. It is built from dozens of thin vertical '
         'strips nested inside each other. Every strip is tilted a few degrees more than its neighbour, so the sheet bends '
         'in a smooth arc: the free edge leads, the spine follows, exactly like a real page lifted by its corner.', 12)
    cx, cy = 300, 520
    for i in range(14):
        a = math.radians(-8 - i * 9.5)
        r0, r1 = 40 + i * 12, 52 + i * 12
        x0, y0 = cx + r0 * math.cos(a), cy + r0 * math.sin(a)
        x1, y1 = cx + r1 * math.cos(a), cy + r1 * math.sin(a)
        p.draw_line((cx, cy), (x1, y1), color=hexmix(INDIGO, CORAL, i / 13), width=3)
        dot(p, x1, y1, 4, hexmix(INDIGO, CORAL, i / 13))
    p.draw_line((80, cy), (520, cy), color=(0.8, 0.8, 0.85), width=1)
    text(p, 80, cy + 22, 'spine', 9, 'helv', MUTED)
    text(p, 452, cy - 210, 'free edge', 9, 'helv', MUTED)
    para(p, (48, 600, 547, 760),
         'Light comes from the front. The more a strip turns away from you, the darker its gradient gets, and the page '
         'casts a soft shadow on the sheet below. The whole effect is CSS 3D transforms, so the browser hands it to the '
         'GPU and it runs at full frame rate, even on a phone.', 12)

    # 4. sound
    p = new()
    chapter(p, 4, *chapters[1])
    para(p, (48, 200, 547, 300),
         'There are no audio files to download. SdFlip synthesizes the sound of paper with the Web Audio API: a whoosh '
         'of air under the sheet, the rustle of its surface, a crackle as it bends, and a soft slap when it lands.', 12)
    pts = []
    for i in range(400):
        x = 60 + i * 1.18
        env = math.exp(-((i - 140) / 70.0) ** 2) + 0.7 * math.exp(-((i - 330) / 12.0) ** 2)
        y = 470 + math.sin(i * 1.7) * math.sin(i * 0.37) * 70 * env
        pts.append((x, y))
    p.draw_polyline(pts, color=CORAL, width=1.2)
    text(p, 140, 580, 'rustle', 9, 'helv', MUTED)
    text(p, 425, 580, 'land', 9, 'helv', MUTED)
    para(p, (48, 620, 547, 760),
         'Several variants are rendered ahead of time in the background, so a flip only has to play a buffer. A fast '
         'flip sounds shorter and brighter than a slow one. Prefer your own recording? Pass soundUrl and SdFlip plays '
         'that file instead.', 12)

    # 5. mobile
    p = new()
    chapter(p, 5, *chapters[2])
    items = [
        ('Swipe', 'Drag the page with a finger: the curl follows your thumb and finishes the turn when you let go.'),
        ('Pinch', 'Two fingers zoom around the point between them, and pages re-render sharp at the new size.'),
        ('Double tap', 'Zooms in on the spot you tapped. Another double tap zooms back out.'),
        ('Rotate', 'Portrait shows one page, landscape shows a spread. The open page stays open.'),
        ('Scroll', 'An inline viewer never traps the page: vertical swipes scroll the site, horizontal ones flip.'),
    ]
    y = 220
    for k, v in items:
        dot(p, 62, y + 4, 6, TEAL)
        text(p, 80, y + 9, k, 13, 'hebo', INK)
        para(p, (80, y + 16, 547, y + 70), v, 11.5, 'helv', MUTED)
        y += 92

    # 6. spreads
    p = new()
    chapter(p, 6, *chapters[3])
    para(p, (48, 200, 547, 300),
         'Many catalogs are exported as double-width spreads. A naive viewer squeezes each one into a single page. '
         'SdFlip notices the format, splits every spread into a left and a right half, and puts the book back together '
         'so the spread opens exactly as the designer laid it out.', 12)
    p.draw_rect(pymupdf.Rect(90, 340, 330, 500), color=VIOLET, width=1.5)
    gradient(p, (92, 342, 328, 498), (0.93, 0.9, 1), (0.85, 0.8, 1))
    p.draw_line((210, 340), (210, 500), color=VIOLET, width=1, dashes='[4 3] 0')
    text(p, 152, 525, 'one PDF page, two book pages', 9, 'helv', MUTED)
    p.draw_rect(pymupdf.Rect(370, 340, 450, 500), color=VIOLET, width=1.5)
    p.draw_rect(pymupdf.Rect(460, 340, 540, 500), color=VIOLET, width=1.5)
    text(p, 400, 525, 'left', 9, 'helv', MUTED)
    text(p, 492, 525, 'right', 9, 'helv', MUTED)
    para(p, (48, 570, 547, 760),
         'Pages of a different size are fitted whole, centered with margins, never stretched. If a spread would start '
         'on the wrong side, a blank page keeps the rest aligned. Landscape slides switch the viewer to single pages.', 12)

    # 7. search, outline, links
    p = new()
    chapter(p, 7, *chapters[4])
    para(p, (48, 200, 547, 290),
         'The side panel has three tabs: page thumbnails, the outline of the PDF, and full-text search with highlighted '
         'snippets. Try it: search for the tall tower that guides ships at night - it appears on one page only.', 12)
    para(p, (48, 300, 547, 360),
         'Links inside the PDF stay clickable. Each line below is a real link:', 12)
    links = [
        ('Visit the project on GitHub', pymupdf.LINK_URI, REPO),
        ('Write an email (mailto link)', pymupdf.LINK_URI, 'mailto:hello@example.com'),
        ('Call a number (tel link)', pymupdf.LINK_URI, 'tel:+15550100'),
        ('Jump to "Options at a glance"', pymupdf.LINK_GOTO, 10),
    ]
    y = 380
    for label, kind, target in links:
        p.draw_rect(pymupdf.Rect(48, y, 547, y + 40), color=(0.92, 0.88, 0.75), fill=(1, 0.97, 0.88), width=0.8)
        text(p, 64, y + 25, label, 12, 'hebo', (0.55, 0.38, 0.0))
        link = {'kind': kind, 'from': pymupdf.Rect(48, y, 547, y + 40)}
        if kind == pymupdf.LINK_URI:
            link['uri'] = target
            p.insert_link(link)
        else:
            link['page'] = target
            later.append((len(pages) - 1, link))   # the target page does not exist yet
        y += 54

    # 8. performance
    p = new()
    chapter(p, 8, *chapters[5])
    facts = [
        ('0 ms', 'to start a flip: the next sheet is assembled while the screen is still.'),
        ('3', 'sheets kept in memory around the open page. Long catalogs never crash a phone tab.'),
        ('1x', 'canvas per page. The page you see is the rendered canvas itself, not a copy.'),
        ('60 fps', 'target. Rendering pauses while a page flies and resumes when the browser is idle.'),
    ]
    y = 220
    for big, small in facts:
        text(p, 48, y + 34, big, 34, 'hebo', INDIGO)
        para(p, (200, y + 8, 547, y + 70), small, 12, 'helv', MUTED)
        y += 110
    para(p, (48, 680, 547, 760), 'Somewhere a lighthouse keeper reads a manual like this one, flipping pages by lamplight.', 10, 'tiit', MUTED)

    # 9. accessibility
    p = new()
    chapter(p, 9, *chapters[6])
    para(p, (48, 200, 547, 420),
         'The viewer is a dialog with a proper label. Every button has a name and a keyboard shortcut. A polite live '
         'region tells screen readers which pages are open. Closing the lightbox returns focus to the link that opened '
         'it. People who ask their system for reduced motion get gentler transitions.\n\n'
         'Keyboard: Left and Right arrows flip, Home and End jump, + and - zoom, F toggles fullscreen, S toggles sound, '
         'T opens thumbnails and Esc closes.', 12)

    # 10. install
    p = new()
    chapter(p, 10, *chapters[7])
    para(p, (48, 200, 547, 250), 'Two files and one attribute. No build step, no framework, no jQuery.', 12)
    code = ('<link rel="stylesheet" href="sdflip.min.css">\n'
            '<script src="sdflip.min.js"></script>\n\n'
            '<a href="catalog.pdf" data-sdflip>Open the catalog</a>\n\n'
            '<div id="book" style="height:80vh"></div>\n'
            '<script>\n'
            "  SdFlip.inline('#book', { source: 'catalog.pdf' });\n"
            '</script>')
    p.draw_rect(pymupdf.Rect(48, 270, 547, 520), color=None, fill=NIGHT, width=0)
    para(p, (68, 290, 530, 510), code, 10.5, 'cour', (0.85, 0.88, 1), leading=1.5)
    para(p, (48, 545, 547, 760), 'pdf.js is loaded on demand from a CDN. To host it yourself, set SdFlip.defaults.pdfjs '
         'and SdFlip.defaults.pdfjsWorker, or define window.SdFlipConfig before the script loads.', 12)

    # 11. options
    p = new()
    chapter(p, 11, *chapters[8])
    rows = [('source', 'URL, File, Blob or bytes'), ('title', 'caption in the header'), ('page', 'start page'),
            ('layout', 'auto, double or single'), ('sound', 'page flip sound on or off'), ('duration', 'flip length, ms'),
            ('bend', 'curl strength, 1 to 2.2'), ('peel', 'corner lifts on hover'), ('links', 'clickable PDF links'),
            ('lang', 'en, ru or your own locale'), ('download', 'download button'), ('onFlip', 'callback on every turn')]
    y = 210
    for i, (k, v) in enumerate(rows):
        if i % 2 == 0:
            p.draw_rect(pymupdf.Rect(48, y - 4, 547, y + 26), color=None, fill=(0.95, 0.94, 0.99), width=0)
        text(p, 60, y + 15, k, 11, 'cour', VIOLET)
        text(p, 200, y + 15, v, 11, 'helv', INK)
        y += 32

    # 12. back cover
    p = new()
    gradient(p, p.rect, (0.17, 0.12, 0.42), NIGHT, vertical=True)
    for i in range(6):
        dot(p, 120 + i * 70, 300, 30 + i * 6, hexmix(TEAL, INDIGO, i / 5), 0.5)
    para(p, (56, 420, 539, 520), 'Thanks for flipping through.', 26, 'hebo', (1, 1, 1), align=1)
    para(p, (56, 520, 539, 560), REPO.replace('https://', ''), 12, 'helv', (0.75, 0.76, 1), align=1)
    p.insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(150, 515, 445, 545), 'uri': REPO})

    # contents page with internal links
    p = doc[1]
    p.draw_rect(p.rect, color=None, fill=PAPER, width=0)
    text(p, 48, 92, 'CONTENTS', 9, 'hebo', INDIGO)
    text(p, 48, 140, 'Inside this guide', 30, 'hebo', INK)
    y = 200
    for i, (kicker, title, accent) in enumerate(chapters):
        target = i + 2
        dot(p, 58, y + 10, 5, accent)
        text(p, 76, y + 15, title, 14, 'helv', INK)
        num = str(target + 1)
        text(p, 547 - pymupdf.get_text_length(num, 'hebo', 12), y + 15, num, 12, 'hebo', MUTED)
        p.draw_line((76, y + 28), (547, y + 28), color=(0.88, 0.88, 0.9), width=0.5)
        later.append((1, {'kind': pymupdf.LINK_GOTO, 'from': pymupdf.Rect(48, y - 4, 547, y + 28), 'page': target}))
        y += 52
    footer(p, 2)
    for idx, link in later:
        doc[idx].insert_link(link)

    doc.set_toc([[1, 'Cover', 1], [1, 'Contents', 2]] + [[1, t, i + 3] for i, (_, t, _a) in enumerate(chapters)] + [[1, 'Back cover', 12]])
    doc.set_metadata({'title': 'SdFlip Field Guide', 'author': 'SdFlip', 'subject': 'Sample document for SdFlip'})
    doc.save(os.path.join(OUT, 'field-guide.pdf'), garbage=4, deflate=True)


# ---------------------------------------------------------------- magazine with double-width spreads

def spreads():
    doc = pymupdf.open()
    W, H = 480, 640
    themes = [
        ('Dawn', 'Every color starts as light bending through the air.', (1, 0.62, 0.45), (0.98, 0.83, 0.55), (0.45, 0.25, 0.6)),
        ('Ocean', 'Blue is the color the sea keeps for itself.', (0.05, 0.25, 0.55), (0.2, 0.75, 0.8), (0.95, 0.98, 1)),
        ('Forest', 'Green is a thousand shades pretending to be one.', (0.08, 0.3, 0.2), (0.55, 0.8, 0.4), (0.97, 1, 0.94)),
        ('Dusk', 'At the end of the day, every color turns violet.', (0.25, 0.12, 0.45), (0.95, 0.42, 0.5), (1, 0.95, 0.97)),
    ]

    p = doc.new_page(width=W, height=H)
    gradient(p, p.rect, (0.98, 0.95, 0.9), (0.95, 0.88, 0.8), vertical=True)
    for i, t in enumerate(themes):
        dot(p, 140 + i * 66, 300, 92, t[2], 0.75)
    text(p, 40, 90, 'ISSUE 01', 10, 'hebo', (0.4, 0.3, 0.3))
    text(p, 36, 470, 'Chroma', 72, 'tibo', INK)
    para(p, (40, 490, 440, 560), 'A tiny magazine about color, laid out as double-width spreads.', 15, 'tiro', (0.35, 0.3, 0.3))

    for n, (name, line, c1, c2, fg) in enumerate(themes, 1):
        p = doc.new_page(width=W * 2, height=H)
        gradient(p, p.rect, c1, c2)
        for i in range(7):
            dot(p, 520 + i * 60, 330 + math.sin(i) * 90, 160 - i * 16, hexmix(c2, c1, i / 6), 0.25)
        # the headline runs across the gutter on purpose: the spread must line up perfectly
        text(p, 60, 120, 'SPREAD %d' % n, 10, 'hebo', fg)
        text(p, 300, 380, name, 150, 'tibo', fg)
        para(p, (60, 470, 420, 560), line, 18, 'tiro', fg)
        para(p, (560, 470, 900, 600),
             'This spread is a single PDF page twice as wide as the cover. SdFlip splits it in two and opens it as a '
             'left and a right page, so the artwork meets in the middle without a seam.', 11, 'helv', fg)
        text(p, 60, H - 30, 'Chroma', 8, 'hebo', fg)
        text(p, W * 2 - 70, H - 30, str(n * 2 + 1), 8, 'hebo', fg)

    p = doc.new_page(width=W, height=H)
    gradient(p, p.rect, (0.12, 0.1, 0.18), (0.25, 0.15, 0.3), vertical=True)
    para(p, (40, 280, 440, 380), 'Made with SdFlip', 30, 'tibo', (1, 1, 1), align=1)
    para(p, (40, 330, 440, 380), REPO.replace('https://', ''), 11, 'helv', (0.8, 0.75, 0.9), align=1)
    doc.set_metadata({'title': 'Chroma - spreads sample', 'author': 'SdFlip'})
    doc.save(os.path.join(OUT, 'chroma-spreads.pdf'), garbage=4, deflate=True)


# ---------------------------------------------------------------- landscape deck

def deck():
    doc = pymupdf.open()
    W, H = 960, 540
    slides = [
        ('Flipbooks, rebuilt', 'Why a 20-year-old idea still sells catalogs', INDIGO),
        ('People skim paper', 'A spread shows two pages at once. Readers scan, compare and come back.', CORAL),
        ('Downloads get lost', 'A PDF in the downloads folder is a PDF nobody opens again.', TEAL),
        ('The web can do it now', 'CSS 3D, Web Audio and pdf.js are in every browser. No plugin, no Flash.', VIOLET),
        ('Landscape works too', 'Slides like this one open as single pages, never squeezed into a spread.', AMBER),
        ('One script tag', 'Add two files, mark a link with data-sdflip, and every PDF on the site turns.', INDIGO),
        ('Open source', 'MIT licensed. Fork it, theme it, ship it.', TEAL),
        ('Thank you', REPO.replace('https://', ''), CORAL),
    ]
    for i, (title, sub, accent) in enumerate(slides):
        p = doc.new_page(width=W, height=H)
        if i in (0, len(slides) - 1):
            gradient(p, p.rect, NIGHT, hexmix(NIGHT, accent, 0.55))
            dot(p, 790, 270, 190, accent, 0.35)
            dot(p, 860, 160, 70, AMBER, 0.6)
            para(p, (70, 200, 700, 300), title, 54, 'hebo', (1, 1, 1))
            para(p, (72, 300, 700, 360), sub, 18, 'helv', (0.85, 0.86, 0.95))
        else:
            p.draw_rect(p.rect, color=None, fill=PAPER, width=0)
            p.draw_rect(pymupdf.Rect(0, 0, W, 8), color=None, fill=accent, width=0)
            text(p, 70, 90, '%02d' % i, 14, 'hebo', accent)
            para(p, (70, 130, 600, 260), title, 44, 'hebo', INK, leading=1.1)
            para(p, (72, 270, 560, 400), sub, 20, 'helv', MUTED)
            for k in range(5):
                dot(p, 760, 270, 150 - k * 28, hexmix(accent, PAPER, k / 5), 0.9)
        text(p, W - 90, H - 28, '%d / %d' % (i + 1, len(slides)), 9, 'helv', MUTED)
    if slides:
        doc[-1].insert_link({'kind': pymupdf.LINK_URI, 'from': pymupdf.Rect(70, 300, 700, 360), 'uri': REPO})
    doc.set_metadata({'title': 'Flipbooks, rebuilt - landscape sample', 'author': 'SdFlip'})
    doc.save(os.path.join(OUT, 'landscape-deck.pdf'), garbage=4, deflate=True)


# ---------------------------------------------------------------- mixed page sizes

def mixed():
    doc = pymupdf.open()
    sizes = [(595, 842, 'A4 portrait'), (595, 842, 'A4 portrait'), (842, 595, 'A4 landscape'), (595, 842, 'A4 portrait'),
             (420, 595, 'A5 portrait'), (595, 842, 'A4 portrait'), (612, 792, 'US Letter'), (595, 842, 'A4 portrait')]
    for i, (w, h, label) in enumerate(sizes, 1):
        p = doc.new_page(width=w, height=h)
        accent = [INDIGO, CORAL, TEAL, VIOLET, AMBER][i % 5]
        p.draw_rect(p.rect, color=None, fill=PAPER, width=0)
        p.draw_rect(pymupdf.Rect(16, 16, w - 16, h - 16), color=accent, width=3)
        dot(p, w / 2, h / 2 - 30, min(w, h) / 4, accent, 0.25)
        para(p, (40, h / 2 - 60, w - 40, h / 2), label, 28, 'hebo', INK, align=1)
        para(p, (40, h / 2, w - 40, h / 2 + 80), 'Page %d - %d x %d pt. Pages of another size are fitted with margins, never stretched.' % (i, w, h), 12, 'helv', MUTED, align=1)
    doc.set_metadata({'title': 'Mixed page sizes - sample', 'author': 'SdFlip'})
    doc.save(os.path.join(OUT, 'mixed-sizes.pdf'), garbage=4, deflate=True)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    guide()
    spreads()
    deck()
    mixed()
    for f in sorted(os.listdir(OUT)):
        print(f, os.path.getsize(os.path.join(OUT, f)) // 1024, 'KB')

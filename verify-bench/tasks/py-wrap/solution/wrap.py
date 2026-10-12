import re


def _wrap_paragraph(text, width):
    lines = []
    line = ""
    for word in text.split():
        if word.startswith(("http://", "https://")) and len(word) > width:
            if line:
                lines.append(line)
                line = ""
            lines.append(word)
            continue
        while len(word) > width:
            if line:
                lines.append(line)
                line = ""
            lines.append(word[:width])
            word = word[width:]
        if not word:
            continue
        if not line:
            line = word
        elif len(line) + 1 + len(word) <= width:
            line += " " + word
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def wrap(text, width):
    """Greedy word wrap. Blank lines separate paragraphs; other whitespace collapses.

    Words longer than width are split into width-sized chunks, except URLs.
    """
    if width < 1:
        raise ValueError("width must be >= 1")
    out = []
    for para in re.split(r"\n[ \t]*\n(?:[ \t]*\n)*", text):
        lines = _wrap_paragraph(para, width)
        if not lines:
            continue
        if out:
            out.append("")
        out.extend(lines)
    return out

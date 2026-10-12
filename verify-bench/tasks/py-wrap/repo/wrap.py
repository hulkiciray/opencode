def wrap(text, width):
    """Greedy word wrap. Whitespace (including newlines) is collapsed.

    Words longer than width are split into width-sized chunks.
    """
    if width < 1:
        raise ValueError("width must be >= 1")
    lines = []
    line = ""
    for word in text.split():
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

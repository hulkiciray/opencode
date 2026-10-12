"""Minimal INI-style config parser.

Syntax:
    key = value          # keys before any section go into the "" section
    [section]
    key = "quoted value"  ; quotes keep whitespace and comment characters
    # full-line comments start with # or ;
"""


class ConfigError(Exception):
    pass


def _strip_inline_comment(value):
    out = []
    quoted = False
    for i, ch in enumerate(value):
        if ch == '"':
            quoted = not quoted
        if not quoted and ch in "#;" and (i == 0 or value[i - 1].isspace()):
            break
        out.append(ch)
    return "".join(out).strip()


def _unquote(value):
    if len(value) >= 2 and value[0] == value[-1] == '"':
        return value[1:-1]
    return value


def parse(text):
    sections = {"": {}}
    current = ""
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line[0] in "#;":
            continue
        if line.startswith("["):
            if not line.endswith("]") or len(line) < 3:
                raise ConfigError(f"line {lineno}: bad section header")
            current = line[1:-1].strip()
            sections.setdefault(current, {})
            continue
        if "=" not in line:
            raise ConfigError(f"line {lineno}: expected key = value")
        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            raise ConfigError(f"line {lineno}: empty key")
        sections[current][key] = _unquote(_strip_inline_comment(value.strip()))
    return sections

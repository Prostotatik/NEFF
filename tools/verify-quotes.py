"""Check that every blockquote in JUDGING_CRITERIA.md is verbatim in the brief.

The file separates the organizers' words from our own inference about what they
reward. That separation is only worth anything if the quoted half really is
quoted, so this checks it rather than asking anyone to take it on trust.

The source document is git-ignored (it was handed to us, it is not ours to
publish), so this only runs where that file is present.

    python tools/verify-quotes.py
"""

import os
import re
import sys

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if not os.path.exists('Hackathon_Challenge_AI-for-Society.md'):
    print('brief not present in this checkout; nothing to verify')
    sys.exit(0)
src = open('Hackathon_Challenge_AI-for-Society.md', encoding='utf-8').read()
crit = open('JUDGING_CRITERIA.md', encoding='utf-8').read()

BACKSLASH = chr(92)


def norm(t):
    t = t.replace(BACKSLASH, '')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


nsrc = norm(src)
quotes = [l[2:] for l in crit.splitlines() if l.startswith('> ') and l.strip() != '>']
missing, ok = [], 0
for q in quotes:
    if q.startswith('—') or q.startswith('**Reading'):
        continue
    n = norm(q)
    if len(n) < 25:
        continue
    if n in nsrc:
        ok += 1
    else:
        missing.append(q[:120])

print('quoted lines checked :', ok + len(missing))
print('verbatim in source   :', ok)
print('NOT found            :', len(missing))
for m in missing:
    print('   -', m)
sys.exit(1 if missing else 0)

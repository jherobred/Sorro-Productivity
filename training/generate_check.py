"""Checks for the training data generator. Run: python training/generate_check.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from datetime import date
from dates import resolve_day

assert resolve_day('tomorrow', date(2026, 12, 31)) == date(2027, 1, 1)
assert resolve_day('in 3 days', date(2026, 2, 27)) == date(2026, 3, 2)
assert resolve_day('on friday', date(2026, 11, 6)) == date(2026, 11, 13)   # a Friday: the next one
assert resolve_day('next monday', date(2026, 11, 5)) == date(2026, 11, 9)
assert resolve_day('on the 3rd', date(2026, 11, 20)) == date(2026, 12, 3)
assert resolve_day('on the 25th', date(2026, 11, 20)) == date(2026, 11, 25)
assert resolve_day('november 30', date(2026, 12, 1)) == date(2027, 11, 30)   # a past date means next year

# Generate once into a temp dir and check what came out.
import json
import re
import tempfile
from collections import Counter

import generate

OUT = tempfile.mkdtemp()
generate.main(['--seed', '7', '--out', OUT])
HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = json.load(open(os.path.join(HERE, 'tools.json'), encoding='utf-8'))


def load(name):
    with open(os.path.join(OUT, f'{name}.jsonl'), encoding='utf-8') as f:
        return [json.loads(line) for line in f]


rows = load('router.train')
routes = Counter(r['expect']['route'] for r in rows)
assert min(routes.values()) / len(rows) > 0.28, routes
assert all(r['messages'][-1]['content'].startswith('chat: ') for r in rows if r['expect']['route'] == 'chat')
actor = load('actor.train')
assert len(actor) >= 3500, len(actor)
assert {r['expect']['name'] for r in actor} == {t['name'] for t in TOOLS}
assert all(re.fullmatch(r'[0-9a-f-]{36}', r['expect']['arguments']['id']) for r in actor if r['expect']['name'] == 'complete_task')

chk = load('checker.train')
wrong = [r for r in chk if r['expect']['verdict'] == 'wrong']
assert 0.36 < len(wrong) / len(chk) < 0.44, len(wrong) / len(chk)
assert {r['expect']['kind'] for r in wrong} == {'date', 'id', 'list', 'tz'}
assert all(r['messages'][-1]['content'].startswith('wrong: ') for r in wrong)
assert all(r['messages'][-1]['content'] == 'ok' for r in chk if r['expect']['verdict'] == 'ok')
for name in ('router', 'actor', 'checker'):
    train_users = {m['content'] for r in load(f'{name}.train') for m in r['messages'] if m['role'] == 'user'}
    ev = load(f'{name}.eval')
    assert 150 <= len(ev) <= 300, (name, len(ev))
    clash = [m['content'] for r in ev for m in r['messages'] if m['role'] == 'user' and m['content'] in train_users]
    assert not clash, (name, clash[:3])

# I3: the checker sees today's weekday, so "on thursday" can be checked.
assert all(re.match(r'Today: \d{4}-\d\d-\d\d [A-Z][a-z]+day \(', r['messages'][1]['content']) for r in chk)
# I5: eval titles, events, topics and snippets are never trained on.
def slot_values(rows):
    # Free-text slots only; list, notebook and place names are the user's fixed names and stay shared.
    return {v for r in rows for k, v in r['expect']['arguments'].items() if k in ('title', 'query', 'body', 'text')}
assert not (slot_values(load('actor.eval')) & slot_values(actor)), sorted(slot_values(load('actor.eval')) & slot_values(actor))[:5]
# I6: a paraphrase that drops a slot or changes the date phrase is thrown away.
assert generate.keeps_slots('remind me to Fix bike tire next friday', 'pls remind me to Fix bike tire next friday', {'title': 'Fix bike tire'})
assert not generate.keeps_slots('remind me to Fix bike tire next friday', 'remind me to fix the bike next friday', {'title': 'Fix bike tire'})
assert not generate.keeps_slots('remind me to Fix bike tire next friday', 'remind me to Fix bike tire this friday', {'title': 'Fix bike tire'})

print('ok')

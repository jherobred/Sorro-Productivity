"""Day phrases a user types, and the real day each one means. Stdlib only."""
import random
import re
from datetime import date, timedelta

WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
PHRASES = ['today', 'tomorrow', 'in {n} days', 'next {weekday}', 'on {weekday}', 'on the {nth}', '{month} {day}']


def ordinal(n: int) -> str:
    suffix = 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suffix}'


def _valid(y: int, m: int, d: int) -> date | None:
    try:
        return date(y, m, d)
    except ValueError:
        return None


def resolve_day(phrase: str, today: date) -> date:
    p = phrase.strip().lower()
    if p == 'today':
        return today
    if p == 'tomorrow':
        return today + timedelta(days=1)
    if m := re.fullmatch(r'in (\d+) days?', p):
        return today + timedelta(days=int(m[1]))
    if m := re.fullmatch(r'(?:next|on) (\w+)', p):
        if m[1] in WEEKDAYS:
            # The next such day, today excluded.
            ahead = (WEEKDAYS.index(m[1]) - today.weekday()) % 7 or 7
            return today + timedelta(days=ahead)
    if m := re.fullmatch(r'on the (\d+)(?:st|nd|rd|th)', p):
        day = int(m[1])
        # This month if the day is still ahead (today counts), else the next month that has it.
        y, mo = today.year, today.month
        for _ in range(13):
            d = _valid(y, mo, day)
            if d and d >= today:
                return d
            y, mo = (y + 1, 1) if mo == 12 else (y, mo + 1)
    if m := re.fullmatch(r'(\w+) (\d+)', p):
        if m[1] in MONTHS:
            mo, day = MONTHS.index(m[1]) + 1, int(m[2])
            # A past date means next year.
            for y in (today.year, today.year + 1, today.year + 4):
                d = _valid(y, mo, day)
                if d and d >= today:
                    return d
    raise ValueError(f'Unknown day phrase: {phrase}')


def render(template: str, today: date, rng: random.Random) -> tuple[str, date]:
    """Fills one PHRASES template with random values; returns the phrase and the day it means."""
    phrase = template.format(
        n=rng.randint(2, 10),
        weekday=rng.choice(WEEKDAYS),
        nth=ordinal(rng.randint(1, 28)),
        month=rng.choice(MONTHS),
        day=rng.randint(1, 28),
    )
    return phrase, resolve_day(phrase, today)

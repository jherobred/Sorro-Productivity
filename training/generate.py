"""
Builds the training and eval data for Sorro's three local models from templates.
Stdlib only. Run: python training/generate.py [--seed 7] [--out training/data] [--paraphrase]

Writes {router,actor,checker}.{train,eval}.jsonl and prompts.json. Each line is
{"messages": [...], "expect": {...}}. Eval files use only eval templates (every
fifth template of each pool) and their own seed, so no eval sentence is trained on.
"""
import argparse
import json
import os
import random
import sys
import urllib.request
import uuid
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dates import PHRASES, WEEKDAYS, render  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = json.load(open(os.path.join(HERE, 'tools.json'), encoding='utf-8'))
FOX_VOICE = json.load(open(os.path.join(HERE, 'voice.json'), encoding='utf-8'))['FOX_VOICE']

PROMPTS = {
    'ROUTER_SYSTEM': 'You are the router inside Sorro, a notes, calendar and tasks app. Reply with exactly one of: '
                     '"read" for questions about tasks, events, notes or news; "write" for adding, completing or changing them; '
                     'or "chat: " followed by one short playful line for anything else.',
    'ACTOR_SYSTEM': 'You are Sorro, the assistant inside the user\'s notes, calendar and tasks app. Today is {today} ({weekday}), '
                    'time zone {tz} (UTC{offset}). Use the tools to read and change their data; never invent ids, take them from tool results. '
                    'Confirm what you changed in one short sentence. ' + FOX_VOICE,
    'CHECKER_SYSTEM': 'You check a change Sorro is about to make. Reply "ok" if the call does exactly what the request asks, '
                      'or "wrong: " and one short reason.',
}

ZONES = ['Asia/Manila', 'Asia/Singapore', 'America/New_York']


def _nth_sunday(year: int, month: int, n: int) -> date:
    d = date(year, month, 1)
    d += timedelta(days=(6 - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def offset(tz: str, day: date, hour: int = 12) -> str:
    """UTC offset as +08:00 / -05:00. Manila and Singapore have no DST; New York uses the US rule (2 a.m. switches)."""
    if tz != 'America/New_York':
        return '+08:00'
    start, end = _nth_sunday(day.year, 3, 2), _nth_sunday(day.year, 11, 1)
    dst = (start < day < end) or (day == start and hour >= 2) or (day == end and hour < 2)
    return '-04:00' if dst else '-05:00'


TITLES = ['Finish CS 191 problem set', 'Email Prof. Santos', 'Return library books', 'Draft thesis outline', 'Buy groceries',
          'Pay electric bill', 'Read chapter 7', 'Submit lab report', 'Call the dentist', 'Clean my room', 'Renew passport',
          'Practice guitar', 'Review normal forms', 'Book flight to Cebu', 'Fix bike tire', 'Water the plants', 'Update resume',
          'Study for the networking quiz', 'Print the reviewer', 'Send the org minutes', 'Do laundry', 'Back up my laptop',
          'Reply to Mia', 'Plan the Japan trip', 'Write the reflection paper', 'Prepare slides for IT 222', 'Cancel gym trial',
          'Order a new charger', 'Fill out the scholarship form', 'Meal prep for the week']
LISTS = ['School', 'Work', 'Home', 'Errands', 'Gym']
NOTEBOOKS = ['CS 191', 'Thesis', 'Journal', 'Recipes', 'IT 222']
TOPICS = ['algorithms', 'thesis', 'normal forms', 'networking', 'budget', 'recipes', 'japan trip', 'subnetting', 'linked lists', 'interview prep']
EVENTS = ['Standup', 'Thesis meeting', 'Dentist', 'Gym session', 'Study group', 'Call with Mom', 'Lab', 'Org meeting', 'Coffee with Ana', 'Consultation']
PLACES = ['the library', 'Room 304', 'Starbucks', 'Zoom', 'the gym', 'the clinic']
SNIPPETS = ['remember the base case', 'ask about the deadline', 'buy eggs too', 'BCNF needs every determinant to be a key',
            'use /26 for 64 hosts', 'flight leaves 6am', 'cite the 2024 paper', 'redo question 4']

QUIPS = [
    'Hey yourself. Want me to pull up today?', 'Always here. Mostly awake.', 'You are welcome. Put it on my tab.',
    'Bold of you to say hi before checking your overdue list.', 'Noted. Emotionally, not in your notes.', 'Same, honestly.',
    'I am a fox in an app. I have seen things.', 'Good morning to you and your seven open tabs.', 'Thanks accepted. Snacks preferred.',
    'I would high five you but paws.', 'You and me against the to-do list.', 'Rest is productive too. Do not tell anyone I said that.',
    'Hi. Your tasks missed you. I did not.', 'Ask me anything. Except math at 3am.', 'I live here. Rent free.',
    'Strong opinion, respectfully ignored.', 'Love that energy. Point it at a task?', 'Ha. Okay, that one got me.',
    'I am doing great, thanks for asking. Nobody asks the fox.', 'Night owl? I am more of a night fox.', 'Fair.',
    'Deep breath. One thing at a time.', 'You got this. Probably. Mostly.', 'I support you. Your deadlines do not.',
    'Coffee first, then conquest.', 'Bye for now. I will guard your notes.', 'See you. Do not forget the thing.',
    'Happy to help. It is literally my whole job.', 'Wow, compliments. Write that down. I can, actually.', 'Big mood.',
    'I am not crying, it is just dust in the app.', 'Stretch. Water. Back to it.', 'Hello, human with potential.',
    'I am a fox of few words. These are some.', 'That is the spirit.', 'Okay, but have you eaten?',
    'Respectfully, go to sleep.', 'Weekend mode detected.', 'Monday again. We survive.', 'A fox never forgets. Mostly.',
    'Cheers. Now go ship something.', 'That sounds rough. Want me to clear your evening?', 'Proud of you, quietly.',
    'Hi hi. What are we doing today?', 'I heard my name. Or I imagined it.', 'Thank you for choosing Sorro. I am legally a fox.',
    'Noted with a tiny tail wag.', 'You make this look easy.', 'One more task and then a break. Deal?',
    'Snack break approved.', 'I like you. Do not tell the others.', 'That is above my pay grade, which is zero.',
    'I can only help with tasks, notes and plans. And vibes.', 'Fair question. Fox answer: maybe.', 'Hmm. Bold.',
    'Same time tomorrow?', 'Your streak called. It wants attention.', 'I am rooting for you from the corner.',
    'Okay, chaos goblin. What is first?', 'Logging that under things I love to hear.', 'Go touch some grass, then come back.',
]


def split(pool):
    """Every fifth template is held out for eval."""
    return [t for i, t in enumerate(pool) if i % 5], [t for i, t in enumerate(pool) if i % 5 == 0]


def pick_today(rng: random.Random) -> date:
    start = date(2026, 1, 1)
    d = start + timedelta(days=rng.randrange(730))
    if rng.random() < 0.3:  # month ends, Dec 31 and Feb 28 show up often
        nxt = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
        d = nxt - timedelta(days=rng.randint(1, 3))
    return d


def new_id(rng: random.Random) -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def clock(rng: random.Random) -> tuple[str, int, int]:
    h, m = rng.randint(7, 21), rng.choice([0, 0, 30])
    label = f'{(h - 1) % 12 + 1}{":30" if m else ""}{"am" if h < 12 else "pm"}'
    return label, h, m


def iso(day: date, h: int, m: int, tz: str) -> str:
    return f'{day.isoformat()}T{h:02d}:{m:02d}:00{offset(tz, day, h)}'


def call(name, args):
    return {'role': 'assistant', 'content': '', 'tool_calls': [{'type': 'function', 'function': {'name': name, 'arguments': args}}]}


def tool(name, result):
    return {'role': 'tool', 'name': name, 'content': json.dumps(result)}


def fake_tasks(rng, keep=None, n=3, today=None):
    rows = [{'id': new_id(rng), 'title': t, 'due_on': (today + timedelta(days=rng.randint(-3, 5))).isoformat() if today and rng.random() < 0.7 else None}
            for t in rng.sample(TITLES, n)]
    if keep:
        rows[rng.randrange(n)] = {'id': new_id(rng), 'title': keep, 'due_on': None}
    return rows


# ---------------------------------------------------------------- router

ROUTER_READ = ["what's due {when}?", 'do I have anything {when}', 'show me my overdue tasks', "what's on my calendar {when}",
               'find my notes on {topic}', 'any news today?', 'when am I free {when}?', 'what did I write about {topic}',
               'how many tasks are left this week', 'is anything overdue?', 'list my tasks', 'what meetings do I have {when}',
               'read me the digest', 'do I have a free hour {when}', 'where are my {topic} notes', "what's my week look like",
               'what tasks are on my School list', 'did I finish {title}?', 'any events {when}?', 'search notes for {topic}']
ROUTER_WRITE = ['add {title} {when}', 'remind me to {title} {when}', 'mark {title} as done', 'schedule {event} {when} at {time}',
                'write a note about {topic}', "add '{snippet}' to my {topic} note", 'put {title} on my {list} list',
                'I finished {title}', 'book {event} {when} at {time}', 'new task: {title}', 'create a note called {topic}',
                'tick off {title}', 'add {event} to my calendar {when}', 'note this down: {snippet}', 'high priority: {title}',
                'set up {event} {when} at {time} at {place}', 'done with {title}', 'jot down {snippet} in my {topic} note',
                'add a task to {title}', 'make an event {event} {when}']
ROUTER_CHAT = ['hi', 'hello', 'hey sorro', 'good morning', 'thanks', 'thank you!', 'you are the best', 'lol', 'how are you?',
               "i'm so tired", 'good night', 'bye', 'what are you?', 'are you a fox?', "i'm bored", 'tell me a joke',
               'ugh mondays', 'you rock', 'ok', 'nice', 'i did it!!', 'who made you?', "i'm stressed", 'yo', 'sup',
               'haha', 'love you sorro', 'what is the meaning of life', 'nevermind', 'cool cool', 'wish me luck',
               'i hate exams', "it's friday", 'brb', 'do you sleep?', 'can you dance?', 'thanks fox', 'hmm', 'gm', 'gn']


def fill(t: str, rng: random.Random, today: date) -> str:
    when, _ = render(rng.choice(PHRASES), today, rng)
    return t.format(when=when, topic=rng.choice(TOPICS), title=rng.choice(TITLES).lower(), event=rng.choice(EVENTS),
                    time=clock(rng)[0], snippet=rng.choice(SNIPPETS), list=rng.choice(LISTS), place=rng.choice(PLACES))


def router_rows(rng, pools, n):
    rows = []
    for i in range(n):
        route = ['read', 'write', 'chat'][i % 3]
        user = fill(rng.choice(pools[route]), rng, pick_today(rng))
        if route == 'chat' and rng.random() < 0.3:
            user = rng.choice(['', 'ok ', 'hey ', 'umm ']) + user + rng.choice(['', '!', ' :)', '...'])
        target = f'chat: {rng.choice(QUIPS)}' if route == 'chat' else route
        rows.append({'messages': [{'role': 'system', 'content': PROMPTS['ROUTER_SYSTEM']}, {'role': 'user', 'content': user},
                                  {'role': 'assistant', 'content': target}], 'expect': {'route': route}})
    return rows


# ---------------------------------------------------------------- actor
# Each template returns (user message, conversation after it, index of the expected call in the full messages).

def a_create_task(rng, today, tz, phr):
    title = rng.choice(TITLES)
    when, day = render(rng.choice(PHRASES), today, rng)
    args = {'title': title, 'due_on': day.isoformat()}
    if '{list}' in phr:
        args['list'] = rng.choice(LISTS)
    if '{prio}' in phr:
        args['priority'] = 'high'
    # The title as the user typed it is the title the model must copy.
    user = phr.format(title=title, when=when, list=args.get('list', ''), prio='')
    tid = new_id(rng)
    return user, [call('create_task', args), tool('create_task', {'id': tid, 'title': title, 'due_on': args['due_on']}),
                  {'role': 'assistant', 'content': f'Added "{title}" for {args["due_on"]}. Clock is ticking.'}], 0


def a_list_tasks(rng, today, tz, phr):
    rng_range = phr[1]
    rows = fake_tasks(rng, n=rng.randint(1, 4), today=today)
    names = ', '.join(r['title'] for r in rows)
    return phr[0], [call('list_tasks', {'range': rng_range}), tool('list_tasks', {'today': today.isoformat(), 'tasks': rows}),
                    {'role': 'assistant', 'content': f'You have {len(rows)}: {names}. Pick one, I believe in you.'}], 0


def a_complete_task(rng, today, tz, phr):
    title = rng.choice(TITLES)
    rows = fake_tasks(rng, keep=title, n=rng.randint(2, 5))
    target = next(r for r in rows if r['title'] == title)
    return phr.format(title=title.lower()), [
        call('list_tasks', {'range': 'all'}), tool('list_tasks', {'today': today.isoformat(), 'tasks': rows}),
        call('complete_task', {'id': target['id']}), tool('complete_task', {'id': target['id'], 'title': title}),
        {'role': 'assistant', 'content': f'Done: "{title}". Look at you go.'}], 2


def a_create_event(rng, today, tz, phr):
    ev = rng.choice(EVENTS)
    when, day = render(rng.choice(PHRASES), today, rng)
    label, h, m = clock(rng)
    length = 60
    if '{mins}' in phr:
        length = rng.choice([30, 45, 90, 120])
    end = datetime(day.year, day.month, day.day, h, m) + timedelta(minutes=length)
    args = {'title': ev, 'starts_at': iso(day, h, m, tz), 'ends_at': iso(end.date(), end.hour, end.minute, tz)}
    if '{place}' in phr:
        args['location'] = rng.choice(PLACES)
    user = phr.format(event=ev, when=when, time=label, mins=length, place=args.get('location', ''))
    return user, [call('create_event', args), tool('create_event', {'id': new_id(rng), 'title': ev, 'starts_at': args['starts_at']}),
                  {'role': 'assistant', 'content': f'{ev} is on the calendar for {day.isoformat()} at {label}. Be there or be square.'}], 0


def a_list_events(rng, today, tz, phr):
    if phr.endswith('{week}'):
        user, a, b = phr.replace(' {week}', ''), today, today + timedelta(days=6)
    else:
        when, a = render(rng.choice(PHRASES), today, rng)
        user, b = phr.format(when=when), a
    evs = [{'id': new_id(rng), 'title': e, 'starts_at': iso(a, 9 + i * 2, 0, tz)} for i, e in enumerate(rng.sample(EVENTS, rng.randint(0, 3)))]
    reply = f'{len(evs)} thing(s): ' + ', '.join(e['title'] for e in evs) + '.' if evs else 'Nothing booked. Suspiciously free.'
    return user, [call('list_events', {'from': a.isoformat(), 'to': b.isoformat()}), tool('list_events', {'events': evs}),
                  {'role': 'assistant', 'content': reply}], 0


def a_find_free_time(rng, today, tz, phr):
    when, day = render(rng.choice(PHRASES), today, rng)
    mins, label = rng.choice([(30, '30 minutes'), (60, 'an hour'), (90, '90 minutes'), (120, 'two hours'), (45, '45 minutes')])
    return phr.format(when=when, length=label), [
        call('find_free_time', {'date': day.isoformat(), 'minutes': mins}),
        tool('find_free_time', {'date': day.isoformat(), 'free': ['09:00-11:00', '15:30-18:00']}),
        {'role': 'assistant', 'content': f'Free on {day.isoformat()} from 09:00 to 11:00 and 15:30 to 18:00. Claim it before chaos does.'}], 0


def a_search_notes(rng, today, tz, phr):
    topic = rng.choice(TOPICS)
    notes = [{'id': new_id(rng), 'title': f'{topic.title()} notes', 'excerpt': rng.choice(SNIPPETS)}]
    return phr.format(topic=topic), [call('search_notes', {'query': topic}), tool('search_notes', {'notes': notes}),
                                     {'role': 'assistant', 'content': f'Found "{notes[0]["title"]}": {notes[0]["excerpt"]}.'}], 0


def a_create_note(rng, today, tz, phr):
    topic, snip = rng.choice(TOPICS), rng.choice(SNIPPETS)
    args = {'title': topic.title(), 'body': snip}
    if '{notebook}' in phr:
        args['notebook'] = rng.choice(NOTEBOOKS)
    user = phr.format(title=topic.title(), body=snip, notebook=args.get('notebook', ''))
    return user, [call('create_note', args), tool('create_note', {'id': new_id(rng), 'title': args['title']}),
                  {'role': 'assistant', 'content': f'Wrote "{args["title"]}". Future you says thanks.'}], 0


def a_append_note(rng, today, tz, phr):
    topic, snip = rng.choice(TOPICS), rng.choice(SNIPPETS)
    nid = new_id(rng)
    notes = [{'id': nid, 'title': f'{topic.title()} notes', 'excerpt': '...'}]
    return phr.format(topic=topic, text=snip), [
        call('search_notes', {'query': topic}), tool('search_notes', {'notes': notes}),
        call('append_note', {'id': nid, 'text': snip}), tool('append_note', {'id': nid, 'title': notes[0]['title']}),
        {'role': 'assistant', 'content': f'Added it to "{notes[0]["title"]}".'}], 2


def a_read_news(rng, today, tz, phr):
    args = {} if 'yesterday' not in phr else {'date': (today - timedelta(days=1)).isoformat()}
    return phr, [call('read_news', args), tool('read_news', {'date': args.get('date', today.isoformat()), 'segments': [{'kind': 'tech', 'title': 'Morning tech', 'items': ['A new phone launched']}]}),
                 {'role': 'assistant', 'content': 'Tech: a new phone launched. Riveting stuff.'}], 0


ACTOR = {
    'create_task': (a_create_task, ['add {title} {when}', 'remind me to {title} {when}', 'add {title} to {list} {when}', 'new task: {title}, due {when}',
                                    'put {title} on my {list} list, due {when}', '{prio}{title} {when}, high priority', 'I need to {title} {when}',
                                    'can you add "{title}" for {when}', 'task: {title} {when}', 'please remind me {when} to {title}']),
    'list_tasks': (a_list_tasks, [("what's due today?", 'today'), ('what do I have this week', 'week'), ('anything overdue?', 'overdue'),
                                   ('show me all my tasks', 'all'), ('what are my tasks for today', 'today'), ('list everything that is late', 'overdue'),
                                   ('what is left this week?', 'week'), ('all open tasks please', 'all'), ('today\'s to-do?', 'today'), ('what did I fall behind on', 'overdue')]),
    'complete_task': (a_complete_task, ['mark {title} as done', 'I finished {title}', 'tick off {title}', 'done with {title}',
                                        'complete {title}', '{title} is done', 'check off {title} please', 'finally did {title}',
                                        'you can cross out {title}', 'set {title} to done']),
    'create_event': (a_create_event, ['schedule {event} {when} at {time}', 'book {event} {when} at {time} at {place}', 'add {event} to my calendar {when} at {time}',
                                      '{event} {when} at {time} for {mins} minutes', 'put {event} on {when} at {time}', 'set up {event} {when}, {time}',
                                      'calendar: {event} {when} {time}', 'I have {event} {when} at {time} at {place}', 'new event {event} {when} at {time}, {mins} min',
                                      'block {time} {when} for {event}']),
    'list_events': (a_list_events, ["what's on my calendar {when}", 'do I have meetings {when}', "what's on this week {week}", 'any events {when}?',
                                    'show my schedule {when}', 'what am I doing {when}', 'calendar for the week {week}', 'am I busy {when}',
                                    'events {when}?', "what's planned {when}"]),
    'find_free_time': (a_find_free_time, ['when am I free {when} for {length}?', 'find me {length} {when}', 'do I have {length} free {when}',
                                          'any gap of {length} {when}?', 'I need {length} {when}, when works', 'free slot {when}, {length}',
                                          'where can I fit {length} {when}', 'find time {when} for {length} of study', 'is there {length} open {when}',
                                          'when could I squeeze in {length} {when}']),
    'search_notes': (a_search_notes, ['find my notes on {topic}', 'what did I write about {topic}', 'search notes for {topic}',
                                      'where are my {topic} notes', 'look up {topic} in my notes', 'pull up {topic}', 'notes about {topic}?',
                                      'do I have anything on {topic}', 'open my {topic} notes', 'show {topic} notes']),
    'create_note': (a_create_note, ['write a note called {title}: {body}', 'new note "{title}" saying {body}', 'make a note in {notebook} called {title}: {body}',
                                    'note titled {title}: {body}', 'create a page {title} in {notebook} with {body}', 'jot down a note {title}, {body}',
                                    'save a note {title}: {body}', 'start a new page {title} that says {body}', 'add a note to {notebook}: {title}, {body}',
                                    'write {body} in a new note called {title}']),
    'append_note': (a_append_note, ["add '{text}' to my {topic} note", 'append {text} to the {topic} notes', 'put {text} at the end of my {topic} note',
                                    'add this to {topic}: {text}', 'in my {topic} note add {text}', 'note in {topic}: {text}',
                                    'tack {text} onto my {topic} notes', 'update {topic} notes with {text}', 'jot {text} in my {topic} note',
                                    'stick {text} into the {topic} page']),
    'read_news': (a_read_news, ['any news today?', "what's in my digest", "what was yesterday's news", 'read me the news', 'news please',
                                'what did Grok send today', 'catch me up on the news', "show me yesterday's digest", 'what is new today', 'headlines?']),
}


def actor_rows(rng, use_eval, n):
    rows, names = [], list(ACTOR)
    for i in range(n):
        name = names[i % len(names)]
        fn, pool = ACTOR[name]
        train_pool, eval_pool = split(pool)
        phr = rng.choice(eval_pool if use_eval else train_pool)
        today, tz = pick_today(rng), rng.choice(ZONES)
        user, convo, at = fn(rng, today, tz, phr)
        system = PROMPTS['ACTOR_SYSTEM'].format(today=today.isoformat(), weekday=WEEKDAYS[today.weekday()].title(), tz=tz, offset=offset(tz, today))
        messages = [{'role': 'system', 'content': system}, {'role': 'user', 'content': user}] + convo
        fc = convo[at]['tool_calls'][0]['function']
        rows.append({'messages': messages, 'expect': {'name': fc['name'], 'arguments': fc['arguments'], 'at': at + 2}, 'meta': {'today': today.isoformat(), 'tz': tz}})
    return rows


# ---------------------------------------------------------------- checker
# Built from actor write traces: 60% the right call, 40% wrong in one of four ways.

CAN_BREAK = {
    'date': ('create_task', 'create_event'),
    'id': ('complete_task', 'append_note'),
    'list': ('create_task', 'create_note'),
    'tz': ('create_event',),
}
WRITE_TOOLS = sorted({t for ts in CAN_BREAK.values() for t in ts})


def known_ids(row):
    for m in row['messages']:
        if m['role'] == 'tool' and m['name'] in ('list_tasks', 'search_notes'):
            body = json.loads(m['content'])
            return [(x['id'], x['title']) for x in body.get('tasks', body.get('notes', []))]
    return []


def shift_iso(value: str, days: int) -> str:
    day = date.fromisoformat(value[:10]) + timedelta(days=days)
    return day.isoformat() + value[10:]


def break_call(kind, name, args, row, rng):
    a = dict(args)
    tz = row['meta']['tz']
    if kind == 'date':
        d = rng.choice([-1, 1])
        if name == 'create_task':
            right, a['due_on'] = a['due_on'], (date.fromisoformat(a['due_on']) + timedelta(days=d)).isoformat()
            return a, f'Due {a["due_on"]}, but they asked for {right}.'
        right = a['starts_at'][:10]
        a['starts_at'], a['ends_at'] = shift_iso(a['starts_at'], d), shift_iso(a['ends_at'], d)
        return a, f'It starts on {a["starts_at"][:10]}, but they asked for {right}.'
    if kind == 'id':
        others = [i for i, _ in known_ids(row) if i != a['id']]
        a['id'] = rng.choice(others) if others and rng.random() < 0.5 else new_id(rng)
        what = 'task' if name == 'complete_task' else 'note'
        return a, f'That id is not the {what} they named.'
    if kind == 'list':
        key, pool = ('list', LISTS) if name == 'create_task' else ('notebook', NOTEBOOKS)
        a[key] = rng.choice([x for x in pool if x != a.get(key)])
        return a, f'They never mentioned the {a[key]} {"list" if key == "list" else "notebook"}.'
    if kind == 'tz':
        if rng.random() < 0.5:
            a['starts_at'], a['ends_at'] = a['starts_at'][:19], a['ends_at'][:19]
            return a, f'The times have no offset for {tz}.'
        right = a['starts_at'][19:]
        bad = '-05:00' if right == '+08:00' else '+08:00'
        a['starts_at'], a['ends_at'] = a['starts_at'][:19] + bad, a['ends_at'][:19] + bad
        return a, f'The offset {bad} is wrong for {tz}.'
    raise ValueError(kind)


def checker_rows(rng, actor, n):
    by_tool = {t: [r for r in actor if r['expect']['name'] == t] for t in WRITE_TOOLS}
    kinds = list(CAN_BREAK)
    rows = []
    for i in range(n):
        wrong = i % 5 in (1, 3)  # 40%
        kind = kinds[(i // 5) % len(kinds)] if wrong else None
        name = rng.choice(CAN_BREAK[kind] if wrong else WRITE_TOOLS)
        row = rng.choice(by_tool[name])
        args = row['expect']['arguments']
        reason = ''
        if wrong:
            args, reason = break_call(kind, name, args, row, rng)
        user = next(m['content'] for m in row['messages'] if m['role'] == 'user')
        ids = ', '.join(f'{i}: {t}' for i, t in known_ids(row)) or 'none'
        prompt = (f'Today: {row["meta"]["today"]} ({row["meta"]["tz"]})\n'
                  f'Request: {user}\n'
                  f'Known ids: {ids}\n'
                  f'Call: {name} {json.dumps(args, ensure_ascii=False)}')
        rows.append({'messages': [{'role': 'system', 'content': PROMPTS['CHECKER_SYSTEM']}, {'role': 'user', 'content': prompt},
                                  {'role': 'assistant', 'content': f'wrong: {reason}' if wrong else 'ok'}],
                     'expect': {'verdict': 'wrong' if wrong else 'ok', 'kind': kind}})
    return rows


# ---------------------------------------------------------------- paraphrase (optional)

def paraphrase(rows, rng, share=0.3):
    key = os.environ.get('GEMINI_API_KEY')
    if not key:
        print('paraphrase: no GEMINI_API_KEY, skipped')
        return rows
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'
    for r in rows:
        if rng.random() > share:
            continue
        user = next(m for m in r['messages'] if m['role'] == 'user')
        body = json.dumps({'contents': [{'role': 'user', 'parts': [{'text': 'Rewrite this message the way a student might type it. Keep every name, date, '
                                                                              f'time and quoted text exactly. Reply with the message only.\n{user["content"]}'}]}]}).encode()
        try:
            req = urllib.request.Request(url, body, {'Content-Type': 'application/json', 'x-goog-api-key': key})
            text = json.load(urllib.request.urlopen(req, timeout=20))['candidates'][0]['content']['parts'][0]['text'].strip()
            if text:
                user['content'] = text
        except Exception as e:  # keep the template line on any failure
            print('paraphrase failed once:', e)
    return rows


# ---------------------------------------------------------------- main

def write(out, name, rows):
    with open(os.path.join(out, f'{name}.jsonl'), 'w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--out', default=os.path.join(HERE, 'data'))
    ap.add_argument('--paraphrase', action='store_true')
    a = ap.parse_args(argv)
    os.makedirs(a.out, exist_ok=True)
    pools = {k: split(v) for k, v in (('read', ROUTER_READ), ('write', ROUTER_WRITE), ('chat', ROUTER_CHAT))}
    for split_name, seed, n_router, n_actor in (('train', a.seed, 3000, 4000), ('eval', a.seed + 1000, 210, 210)):
        rng = random.Random(seed)
        use_eval = split_name == 'eval'
        router = router_rows(rng, {k: v[1 if use_eval else 0] for k, v in pools.items()}, n_router)
        actor = actor_rows(rng, use_eval, n_actor)
        if a.paraphrase and not use_eval:
            router, actor = paraphrase(router, rng), paraphrase(actor, rng)
        write(a.out, f'router.{split_name}', router)
        write(a.out, f'actor.{split_name}', actor)
        write(a.out, f'checker.{split_name}', checker_rows(random.Random(seed + 1), actor, 210 if use_eval else 3000))
    with open(os.path.join(a.out, 'prompts.json'), 'w', encoding='utf-8') as f:
        json.dump(PROMPTS, f, indent=2)
    print(f'wrote data to {a.out}')


if __name__ == '__main__':
    main()

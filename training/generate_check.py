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

print('ok')

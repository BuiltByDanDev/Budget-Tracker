from datetime import date

from app.reporting.monthly import pay_month

FIRST_AND_SIXTEENTH = [1, 16]


def test_without_pay_days_pay_counts_in_the_month_it_was_posted():
    assert pay_month(date(2026, 7, 31), []) == date(2026, 7, 1)


def test_pay_posted_just_before_the_first_counts_in_the_next_month():
    # August 1st 2026 is a Saturday, so the pay arrives on Friday July 31st.
    assert pay_month(date(2026, 7, 31), FIRST_AND_SIXTEENTH) == date(2026, 8, 1)


def test_pay_posted_on_or_after_a_pay_day_stays_in_its_month():
    assert pay_month(date(2026, 7, 1), FIRST_AND_SIXTEENTH) == date(2026, 7, 1)
    assert pay_month(date(2026, 7, 3), FIRST_AND_SIXTEENTH) == date(2026, 7, 1)
    assert pay_month(date(2026, 7, 15), FIRST_AND_SIXTEENTH) == date(2026, 7, 1)


def test_pay_due_at_a_month_end_and_posted_late_counts_in_the_month_before():
    # Paid on the last day of the month; February's arrives on March 2nd.
    assert pay_month(date(2026, 3, 2), [31]) == date(2026, 2, 1)


def test_a_pay_day_a_month_does_not_have_is_its_last_day():
    # The 31st does not exist in June, so June 30th is the Pay Day itself.
    assert pay_month(date(2026, 6, 30), [15, 31]) == date(2026, 6, 1)


def test_pay_moves_across_a_year_end():
    assert pay_month(date(2026, 12, 31), FIRST_AND_SIXTEENTH) == date(2027, 1, 1)

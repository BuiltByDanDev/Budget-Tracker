# Pay counts in the Month of its nearest Pay Day

Every other Transaction belongs to the Month of its posting date. Pay is the exception: when the User has set Pay Days (for Daniel, the 1st and 16th), a Pay Transaction counts in the Month of the Pay Day nearest its posting date. Pay due on the 1st is deposited on the last working day of the month before whenever the 1st is a weekend or holiday, which gave one Month three paycheques and the next Month one, and made the Savings Rate of both meaningless.

## Considered Options

- **Move each paycheque by hand**: exact, but the User has to notice and fix every shifted paycheque, several times a year.
- **Edit the posting date**: simplest to report on, but the date is part of how a re-imported row is recognised as a duplicate, and it would no longer match the bank.

## Consequences

The shift is worked out when figures are read, from `posted_on` and the Pay Days; nothing is stored per Transaction, so changing the Pay Days re-places all Pay at once. The Transactions list still filters and totals by posting date, so its Pay total for a date range can differ from the Dashboard's for the same Month. An off-cycle payment marked as Pay near a month end (a bonus on the 29th) moves too; a by-hand override would be the way to fix that if it comes up.

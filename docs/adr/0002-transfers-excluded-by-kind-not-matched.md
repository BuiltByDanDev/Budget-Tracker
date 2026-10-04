# Transfers are excluded by Kind, not matched across Accounts

Money moved between the User's own Accounts appears in two CSVs (a card payment leaves chequing and arrives on the card). We mark each side as a Transfer on its own, by Rule or by hand, and leave Transfers out of Spending and Income. We do not pair the two sides into one linked record.

## Considered Options

- **Match both sides**: more accurate and would allow balance reconciliation, but needs matching logic and a story for the side that has not been imported yet.
- **Drop transfers at import**: simplest, but a wrong guess is lost for good.

## Consequences

A Transfer that no Rule catches is counted as an Expense or Income until it is corrected in the Review Inbox, so spending can be overstated right after a first import.

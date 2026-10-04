# Transactions follow the Rules as they are now

Every Transaction the User has not classified by hand is kept in step with the Rules. Whenever a Rule is added, changed or deleted, all of those Transactions are checked again: each takes its best matching Rule, recorded in `rule_id`, or goes back to how an Import leaves it when nothing matches. Before this, a Rule only ran on Transactions with no Category, so a Rule could not be corrected after the fact and a more specific Rule (gas by amount) could not take over from a general one.

## Considered Options

- **Rules only affect new Transactions**: predictable, but editing a Rule would leave its past Transactions disagreeing with it, and the Rules page would show history instead of the current state.
- **Show whatever matches, without recording the Rule**: no new column, but it cannot tell "this Rule classified it" from "the User did", so an edit could not safely update anything.

## Consequences

Deleting or narrowing a Rule sends its Transactions back to the Review Inbox. A classification can only be made permanent by setting it by hand. Each Rule change reads every Transaction of the User that is not set by hand, which is fine for one person's history and would need narrowing for very large ones.

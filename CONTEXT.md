# Budgeting

Tracks one person's money in and out, from bank CSV exports, so they can see where it goes each month.

## Language

### People and accounts

**User**:
The person whose money is being tracked. Owns every other record, and never sees another User's.
_Avoid_: Owner, member, household

**Account**:
A bank account or card that the User exports CSVs from.
_Avoid_: Bank, source, wallet

**CSV Mapping**:
An Account's saved description of its bank's CSV layout: which columns hold the date, description and amount, and how money out is signed.
_Avoid_: Template, preset, profile

**Import**:
One CSV file uploaded for an Account, and the Transactions it added.
_Avoid_: Upload, batch, statement

### Transactions

**Transaction**:
One movement of money on an Account, taken from one row of a CSV.
_Avoid_: Entry, line, record

**Kind**:
What a Transaction is: an Expense, Income or a Transfer.
_Avoid_: Type, direction

**Expense**:
A Transaction that counts towards Spending. Usually money out.
_Avoid_: Purchase, debit, charge

**Income**:
Money in that was earned or received, such as pay or interest.
_Avoid_: Credit, deposit

**Transfer**:
Money moved between the User's own Accounts, including a credit card payment. Never counts towards Spending or Income.
_Avoid_: Payment, internal movement

**Refund**:
An Expense with money coming in. It reduces Spending in its Category.
_Avoid_: Return, reversal, credit

**Unconverted Amount**:
A Transaction whose amount was read from the CSV's other-currency column and that the User has not yet converted or chosen to keep. It counts at the amount as written until then.
_Avoid_: Flagged transaction, foreign transaction, USD transaction

**Description**:
The text the bank wrote for a Transaction, kept exactly as exported.
_Avoid_: Memo, payee, name

**Merchant**:
The clean name of who a Transaction was with, as opposed to the bank's Description.
_Avoid_: Payee, vendor, store

### Classifying

**Category**:
What an Expense was for, such as Groceries or Housing. One flat list per User; an Expense has at most one.
_Avoid_: Tag, label, group, subcategory

**Importance**:
How necessary an Expense was. One of Essential, Have to Have, Nice to Have or Shouldn't Have.
_Avoid_: Priority, necessity, need/want

**Essential**:
Survival and legal obligations: rent, groceries, insurance.

**Have to Have**:
Not survival, but committed or sorely missed if cut: phone plan, car payment.
_Avoid_: Committed

**Nice to Have**:
Chosen and enjoyed, and could be cut.

**Shouldn't Have**:
Spending the User wishes they had not done.
_Avoid_: Regret

**Rule**:
A standing instruction that Transactions whose Description contains given text get a given Kind, Category, Importance and Merchant.
_Avoid_: Filter, matcher, auto-categorisation

**Review Inbox**:
The Expenses that have no Category yet.
_Avoid_: Uncategorised list, queue, pending

### Measuring

**Month**:
A calendar month. A Transaction belongs to the Month of its posting date.
_Avoid_: Period, cycle, pay period

**Spending**:
The total of Expenses over some set of Transactions, with Refunds subtracted.
_Avoid_: Money out, outgoings, costs

**Spending Limit**:
The most the User intends to spend in total in a Month.
_Avoid_: Budget, threshold, cap

**Category Target**:
The most the User intends to spend in one Category in a Month.
_Avoid_: Budget, envelope, allowance

**Savings Rate**:
The share of a Month's Income left after Spending.

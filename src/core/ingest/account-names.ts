export function bankAccount(id: string): string {
  return `Assets:Bank:${id}`;
}

export function cardAccount(id: string): string {
  return `Liabilities:CreditCard:${id}`;
}

export function expenseAccount(category: string): string {
  return `Expense:${category}`;
}

export function incomeAccount(category: string): string {
  return `Income:${category}`;
}

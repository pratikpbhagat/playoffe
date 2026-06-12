/** Formats a paise amount as an INR currency string, e.g. 29900 -> "₹299". */
export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

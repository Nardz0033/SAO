const blockedTerms = [
  /\bass(?:hole|holes)\b/i,
  /\bbastard(?:s)?\b/i,
  /\bbitch(?:es)?\b/i,
  /\bblowjob\b/i,
  /\bcock(?:s)?\b/i,
  /\bcunt(?:s)?\b/i,
  /\bfuck(?:er|ers|ing|ed|s)?\b/i,
  /\bmotherfucker(?:s)?\b/i,
  /\bnigger(?:s)?\b/i,
  /\bprick(?:s)?\b/i,
  /\bpussy\b/i,
  /\bshit(?:ty|ting|s)?\b/i,
  /\bslut(?:s)?\b/i,
  /\bwhore(?:s)?\b/i,
]

export function containsInappropriateChat(text: string): boolean {
  return blockedTerms.some((term) => term.test(text))
}

/**
 * Utility functions for Arabic text processing
 */

/**
 * Removes Arabic diacritics (tashkeel) from text
 */
export function removeDiacritics(text: string): string {
  // Arabic diacritics Unicode ranges
  return text.replace(/[\u064B-\u065F\u0670]/g, "")
}

/**
 * Normalizes different forms of Alif
 */
export function normalizeAlif(text: string): string {
  // Replace Alif with hamza above (أ), Alif with hamza below (إ),
  // and Alif with madda above (آ) with plain Alif (ا)
  return text.replace(/[أإآ]/g, "ا")
}

/**
 * Removes punctuation from Arabic text
 */
export function removePunctuation(text: string): string {
  // Arabic punctuation marks
  return text.replace(/[،؛؟.:!،؛؟]/g, "")
}

/**
 * Normalizes Arabic text by removing diacritics, normalizing alif, and removing punctuation
 */
export function normalizeArabicText(text: string): string {
  return removePunctuation(normalizeAlif(removeDiacritics(text)))
}

/**
 * Calculates the similarity between two Arabic texts
 * Returns a value between 0 and 1, where 1 means identical
 */
export function calculateSimilarity(text1: string, text2: string): number {
  // Normalize both texts
  const normalizedText1 = normalizeArabicText(text1)
  const normalizedText2 = normalizeArabicText(text2)

  // Simple character-level similarity using Levenshtein distance
  const distance = levenshteinDistance(normalizedText1, normalizedText2)
  const maxLength = Math.max(normalizedText1.length, normalizedText2.length)

  // Convert distance to similarity score (0-1)
  return maxLength === 0 ? 1 : 1 - distance / maxLength
}

/**
 * Calculates the Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length

  // Create a matrix of size (m+1) x (n+1)
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  // Initialize the first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost, // substitution
      )
    }
  }

  return dp[m][n]
}

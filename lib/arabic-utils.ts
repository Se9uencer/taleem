/**
 * Utility functions for Arabic text processing
 */

import type { Surah } from "@/types";

/**
 * Removes Arabic diacritics (tashkeel) from text
 */
export function removeDiacritics(text: string): string {
  return text.replace(/[-\u065F\u0670]/g, "");
}

/**
 * Normalizes different forms of Alif
 */
export function normalizeAlif(text: string): string {
  return text.replace(/[أإآ]/g, "ا");
}

/**
 * Removes punctuation from Arabic text
 */
export function removePunctuation(text: string): string {
  return text.replace(/[،؛؟.:!،؛؟]/g, "");
}

/**
 * Normalizes Arabic text by removing diacritics, normalizing alif, and removing punctuation
 */
export function normalizeArabicText(text: string): string {
  return removePunctuation(normalizeAlif(removeDiacritics(text)));
}

/**
 * Calculates the similarity between two Arabic texts
 * Returns a value between 0 and 1, where 1 means identical
 */
export function calculateSimilarity(text1: string, text2: string): number {
  const normalizedText1: string = normalizeArabicText(text1);
  const normalizedText2: string = normalizeArabicText(text2);
  const distance: number = levenshteinDistance(normalizedText1, normalizedText2);
  const maxLength: number = Math.max(normalizedText1.length, normalizedText2.length);
  return maxLength === 0 ? 1 : 1 - distance / maxLength;
}

/**
 * Calculates the Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m: number = str1.length;
  const n: number = str2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost: number = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[m][n];
}

export function isFigmaUrl(url) {
  return /figma\.com\/(proto|design|file)|embed\.figma\.com\/proto/i.test(url || "");
}

/**
 * LinkedIn's Posts API stores `commentary` in their "Little Text Format". Any
 * reserved character that appears as plain text must be backslash-escaped, or
 * the parser silently truncates the commentary at the first unmatched reserved
 * sequence (e.g. a `(` is interpreted as the start of a MentionElement URN).
 *
 * Spec:
 *   https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/little-text-format
 *
 * Reserved characters from the Text grammar:
 *   \  |  {  }  @  [  ]  (  )  <  >  #  *  _  ~
 */

const RESERVED = /[\\|{}@\[\]()<>#*_~]/g;

export function escapeLittleTextFormat(text: string): string {
  return text.replace(RESERVED, (c) => `\\${c}`);
}

/**
 * Render a single hashtag using the explicit HashtagTemplate syntax so it's
 * never confused with plain `#` in escaped body text. The tag name itself
 * does not require escaping (it's matched by `Text` in the grammar, but our
 * tags are restricted to word characters at the source).
 */
export function hashtagTemplate(tag: string): string {
  return `{hashtag|\\#|${tag.replace(/^#+/, '')}}`;
}

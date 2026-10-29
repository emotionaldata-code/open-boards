import italian from './it.json' with { type: 'json' };

const translations: Readonly<Record<string, string>> = italian;

/** Display copy only: never translate identifiers, commands, player names or saved definitions. */
export function contentText(text: string): string;
export function contentText(text: string | undefined): string | undefined;
export function contentText(text: string | undefined): string | undefined {
  if (!text) return text;
  if (Object.hasOwn(translations, text)) return translations[text];
  // Repeated allies and tokens append their number to the authored name.
  const numbered = /^(.+) (\d+)$/.exec(text);
  if (numbered && Object.hasOwn(translations, numbered[1]))
    return `${translations[numbered[1]]} ${numbered[2]}`;
  return text;
}

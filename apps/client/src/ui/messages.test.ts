import { expect, it } from 'vitest';
import { messageText } from './messages';

it('translates public prompts while keeping names and card values intact', () => {
  expect(messageText('Use Gaze of Stone')).toBe('Usa Sguardo di pietra');
  expect(messageText('Discard 1 card')).toBe('Scarta 1 carta');
  expect(messageText('Discard up to 3 cards from Luca’s hand')).toBe(
    'Scarta fino a 3 carte dalla mano di Luca',
  );
  expect(messageText('Choose cards to reveal (2/4)')).toBe('Scegli carte da rivelare (2/4)');
  expect(messageText('Choose where to teleport Medusa')).toBe('Scegli dove teletrasportare Medusa');
  expect(messageText('Username or password is incorrect.')).toBe('Nome utente o password errati.');
});

it('preserves imported content without a translation instead of changing fragments', () => {
  expect(messageText('An unknown card')).toBe('An unknown card');
  expect(messageText('An unknown card: Use Space 2')).toBe('An unknown card: Use Space 2');
});
